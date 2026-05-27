"""AI Lyrics analyzer that compares user-written lyrics to popular artists' styles.
Uses Emergent LLM key (Claude or OpenAI).
"""
from __future__ import annotations

import json
import os
import re
import secrets
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/lyrics", tags=["lyrics"])

ARTIST_PROFILES = {
    "Drake":         {"genre": "Hip-Hop / R&B",  "keywords": ["introspective", "melodic flow", "toronto", "vulnerable", "trap", "6 god"]},
    "Taylor Swift":  {"genre": "Pop / Country",   "keywords": ["narrative", "detailed imagery", "heartbreak", "diaristic", "bridge-heavy"]},
    "Kendrick Lamar":{"genre": "Conscious Hip-Hop","keywords": ["political", "complex schemes", "compton", "multi-voice", "jazz-infused"]},
    "Travis Scott":  {"genre": "Trap / Psychedelic","keywords": ["atmospheric", "adlibs", "autotune", "rage", "astro"]},
    "Beyoncé":       {"genre": "R&B / Pop",        "keywords": ["empowerment", "powerhouse vocals", "layered harmonies", "queen"]},
    "The Weeknd":    {"genre": "Dark R&B / Synth", "keywords": ["nocturnal", "hedonism", "falsetto", "80s synth", "vice"]},
    "Billie Eilish": {"genre": "Alt-Pop",          "keywords": ["whispered", "minimalist", "dark imagery", "surreal"]},
    "J. Cole":       {"genre": "Hip-Hop",          "keywords": ["storytelling", "self-reflection", "social commentary", "north carolina"]},
    "Ed Sheeran":    {"genre": "Pop / Singer-Songwriter", "keywords": ["acoustic", "romantic", "earnest", "loop pedal"]},
    "Olivia Rodrigo":{"genre": "Pop-Punk / Pop",   "keywords": ["teen heartbreak", "raw", "diary", "emo-pop"]},
    "Bad Bunny":     {"genre": "Reggaetón / Latin Trap","keywords": ["latin trap", "puerto rico", "perreo", "playful"]},
    "SZA":           {"genre": "R&B",              "keywords": ["vulnerable", "jazzy", "longing", "alt R&B"]},
}


class AnalyzeBody(BaseModel):
    lyrics: str = Field(..., min_length=20, max_length=4000)
    artist: str  # one of ARTIST_PROFILES keys
    save: bool = False
    title: Optional[str] = None


async def _call_emergent_llm(prompt: str) -> dict:
    """Call Emergent LLM (Claude Haiku via emergentintegrations) and parse JSON response."""
    try:
        # Use emergentintegrations for cost-efficient Claude Haiku
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=503, detail="EMERGENT_LLM_KEY missing")
        session_id = secrets.token_hex(8)
        chat = (
            LlmChat(api_key=api_key, session_id=session_id, system_message="You are a music lyric analyst. Always respond with strict JSON only, no prose, no markdown fences.")
            .with_model("anthropic", "claude-haiku-4-5")
        )
        msg = UserMessage(text=prompt)
        resp = await chat.send_message(msg)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM failure: {e}")
    text = str(resp).strip()
    # Strip code fences if any
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    # Best-effort extract first {...} block
    m = re.search(r"\{.*\}", text, re.DOTALL)
    raw = m.group(0) if m else text
    try:
        return json.loads(raw)
    except Exception:
        # Return as plain analysis
        return {"similarity": None, "feedback": text, "strengths": [], "suggestions": []}


def register(api_router: APIRouter, dependencies: dict):
    resolve_user = dependencies["resolve_user"]
    db = dependencies["db"]

    @router.get("/artists")
    async def list_artists():
        return [
            {"name": k, "genre": v["genre"], "keywords": v["keywords"]}
            for k, v in ARTIST_PROFILES.items()
        ]

    @router.post("/analyze")
    async def analyze(body: AnalyzeBody, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        if body.artist not in ARTIST_PROFILES:
            raise HTTPException(status_code=400, detail="Unknown artist")
        profile = ARTIST_PROFILES[body.artist]
        prompt = (
            f"Compare the lyrics below to the style of {body.artist} ({profile['genre']}).\n"
            f"Known style markers: {', '.join(profile['keywords'])}.\n\n"
            f"Lyrics:\n\"\"\"\n{body.lyrics.strip()}\n\"\"\"\n\n"
            "Respond with a JSON object using EXACTLY these keys:\n"
            "{\n"
            "  \"similarity\": <integer 0-100>,\n"
            "  \"sub_scores\": { \"theme\": 0-100, \"vocab\": 0-100, \"rhyme_flow\": 0-100, \"structure\": 0-100, \"mood\": 0-100 },\n"
            "  \"verdict\": \"<one-line summary>\",\n"
            "  \"strengths\": [\"...\", \"...\"],\n"
            "  \"differences\": [\"...\", \"...\"],\n"
            "  \"suggestions\": [\"<concrete rewrite tip>\", \"<another tip>\"],\n"
            "  \"signature_phrases_to_borrow\": [\"...\"]\n"
            "}\n"
            "Be specific - reference exact lines from the lyrics when possible. No markdown fences."
        )
        result = await _call_emergent_llm(prompt)
        record_id = secrets.token_hex(8)
        record = {
            "id": record_id,
            "user_id": user["user_id"],
            "artist": body.artist,
            "title": body.title,
            "lyrics": body.lyrics if body.save else None,
            "result": result,
            "created_at": datetime.now(timezone.utc),
        }
        if body.save:
            await db.lyric_analyses.insert_one(record)
        out = dict(record)
        out.pop("_id", None)
        out["created_at"] = record["created_at"].isoformat()
        return out

    @router.get("/history")
    async def history(authorization: Optional[str] = Header(None), limit: int = 30):
        user = await resolve_user(authorization)
        docs = await db.lyric_analyses.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(min(max(limit, 1), 100)).to_list(100)
        for d in docs:
            if isinstance(d.get("created_at"), datetime):
                d["created_at"] = d["created_at"].isoformat()
        return docs

    api_router.include_router(router)
