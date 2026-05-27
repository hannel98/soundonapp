"""SoundMesh backend test suite - covers auth, content, profile, gamification."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or "https://661fe965-626d-4fcf-8fc6-acf8c69cf087.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def fresh_user(client):
    """Create a fresh signup user for the session."""
    email = f"TEST_{uuid.uuid4().hex[:10]}@sound.app"
    pw = "password123"
    r = client.post(f"{API}/auth/signup", json={"email": email, "password": pw, "display_name": "Tester"})
    assert r.status_code == 201, f"signup failed: {r.status_code} {r.text}"
    data = r.json()
    return {"email": email, "password": pw, "token": data["access_token"], "user": data["user"]}


@pytest.fixture(scope="session")
def auth_headers(fresh_user):
    return {"Authorization": f"Bearer {fresh_user['token']}"}


# ---------- Health ----------
class TestHealth:
    def test_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ---------- Auth ----------
class TestAuth:
    def test_signup_returns_token_and_user(self, fresh_user):
        assert fresh_user["token"]
        u = fresh_user["user"]
        assert u["email"] == fresh_user["email"]
        assert "user_id" in u and u["user_id"].startswith("user_")
        assert "local" in u["providers"]

    def test_signup_duplicate_rejected(self, client, fresh_user):
        r = client.post(f"{API}/auth/signup", json={
            "email": fresh_user["email"], "password": "password123"})
        assert r.status_code == 400

    def test_signup_short_password(self, client):
        r = client.post(f"{API}/auth/signup", json={
            "email": f"TEST_{uuid.uuid4().hex[:8]}@sound.app", "password": "abc"})
        assert r.status_code == 400

    def test_login_success(self, client, fresh_user):
        r = client.post(f"{API}/auth/login", json={
            "email": fresh_user["email"], "password": fresh_user["password"]})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["access_token"]
        assert data["user"]["email"] == fresh_user["email"]

    def test_login_bad_password(self, client, fresh_user):
        r = client.post(f"{API}/auth/login", json={
            "email": fresh_user["email"], "password": "wrongwrong"})
        assert r.status_code == 401

    def test_me_with_token(self, client, auth_headers, fresh_user):
        r = client.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == fresh_user["email"]

    def test_me_without_token(self, client):
        r = requests.get(f"{API}/auth/me")  # bare request - no Authorization
        assert r.status_code == 401

    def test_me_invalid_token(self, client):
        r = client.get(f"{API}/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
        assert r.status_code == 401

    def test_google_session_invalid(self, client):
        r = client.post(f"{API}/auth/google/session", json={"session_id": "invalid_session_xyz"})
        # Should not authenticate against Emergent and either 401 or 502
        assert r.status_code in (401, 502)

    def test_logout(self, client, auth_headers):
        r = client.post(f"{API}/auth/logout", headers=auth_headers)
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # JWT not invalidated by logout (only session_token), so /me still works
        r2 = client.get(f"{API}/auth/me", headers=auth_headers)
        assert r2.status_code == 200


# ---------- Content ----------
class TestContent:
    def test_artists_list(self, client):
        r = client.get(f"{API}/artists")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 10, f"expected 10 seeded artists, got {len(data)}"
        for a in data:
            assert "_id" not in a
            assert {"id", "name", "handle", "image_url"}.issubset(a.keys())

    def test_artists_featured_filter(self, client):
        r = client.get(f"{API}/artists", params={"featured": "true"})
        assert r.status_code == 200
        data = r.json()
        assert all(a["featured"] for a in data)
        assert len(data) >= 1

    def test_artist_by_id(self, client):
        r = client.get(f"{API}/artists/tremayne")
        assert r.status_code == 200
        assert r.json()["name"] == "Tremayne"

    def test_artist_404(self, client):
        r = client.get(f"{API}/artists/no_such_artist")
        assert r.status_code == 404

    def test_tracks(self, client):
        r = client.get(f"{API}/tracks")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_beats(self, client):
        r = client.get(f"{API}/beats")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_videos(self, client):
        r = client.get(f"{API}/videos")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        assert "youtube_id" in data[0]

    def test_news(self, client):
        r = client.get(f"{API}/news")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_trending(self, client):
        r = client.get(f"{API}/trending")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        # Sorted by plays desc
        plays = [t["plays"] for t in data]
        assert plays == sorted(plays, reverse=True)


# ---------- Profile / Gamification ----------
class TestProgress:
    def test_progress_initial(self, client, auth_headers):
        r = client.get(f"{API}/me/progress", headers=auth_headers)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["sound_balance"] == 0
        assert p["streak"] == 0
        assert p["multiplier"] == 1.0

    def test_claim_daily_first(self, client, auth_headers):
        r = client.post(f"{API}/me/claim-daily", headers=auth_headers)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["sound_balance"] == 10, f"expected balance 10, got {p['sound_balance']}"
        assert p["streak"] == 1
        assert p["last_claim_at"]

    def test_claim_daily_second_blocked(self, client, auth_headers):
        r = client.post(f"{API}/me/claim-daily", headers=auth_headers)
        assert r.status_code == 400


class TestStatuses:
    def test_create_status_and_list(self, client, auth_headers):
        text = f"TEST status {uuid.uuid4().hex[:6]}"
        r = client.post(f"{API}/me/statuses", headers=auth_headers, json={"text": text})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["text"] == text
        assert body["id"]

        # Create a second status to verify ordering
        time.sleep(0.05)
        text2 = f"TEST status2 {uuid.uuid4().hex[:6]}"
        r2 = client.post(f"{API}/me/statuses", headers=auth_headers, json={"text": text2})
        assert r2.status_code == 200

        r3 = client.get(f"{API}/me/statuses", headers=auth_headers)
        assert r3.status_code == 200
        items = r3.json()
        assert len(items) >= 2
        # Sorted desc by created_at => newest first
        assert items[0]["text"] == text2
