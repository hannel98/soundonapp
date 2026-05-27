"""Privy integration: verify privy-id-token, mint internal JWT, server-side wallet ops.
Gated on PRIVY_APP_ID + PRIVY_APP_SECRET env vars. Returns 503 until those are set.
"""
from __future__ import annotations

import base64
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/privy", tags=["privy"])


class PrivyLoginBody(BaseModel):
    id_token: Optional[str] = None  # if not given, expect Authorization Bearer header


def _privy_basic_header() -> dict:
    app_id = os.environ.get("PRIVY_APP_ID", "").strip()
    secret = os.environ.get("PRIVY_APP_SECRET", "").strip()
    if not app_id or not secret:
        raise HTTPException(status_code=503, detail="Privy not configured (set PRIVY_APP_ID + PRIVY_APP_SECRET)")
    enc = base64.b64encode(f"{app_id}:{secret}".encode()).decode()
    return {"Authorization": f"Basic {enc}", "privy-app-id": app_id, "Content-Type": "application/json"}


async def _verify_privy_token(token: str) -> dict:
    """Verify privy-id-token by calling Privy's `/api/v1/sessions` user info or via JWKS.
    For simplicity we do server-to-server verification via Privy's auth endpoint.
    Returns user claims dict.
    """
    app_id = os.environ.get("PRIVY_APP_ID", "").strip()
    jwks_url = os.environ.get("PRIVY_JWKS_URL", "").strip() or f"https://auth.privy.io/api/v1/apps/{app_id}/jwks.json"
    try:
        import jwt
        from jwt import PyJWKClient
        jwks = PyJWKClient(jwks_url)
        signing_key = jwks.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience=app_id,
            options={"require": ["exp", "iat", "sub"]},
        )
        return claims
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Privy token verification failed: {e}")


def register(api_router: APIRouter, dependencies: dict):
    resolve_user = dependencies["resolve_user"]  # for internal JWT-protected endpoints
    _db = dependencies["db"]  # noqa: F841 - reserved for future wallet snapshot caching
    issue_jwt = dependencies["issue_jwt"]  # callable(user_id, email) -> token
    users = dependencies["users_col"]

    @router.get("/status")
    async def status():
        return {
            "configured": bool(
                os.environ.get("PRIVY_APP_ID")
                and os.environ.get("PRIVY_APP_SECRET")
            ),
            "app_id_present": bool(os.environ.get("PRIVY_APP_ID")),
        }

    @router.post("/login")
    async def privy_login(body: PrivyLoginBody, authorization: Optional[str] = Header(None)):
        # Get token from body or Authorization header
        token = body.id_token
        if not token and authorization and authorization.startswith("Bearer "):
            token = authorization.split(" ", 1)[1].strip()
        if not token:
            raise HTTPException(status_code=400, detail="Missing Privy id_token")
        if not os.environ.get("PRIVY_APP_ID"):
            raise HTTPException(status_code=503, detail="Privy not configured")
        claims = await _verify_privy_token(token)
        privy_sub = claims.get("sub")  # e.g. did:privy:xxxxx
        privy_email = None
        # Privy puts emails inside `email` or in `linked_accounts`
        if isinstance(claims.get("email"), str):
            privy_email = claims["email"]
        elif isinstance(claims.get("linked_accounts"), list):
            for la in claims["linked_accounts"]:
                if isinstance(la, dict) and la.get("type") == "email":
                    privy_email = la.get("address")
                    break
        if not privy_sub:
            raise HTTPException(status_code=400, detail="Privy token missing sub claim")

        # Upsert into users
        existing = await users.find_one({"privy_did": privy_sub})
        if not existing and privy_email:
            existing = await users.find_one({"email": privy_email})
        now = datetime.now(timezone.utc)
        if existing:
            user_id = existing["user_id"]
            await users.update_one(
                {"user_id": user_id},
                {"$set": {"privy_did": privy_sub, "last_login_at": now, **({"email": privy_email} if privy_email and not existing.get("email") else {})}},
            )
            email = existing.get("email") or privy_email or f"{privy_sub[-12:]}@privy.local"
            display_name = existing.get("display_name")
        else:
            user_id = f"user_{secrets.token_hex(6)}"
            email = privy_email or f"{privy_sub[-12:]}@privy.local"
            display_name = (privy_email or privy_sub).split("@")[0]
            await users.insert_one({
                "user_id": user_id,
                "email": email,
                "display_name": display_name,
                "privy_did": privy_sub,
                "providers": ["privy"],
                "sound_balance": 100,  # signup bonus
                "xp": 0,
                "streak": 0,
                "created_at": now,
                "last_login_at": now,
            })
        token_out = issue_jwt(user_id)
        return {"access_token": token_out, "user_id": user_id, "email": email, "display_name": display_name}

    @router.get("/wallets")
    async def my_wallets(authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        privy_did = user.get("privy_did")
        if not privy_did:
            raise HTTPException(status_code=400, detail="User not linked to Privy")
        headers = _privy_basic_header()
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"https://api.privy.io/v1/users/{privy_did}", headers=headers)
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Privy: {r.text[:200]}")
            data = r.json()
        wallets = []
        for la in (data.get("linked_accounts") or []):
            if isinstance(la, dict) and la.get("type") == "wallet":
                wallets.append({
                    "address": la.get("address"),
                    "chain_type": la.get("chain_type", "ethereum"),
                    "wallet_client": la.get("wallet_client"),
                    "connector_type": la.get("connector_type"),
                })
        return {"wallets": wallets, "privy_did": privy_did}

    api_router.include_router(router)
