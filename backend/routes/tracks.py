"""User track upload + record. Accepts base64 audio (kept simple for MVP).
Awards $SOUND per upload.
"""
from __future__ import annotations

import base64
import re
import secrets
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/me/tracks", tags=["my-tracks"])

MAX_AUDIO_B64 = 11 * 1024 * 1024  # ~11MB base64 -> ~8MB raw
ALLOWED_MIME = {
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
    "audio/mp4", "audio/m4a", "audio/aac",
    "audio/ogg", "audio/webm", "audio/flac",
}
TRACK_REWARD_BASE = 20  # $SOUND per accepted upload (scaled by progress.multiplier)


class TrackUploadBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=80)
    genre: Optional[str] = "Original"
    bpm: Optional[int] = None
    mime: str = Field(..., min_length=3, max_length=40)
    duration_s: Optional[int] = None
    # data is a base64-encoded audio blob (no data: prefix)
    audio_b64: str
    # optional cover_url (existing remote cover) or cover_b64 image
    cover_url: Optional[str] = None
    cover_b64: Optional[str] = None  # data: prefix accepted
    source: str = "record"  # "record" | "upload"
    is_beat: bool = False  # if True, list under user beats


def _strip_data_url(s: str) -> str:
    return re.sub(r"^data:[^;]+;base64,", "", s)


def register(api_router: APIRouter, dependencies: dict):
    resolve_user = dependencies["resolve_user"]
    db = dependencies["db"]
    credit_tokens = dependencies["credit_tokens"]

    @router.get("")
    async def list_my_tracks(authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        docs = await db.user_tracks.find(
            {"user_id": user["user_id"]}, {"_id": 0, "audio_b64": 0, "cover_b64": 0}
        ).sort("created_at", -1).limit(100).to_list(100)
        for d in docs:
            if isinstance(d.get("created_at"), datetime):
                d["created_at"] = d["created_at"].isoformat()
        return docs

    @router.get("/{track_id}/audio")
    async def fetch_audio(track_id: str, authorization: Optional[str] = Header(None)):
        # Public stream for any caller (no auth required) so MiniPlayer can play it.
        doc = await db.user_tracks.find_one({"id": track_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Not found")
        from fastapi.responses import Response
        raw = base64.b64decode(doc["audio_b64"]) if doc.get("audio_b64") else b""
        return Response(content=raw, media_type=doc.get("mime", "audio/mpeg"))

    @router.post("")
    async def upload_track(body: TrackUploadBody, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        mime = (body.mime or "").lower().strip()
        if mime not in ALLOWED_MIME:
            raise HTTPException(status_code=400, detail=f"Unsupported audio type {mime}")
        raw = _strip_data_url(body.audio_b64.strip())
        if len(raw) > MAX_AUDIO_B64:
            raise HTTPException(status_code=413, detail="Audio too large (max ~8MB)")
        # Quick base64 sanity check
        try:
            audio_bytes = base64.b64decode(raw, validate=False)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 audio")
        if len(audio_bytes) < 1024:
            raise HTTPException(status_code=400, detail="Audio too short / corrupted")
        cover_url = body.cover_url
        cover_b64 = None
        if body.cover_b64:
            cover_b64 = _strip_data_url(body.cover_b64.strip())
            if len(cover_b64) > 2 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Cover image too large")
            cover_url = f"data:image/jpeg;base64,{cover_b64}"

        track_id = secrets.token_hex(8)
        doc = {
            "id": track_id,
            "user_id": user["user_id"],
            "artist": user.get("display_name") or user["email"].split("@")[0],
            "title": body.title.strip(),
            "genre": body.genre or "Original",
            "bpm": body.bpm,
            "mime": mime,
            "duration_s": body.duration_s,
            "audio_b64": raw,
            "cover_b64": cover_b64,
            "cover_url": cover_url,
            "source": body.source if body.source in ("record", "upload") else "upload",
            "is_beat": bool(body.is_beat),
            "plays": 0,
            "likes": 0,
            "size_bytes": len(audio_bytes),
            "created_at": datetime.now(timezone.utc),
        }
        await db.user_tracks.insert_one(doc)
        # Credit $SOUND
        credit = await credit_tokens(
            user["user_id"], TRACK_REWARD_BASE, "track_upload",
            {"track_id": track_id, "source": doc["source"], "is_beat": doc["is_beat"]},
        )
        balance = credit["progress"]["sound_balance"]
        # Build response without binary payload
        clean = {k: v for k, v in doc.items() if k not in ("audio_b64", "cover_b64", "_id")}
        clean["created_at"] = doc["created_at"].isoformat()
        return {"track": clean, "sound_awarded": TRACK_REWARD_BASE, "balance": balance}

    @router.delete("/{track_id}")
    async def delete_track(track_id: str, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        res = await db.user_tracks.delete_one({"id": track_id, "user_id": user["user_id"]})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}

    api_router.include_router(router)
