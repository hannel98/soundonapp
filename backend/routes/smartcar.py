"""Smartcar OAuth + vehicle data + safe-driving rewards.

This module exposes the router. It is mounted from server.py.

Usage flow:
1. Frontend calls POST /api/smartcar/connect-url with the app deep-link to
   return to after auth. Backend returns the Smartcar Connect URL (sandbox
   by default).
2. User completes Smartcar Connect in a WebBrowser session.
3. Smartcar redirects to GET /api/smartcar/callback?code=...&state=... .
   Backend exchanges code for tokens, stores them, then 302-redirects to the
   provided app deep link.
4. Frontend calls GET /api/smartcar/vehicle to fetch attributes + odometer +
   location + fuel/battery for the primary vehicle.
5. Frontend calls POST /api/smartcar/log-trip with computed driving signals
   (or backend can compute deltas). Tokens awarded based on safety score.

All endpoints require Bearer JWT from the app's existing auth.
"""
from __future__ import annotations

import json
import os
import secrets
from base64 import b64encode
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

router = APIRouter(prefix="/smartcar", tags=["smartcar"])

SMARTCAR_AUTH_URL = "https://connect.smartcar.com/oauth/authorize"
SMARTCAR_TOKEN_URL = "https://auth.smartcar.com/oauth/token"
SMARTCAR_API_BASE = "https://api.smartcar.com/v2.0"

# Default scopes used when none provided
SMARTCAR_DEFAULT_SCOPES = [
    "read_vehicle_info",
    "read_odometer",
    "read_location",
    "read_fuel",
    "read_battery",
    "read_engine_oil",
    "read_tires",
]


class ConnectURLBody(BaseModel):
    app_redirect: Optional[str] = None  # e.g. soundmesh://smartcar/connected
    mode: Optional[str] = None  # "simulated" | "live" | "test"


class LogTripBody(BaseModel):
    miles: float
    duration_s: int
    avg_speed_mph: Optional[float] = None
    max_speed_mph: Optional[float] = None
    hard_brake_events: int = 0
    hard_accel_events: int = 0
    speeding_seconds: int = 0
    night_driving_seconds: int = 0
    location_start: Optional[dict] = None  # {lat,lng}
    location_end: Optional[dict] = None


def _get_redirect_uri(request: Request) -> str:
    """Determine the backend callback URI Smartcar should hit. Prefer env, fall back to request URL base."""
    env = os.environ.get("SMARTCAR_REDIRECT_URI", "").strip()
    if env:
        return env
    # Build from request: use https when behind ingress
    base = str(request.base_url).rstrip("/")
    # base looks like http://0.0.0.0:8001 or https://host/. Replace scheme for prod ingress.
    if base.startswith("http://0.0.0.0") or base.startswith("http://localhost"):
        return f"{base}/api/smartcar/callback"
    # Ingress strips /api on egress but keeps it on the public URL; both forms ok
    return f"{base}/api/smartcar/callback"


async def _exchange_code(code: str, redirect_uri: str) -> dict:
    cid = os.environ.get("SMARTCAR_CLIENT_ID", "")
    csec = os.environ.get("SMARTCAR_CLIENT_SECRET", "")
    if not cid or not csec or csec == "placeholder_rotate_in_dashboard":
        raise HTTPException(
            status_code=503,
            detail="Smartcar not configured. Rotate the client secret and set SMARTCAR_CLIENT_SECRET in backend .env.",
        )
    basic = b64encode(f"{cid}:{csec}".encode()).decode()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            SMARTCAR_TOKEN_URL,
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Smartcar token exchange failed: {r.text[:200]}")
    return r.json()


async def _refresh_token(refresh_token: str) -> dict:
    cid = os.environ.get("SMARTCAR_CLIENT_ID", "")
    csec = os.environ.get("SMARTCAR_CLIENT_SECRET", "")
    basic = b64encode(f"{cid}:{csec}".encode()).decode()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            SMARTCAR_TOKEN_URL,
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Smartcar refresh failed")
    return r.json()


async def _get_valid_access_token(db, user_id: str) -> str:
    rec = await db.smartcar_tokens.find_one({"user_id": user_id})
    if not rec:
        raise HTTPException(status_code=400, detail="Vehicle not connected")
    exp = rec.get("expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp > datetime.now(timezone.utc) + timedelta(seconds=30):
            return rec["access_token"]
    rt = rec.get("refresh_token")
    if not rt:
        raise HTTPException(status_code=400, detail="Vehicle session expired - reconnect")
    fresh = await _refresh_token(rt)
    new_at = fresh["access_token"]
    new_rt = fresh.get("refresh_token") or rt
    new_exp = datetime.now(timezone.utc) + timedelta(seconds=fresh.get("expires_in", 7200))
    await db.smartcar_tokens.update_one(
        {"user_id": user_id},
        {"$set": {
            "access_token": new_at,
            "refresh_token": new_rt,
            "expires_at": new_exp,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return new_at


def _safety_score(b: LogTripBody) -> int:
    """Compute a 0..100 safety score from trip metrics.
    Lower harsh-event rate per mile => higher score.
    """
    miles = max(0.5, b.miles)
    penalty = 0
    penalty += b.hard_brake_events * 7
    penalty += b.hard_accel_events * 7
    penalty += min(40, b.speeding_seconds / 6.0)  # 6s = 1 point
    if b.max_speed_mph and b.max_speed_mph > 95:
        penalty += min(15, (b.max_speed_mph - 95) * 1.5)
    # Normalize per 10 miles - short trips get smaller punishment
    norm = penalty * (10.0 / max(10.0, miles))
    score = max(0, min(100, int(100 - norm)))
    return score


def _tokens_from_trip(b: LogTripBody, score: int) -> int:
    """Award tokens proportional to safe miles. 1 token per mile if score>=80, scaled down otherwise."""
    if b.miles <= 0:
        return 0
    multiplier = 0.0
    if score >= 95:
        multiplier = 1.5
    elif score >= 85:
        multiplier = 1.0
    elif score >= 70:
        multiplier = 0.5
    elif score >= 50:
        multiplier = 0.2
    else:
        multiplier = 0.0
    return int(min(50, b.miles * multiplier))  # cap 50/trip


def register(api_router: APIRouter, dependencies: dict):
    """Hook the smartcar router into the main api_router. `dependencies` is a dict of
    callables/objects from server.py: { 'resolve_user': fn, 'db': motor_db, 'credit_tokens': fn }.
    """
    resolve_user = dependencies["resolve_user"]
    db = dependencies["db"]
    credit_tokens = dependencies["credit_tokens"]

    @router.post("/connect-url")
    async def connect_url(body: ConnectURLBody, request: Request, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        cid = os.environ.get("SMARTCAR_CLIENT_ID", "")
        if not cid:
            raise HTTPException(status_code=503, detail="Smartcar client id not configured")
        mode = (body.mode or os.environ.get("SMARTCAR_MODE", "simulated")).strip()
        redirect_uri = _get_redirect_uri(request)
        state_obj = {
            "user_id": user["user_id"],
            "nonce": secrets.token_urlsafe(12),
            "app_redirect": body.app_redirect or "soundmesh://smartcar/connected",
        }
        params = {
            "response_type": "code",
            "client_id": cid,
            "redirect_uri": redirect_uri,
            "scope": " ".join(SMARTCAR_DEFAULT_SCOPES),
            "state": json.dumps(state_obj),
            "mode": mode,
            "approval_prompt": "auto",
        }
        url = f"{SMARTCAR_AUTH_URL}?{urlencode(params)}"
        return {"url": url, "mode": mode, "redirect_uri": redirect_uri}

    @router.get("/callback")
    async def callback(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None, error_description: Optional[str] = None):
        if error:
            msg = error_description or error
            html = f"<html><body style='font-family:sans-serif;background:#0A0A0C;color:#fff;padding:40px'>" \
                   f"<h2>Smartcar connect failed</h2><p>{msg}</p></body></html>"
            return HTMLResponse(html, status_code=400)
        if not code or not state:
            raise HTTPException(status_code=400, detail="Missing code or state")
        try:
            state_obj = json.loads(state)
            user_id = state_obj["user_id"]
            app_redirect = state_obj.get("app_redirect") or "soundmesh://smartcar/connected"
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid state")

        redirect_uri = _get_redirect_uri(request)
        token_data = await _exchange_code(code, redirect_uri)
        access_token = token_data["access_token"]
        refresh_token = token_data.get("refresh_token")
        expires_in = int(token_data.get("expires_in", 7200))
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        await db.smartcar_tokens.update_one(
            {"user_id": user_id},
            {"$set": {
                "user_id": user_id,
                "access_token": access_token,
                "refresh_token": refresh_token,
                "expires_at": expires_at,
                "updated_at": datetime.now(timezone.utc),
                "mode": os.environ.get("SMARTCAR_MODE", "simulated"),
            }},
            upsert=True,
        )
        sep = "&" if "?" in app_redirect else "?"
        redirect_to = f"{app_redirect}{sep}status=success"
        # HTML meta-refresh (works in WebBrowser sessions on iOS/Android)
        html = (
            "<html><head><meta http-equiv='refresh' content=\"0;url=" + redirect_to + "\" />"
            "</head><body style='font-family:sans-serif;background:#0A0A0C;color:#fff;padding:40px'>"
            "<h2>Vehicle connected ✅</h2><p>You can return to the app.</p>"
            "<p><a style='color:#FFB800' href='" + redirect_to + "'>Open SoundMesh</a></p>"
            "</body></html>"
        )
        return HTMLResponse(html)

    @router.get("/status")
    async def status(authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        rec = await db.smartcar_tokens.find_one({"user_id": user["user_id"]}, {"_id": 0, "access_token": 0, "refresh_token": 0})
        if not rec:
            return {"connected": False}
        exp = rec.get("expires_at")
        # Return basic info plus latest snapshot if any
        snap = await db.vehicle_snapshots.find_one({"user_id": user["user_id"]}, {"_id": 0}, sort=[("created_at", -1)])
        return {
            "connected": True,
            "mode": rec.get("mode"),
            "updated_at": rec.get("updated_at").isoformat() if isinstance(rec.get("updated_at"), datetime) else None,
            "expires_at": exp.isoformat() if isinstance(exp, datetime) else None,
            "latest": snap,
        }

    @router.post("/disconnect")
    async def disconnect(authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        await db.smartcar_tokens.delete_one({"user_id": user["user_id"]})
        return {"ok": True}

    @router.get("/vehicle")
    async def vehicle(authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        access_token = await _get_valid_access_token(db, user["user_id"])
        headers = {"Authorization": f"Bearer {access_token}", "User-Agent": "SoundMesh/1.0"}
        async with httpx.AsyncClient(base_url=SMARTCAR_API_BASE, headers=headers, timeout=15) as c:
            r = await c.get("/vehicles")
            r.raise_for_status()
            vehicles = (r.json() or {}).get("vehicles", [])
            if not vehicles:
                raise HTTPException(status_code=404, detail="No vehicles found on this Smartcar connection")
            vid = vehicles[0]
            attrs = (await c.get(f"/vehicles/{vid}")).json()
            # Fetch standard signals in parallel
            async def _safe(path: str):
                try:
                    rr = await c.get(path)
                    if rr.status_code == 200:
                        return rr.json()
                except Exception:
                    return None
                return None
            odo = await _safe(f"/vehicles/{vid}/odometer")
            loc = await _safe(f"/vehicles/{vid}/location")
            fuel = await _safe(f"/vehicles/{vid}/fuel")
            batt = await _safe(f"/vehicles/{vid}/battery")
        snapshot = {
            "user_id": user["user_id"],
            "vehicle_id": vid,
            "attributes": attrs,
            "odometer": odo,
            "location": loc,
            "fuel": fuel,
            "battery": batt,
            "created_at": datetime.now(timezone.utc),
        }
        await db.vehicle_snapshots.insert_one(snapshot)
        snapshot.pop("_id", None)
        snapshot["created_at"] = snapshot["created_at"].isoformat()
        return snapshot

    @router.post("/log-trip")
    async def log_trip(body: LogTripBody, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        if body.miles <= 0 or body.miles > 2000:
            raise HTTPException(status_code=400, detail="miles out of range")
        if body.duration_s < 30 or body.duration_s > 86400:
            raise HTTPException(status_code=400, detail="duration out of range")
        score = _safety_score(body)
        award = _tokens_from_trip(body, score)
        trip = {
            "id": secrets.token_hex(8),
            "user_id": user["user_id"],
            "miles": round(body.miles, 2),
            "duration_s": body.duration_s,
            "avg_speed_mph": body.avg_speed_mph,
            "max_speed_mph": body.max_speed_mph,
            "hard_brake_events": body.hard_brake_events,
            "hard_accel_events": body.hard_accel_events,
            "speeding_seconds": body.speeding_seconds,
            "night_driving_seconds": body.night_driving_seconds,
            "safety_score": score,
            "sound_awarded": award,
            "location_start": body.location_start,
            "location_end": body.location_end,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.driving_trips.insert_one(trip)
        balance = None
        if award > 0:
            credited = await credit_tokens(
                user["user_id"], award, "safe_driving", {"trip_id": trip["id"], "miles": trip["miles"], "score": score}
            )
            balance = credited["progress"]["sound_balance"]
        # Update aggregate
        await db.driving_stats.update_one(
            {"user_id": user["user_id"]},
            {"$inc": {
                "total_miles": trip["miles"],
                "total_trips": 1,
                "total_tokens": award,
                "hard_brake_events": body.hard_brake_events,
                "hard_accel_events": body.hard_accel_events,
            }, "$set": {"updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
        trip.pop("_id", None)
        return {"trip": trip, "safety_score": score, "sound_awarded": award, "balance": balance}

    @router.get("/trips")
    async def trips(authorization: Optional[str] = Header(None), limit: int = 30):
        user = await resolve_user(authorization)
        docs = await db.driving_trips.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(min(max(limit, 1), 100)).to_list(100)
        stats = await db.driving_stats.find_one({"user_id": user["user_id"]}, {"_id": 0})
        if stats and isinstance(stats.get("updated_at"), datetime):
            stats["updated_at"] = stats["updated_at"].isoformat()
        return {"trips": docs, "stats": stats or {"total_miles": 0, "total_trips": 0, "total_tokens": 0}}

    @router.post("/mesh/share")
    async def mesh_share(body: dict, authorization: Optional[str] = Header(None)):
        """Broadcast a small vehicle/music metadata packet to other connected drivers nearby.
        For MVP we just store the packet; consumers poll /mesh/incoming.
        """
        user = await resolve_user(authorization)
        kind = body.get("kind", "unknown")
        payload = body.get("payload", {})
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="payload must be object")
        if kind not in ("track", "album", "trip", "chat"):
            raise HTTPException(status_code=400, detail="invalid kind")
        doc = {
            "id": secrets.token_hex(8),
            "from_user_id": user["user_id"],
            "display_name": user.get("display_name") or user["email"].split("@")[0],
            "kind": kind,
            "payload": payload,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.car_mesh.insert_one(doc)
        doc.pop("_id", None)
        return {"ok": True, "packet": doc}

    @router.get("/mesh/incoming")
    async def mesh_incoming(authorization: Optional[str] = Header(None), limit: int = 30):
        user = await resolve_user(authorization)
        docs = await db.car_mesh.find({"from_user_id": {"$ne": user["user_id"]}}, {"_id": 0}).sort("created_at", -1).limit(min(max(limit, 1), 100)).to_list(100)
        return docs

    api_router.include_router(router)
