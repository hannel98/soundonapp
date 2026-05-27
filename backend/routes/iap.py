"""In-App Purchase validation router (Apple StoreKit + Google Play Billing).

For MVP this implements:
- Catalog endpoint listing SKUs to display in the storefront
- Validate endpoint that:
  * On iOS: trusts the StoreKit 2 transaction id and credits tokens (with a
    receipt persisted for audit). Real App Store Server API validation needs
    APPLE_KEY_ID / APPLE_ISSUER_ID / APPLE_PRIVATE_KEY to be supplied later.
  * On Android: trusts the purchase token and credits tokens. Real Google Play
    Developer API validation needs GOOGLE_SERVICE_ACCOUNT_JSON to be set.

When Apple/Google credentials are not configured, we operate in *receipt-trust*
mode (still server-side, idempotent, audited) so dev builds can be tested. The
code automatically upgrades to full server-side verification when keys are
present.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/iap", tags=["iap"])

# SKU mapping. Keep server-side - the client must not be trusted for grants.
TOKEN_PACKS = {
    "sound_tokens_100": {"tokens": 100, "price": "$0.99", "label": "Starter Pack"},
    "sound_tokens_500": {"tokens": 500, "price": "$3.99", "label": "Boost Pack"},
    "sound_tokens_1200": {"tokens": 1200, "price": "$7.99", "label": "Pro Pack"},
    "sound_tokens_5000": {"tokens": 5000, "price": "$24.99", "label": "Studio Pack"},
}
SUBSCRIPTIONS = {
    "pro_monthly": {"price": "$4.99/mo", "duration_days": 30, "label": "SoundMesh Pro"},
}


class ValidateBody(BaseModel):
    platform: str  # 'ios' or 'android'
    product_id: str
    transaction_id: Optional[str] = None
    purchase_token: Optional[str] = None  # Android purchase token
    receipt: Optional[str] = None  # Optional iOS receipt (b64)
    is_subscription: bool = False


def register(api_router: APIRouter, dependencies: dict):
    resolve_user = dependencies["resolve_user"]
    db = dependencies["db"]
    credit_tokens = dependencies["credit_tokens"]

    @router.get("/catalog")
    async def catalog():
        return {
            "token_packs": [
                {"product_id": pid, **info} for pid, info in TOKEN_PACKS.items()
            ],
            "subscriptions": [
                {"product_id": pid, **info} for pid, info in SUBSCRIPTIONS.items()
            ],
        }

    @router.post("/validate")
    async def validate(body: ValidateBody, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        platform = body.platform.lower()
        if platform not in ("ios", "android"):
            raise HTTPException(status_code=400, detail="platform must be ios or android")
        # Resolve product
        is_sub = body.is_subscription or body.product_id in SUBSCRIPTIONS
        product = SUBSCRIPTIONS.get(body.product_id) if is_sub else TOKEN_PACKS.get(body.product_id)
        if not product:
            raise HTTPException(status_code=400, detail="Unknown product_id")

        # Idempotency key: per platform + identifier
        tx_key = body.transaction_id or body.purchase_token
        if not tx_key:
            raise HTTPException(status_code=400, detail="transaction_id or purchase_token required")
        existing = await db.iap_transactions.find_one({"platform": platform, "tx_key": tx_key})
        if existing:
            return {
                "ok": True,
                "already_processed": True,
                "granted": existing.get("granted", {}),
                "balance": existing.get("balance"),
            }

        # === Server-side verification gate ===
        # For now: trust the platform receipt if credentials missing (so dev builds work)
        # Apple App Store Server API + Google Play Developer API verification are
        # plugged in here once the required keys are populated in .env.
        verified = True
        verify_method = "trust"
        if platform == "ios" and os.environ.get("APPLE_KEY_ID") and os.environ.get("APPLE_PRIVATE_KEY"):
            verified = await _verify_apple(body)
            verify_method = "apple_server_api"
        elif platform == "android" and os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON"):
            verified = await _verify_google(body)
            verify_method = "google_play_api"

        if not verified:
            raise HTTPException(status_code=400, detail="Receipt verification failed")

        granted = {}
        new_balance = None
        if not is_sub:
            tokens = product["tokens"]
            credited = await credit_tokens(
                user["user_id"], int(tokens), "iap_purchase",
                {"product_id": body.product_id, "platform": platform, "tx_key": tx_key},
            )
            new_balance = credited["progress"]["sound_balance"]
            granted = {"tokens": tokens}
        else:
            days = product.get("duration_days", 30)
            expires = datetime.now(timezone.utc) + timedelta(days=days)
            await db.subscriptions.update_one(
                {"user_id": user["user_id"]},
                {"$set": {
                    "user_id": user["user_id"],
                    "tier": "pro",
                    "product_id": body.product_id,
                    "platform": platform,
                    "expires_at": expires,
                    "updated_at": datetime.now(timezone.utc),
                }},
                upsert=True,
            )
            granted = {"subscription": "pro", "expires_at": expires.isoformat()}

        await db.iap_transactions.insert_one({
            "user_id": user["user_id"],
            "platform": platform,
            "product_id": body.product_id,
            "tx_key": tx_key,
            "transaction_id": body.transaction_id,
            "purchase_token": body.purchase_token,
            "is_subscription": is_sub,
            "granted": granted,
            "balance": new_balance,
            "verify_method": verify_method,
            "created_at": datetime.now(timezone.utc),
        })
        return {"ok": True, "already_processed": False, "granted": granted, "balance": new_balance, "verify_method": verify_method}

    @router.get("/subscription")
    async def my_subscription(authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        sub = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0})
        if not sub:
            return {"active": False}
        exp = sub.get("expires_at")
        if isinstance(exp, datetime):
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            active = exp > datetime.now(timezone.utc)
            sub["expires_at"] = exp.isoformat()
        else:
            active = False
        if isinstance(sub.get("updated_at"), datetime):
            sub["updated_at"] = sub["updated_at"].isoformat()
        return {"active": active, **sub}

    api_router.include_router(router)


async def _verify_apple(body: ValidateBody) -> bool:
    """Verify with Apple App Store Server API when keys are configured.
    Returns True if receipt is valid.
    """
    try:
        import jwt
        import httpx
        key_id = os.environ.get("APPLE_KEY_ID")
        issuer_id = os.environ.get("APPLE_ISSUER_ID")
        private_key = os.environ.get("APPLE_PRIVATE_KEY", "").replace("\\n", "\n")
        bundle = os.environ.get("IAP_BUNDLE_ID", "com.soundmesh.app")
        if not (key_id and issuer_id and private_key and body.transaction_id):
            return False
        now = int(time.time())
        token = jwt.encode(
            {"iss": issuer_id, "iat": now, "exp": now + 600,
             "aud": "appstoreconnect-v1", "bid": bundle},
            private_key,
            algorithm="ES256",
            headers={"kid": key_id, "alg": "ES256", "typ": "JWT"},
        )
        # Try prod first; fall back to sandbox
        async with httpx.AsyncClient(timeout=15) as c:
            for base in ("https://api.storekit.itunes.apple.com",
                         "https://api.storekit-sandbox.itunes.apple.com"):
                r = await c.get(
                    f"{base}/inApps/v1/transactions/{body.transaction_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if r.status_code == 200:
                    return True
        return False
    except Exception:
        return False


async def _verify_google(body: ValidateBody) -> bool:
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        key_path = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
        if not key_path or not body.purchase_token:
            return False
        creds = service_account.Credentials.from_service_account_file(
            key_path,
            scopes=["https://www.googleapis.com/auth/androidpublisher"],
        )
        service = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
        package = os.environ.get("IAP_BUNDLE_ID", "com.soundmesh.app")
        if body.is_subscription or body.product_id in SUBSCRIPTIONS:
            res = service.purchases().subscriptions().get(
                packageName=package, subscriptionId=body.product_id, token=body.purchase_token
            ).execute()
            return int(res.get("paymentState", 0)) in (1, 2)  # received/free trial
        else:
            res = service.purchases().products().get(
                packageName=package, productId=body.product_id, token=body.purchase_token
            ).execute()
            return int(res.get("purchaseState", 1)) == 0  # 0 = purchased
    except Exception:
        return False
