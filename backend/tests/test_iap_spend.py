"""Tests for $SOUND token spend wiring per new pricing tier.
Covers /api/iap/spend, /api/iap/catalog, /api/iap/subscription,
plus /api/me/tracks (no auto-credit) and /api/albums (cost 2).
"""
from __future__ import annotations

import os
import base64
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio


BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL/EXPO_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

# Direct DB access for setup/verification
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def db():
    # Load backend .env so DB_NAME/MONGO_URL match
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    return client[db_name]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(scope="module")
def fresh_user():
    """Register a fresh user (starts with 50 $SOUND via ensure_progress)."""
    email = f"TEST_iap_{int(time.time())}_{uuid.uuid4().hex[:6]}@example.com"
    password = "Test12345!"
    r = requests.post(f"{API}/auth/signup", json={
        "email": email, "password": password, "display_name": "IAP Tester",
    }, timeout=15)
    assert r.status_code == 201, f"signup failed: {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["access_token"], "user_id": data["user"]["user_id"], "email": email}


@pytest.fixture
def auth_headers(fresh_user):
    return {"Authorization": f"Bearer {fresh_user['token']}"}


async def _get_balance(db, user_id: str) -> int:
    doc = await db.progress.find_one({"user_id": user_id}, {"_id": 0, "sound_balance": 1})
    return (doc or {}).get("sound_balance", 0)


async def _set_balance(db, user_id: str, amount: int):
    await db.progress.update_one(
        {"user_id": user_id}, {"$set": {"sound_balance": amount}}, upsert=True
    )


# ---------------- Catalog ----------------
class TestCatalog:
    def test_catalog_token_costs_and_pro_perks(self):
        r = requests.get(f"{API}/iap/catalog", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "token_costs" in data, data
        tc = data["token_costs"]
        assert tc.get("upload_music") == 1
        assert tc.get("ai_album_cover") == 2
        assert tc.get("go_live") == 3
        assert "pro_perks" in data and isinstance(data["pro_perks"], list)
        assert len(data["pro_perks"]) > 0


# ---------------- Spend actions ----------------
class TestSpendActions:
    @pytest.mark.parametrize("action,cost", [
        ("upload_music", 1),
        ("ai_album_cover", 2),
        ("go_live", 3),
    ])
    def test_spend_each_action_debits_balance_and_writes_ledger(
        self, db, fresh_user, auth_headers, action, cost
    ):
        user_id = fresh_user["user_id"]
        # Top up to a known balance
        _run(_set_balance(db, user_id, 100))
        bal_before = _run(_get_balance(db, user_id))
        assert bal_before == 100

        r = requests.post(
            f"{API}/iap/spend",
            json={"action": action, "ref": {"t": "test"}},
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 200, f"{action}: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("ok") is True
        assert body.get("cost") == cost
        assert body.get("pro") is False
        assert body.get("balance") == bal_before - cost

        bal_after = _run(_get_balance(db, user_id))
        assert bal_after == bal_before - cost

        # Ledger entry must exist
        entry = _run(db.token_ledger.find_one(
            {"user_id": user_id, "action": action, "delta": -cost},
            sort=[("created_at", -1)],
        ))
        assert entry is not None, f"no token_ledger entry for {action}"
        assert entry.get("balance") == bal_after
        assert entry.get("pro") is False

    def test_unknown_action_returns_400(self, auth_headers):
        r = requests.post(
            f"{API}/iap/spend", json={"action": "do_a_barrel_roll"},
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 400
        assert "Unknown action" in (r.json().get("detail") or "")

    def test_insufficient_balance_returns_402(self, db, fresh_user, auth_headers):
        user_id = fresh_user["user_id"]
        _run(_set_balance(db, user_id, 0))
        r = requests.post(
            f"{API}/iap/spend", json={"action": "go_live"},
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 402, f"expected 402 got {r.status_code} {r.text}"
        detail = (r.json() or {}).get("detail") or ""
        assert "Not enough $SOUND" in detail, f"detail mismatch: {detail!r}"

    def test_spend_requires_auth(self):
        r = requests.post(f"{API}/iap/spend", json={"action": "upload_music"}, timeout=15)
        assert r.status_code == 401


# ---------------- Pro user perks ----------------
class TestProPerks:
    def test_pro_user_gets_free_upload_and_ai_album(self, db, fresh_user, auth_headers):
        user_id = fresh_user["user_id"]
        _run(_set_balance(db, user_id, 100))
        # Insert active subscription
        future = datetime.now(timezone.utc) + timedelta(days=30)
        _run(db.subscriptions.update_one(
            {"user_id": user_id},
            {"$set": {
                "user_id": user_id, "tier": "pro", "product_id": "pro_monthly",
                "platform": "ios", "expires_at": future,
                "updated_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        ))
        try:
            bal_before = _run(_get_balance(db, user_id))
            for action in ("upload_music", "ai_album_cover"):
                r = requests.post(
                    f"{API}/iap/spend", json={"action": action},
                    headers=auth_headers, timeout=15,
                )
                assert r.status_code == 200, f"{action}: {r.text}"
                body = r.json()
                assert body.get("ok") is True
                assert body.get("cost") == 0
                assert body.get("pro") is True
                # balance is None for pro response per current implementation
            # Balance unchanged
            assert _run(_get_balance(db, user_id)) == bal_before

            # go_live is NOT in PRO_UNLIMITED -> still debited
            r = requests.post(
                f"{API}/iap/spend", json={"action": "go_live"},
                headers=auth_headers, timeout=15,
            )
            assert r.status_code == 200
            body = r.json()
            assert body.get("cost") == 3
            assert body.get("pro") is False
        finally:
            _run(db.subscriptions.delete_one({"user_id": user_id}))


# ---------------- Subscription endpoint ----------------
class TestSubscriptionEndpoint:
    def test_no_subscription_returns_active_false(self, db, fresh_user, auth_headers):
        user_id = fresh_user["user_id"]
        _run(db.subscriptions.delete_one({"user_id": user_id}))
        r = requests.get(f"{API}/iap/subscription", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("active") is False


# ---------------- /me/tracks no auto-credit ----------------
class TestTracksNoReward:
    def test_upload_track_no_sound_award(self, db, fresh_user, auth_headers):
        user_id = fresh_user["user_id"]
        _run(_set_balance(db, user_id, 42))
        # Build a small valid-ish base64 payload (>1024 bytes raw)
        payload = base64.b64encode(b"\x00" * 4096).decode("ascii")
        body = {
            "title": "TEST_track",
            "genre": "Test",
            "mime": "audio/mpeg",
            "duration_s": 1,
            "audio_b64": payload,
            "source": "upload",
            "is_beat": False,
        }
        r = requests.post(f"{API}/me/tracks", json=body, headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("sound_awarded") == 0
        # Returned balance equals db balance, untouched by upload
        bal_db = _run(_get_balance(db, user_id))
        assert data.get("balance") == bal_db == 42
        # Cleanup
        track_id = data["track"]["id"]
        requests.delete(f"{API}/me/tracks/{track_id}", headers=auth_headers, timeout=15)


# ---------------- /albums charges 2 $SOUND ----------------
class TestAlbumsCost:
    def test_create_album_debits_two_or_one_on_image_fail(self, db, fresh_user, auth_headers):
        user_id = fresh_user["user_id"]
        _run(_set_balance(db, user_id, 50))
        bal_before = _run(_get_balance(db, user_id))
        r = requests.post(
            f"{API}/albums",
            json={
                "name": "TEST_album",
                "theme": "neon synthwave",
                "track_titles": ["Intro", "Drive"],
                "style": "modern, vibrant",
            },
            headers=auth_headers, timeout=90,
        )
        # If LLM key not configured, route raises 503 - acceptable, skip
        if r.status_code == 503:
            pytest.skip(f"LLM not configured: {r.text}")
        assert r.status_code == 200, r.text
        bal_after = _run(_get_balance(db, user_id))
        diff = bal_before - bal_after
        # Either full charge (2) or half-refund (effective net 1) on image failure
        assert diff in (1, 2), f"expected debit of 1 or 2, got {diff} (before={bal_before}, after={bal_after})"
