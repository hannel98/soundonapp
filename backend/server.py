from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import secrets
import tempfile
from pathlib import Path
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Any
from datetime import datetime, timezone, timedelta

import httpx
import bcrypt
import jwt
import random
import base64

from pymongo import ReturnDocument
from emergentintegrations.llm.openai.text_to_speech import OpenAITextToSpeech
from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText
from emergentintegrations.llm.gemeni.image_generation import GeminiImageGeneration
from routes import smartcar as smartcar_module
from routes import iap as iap_module
from routes import collab as collab_module
from routes import lyrics as lyrics_module
from routes import privy as privy_module
from routes import tracks as tracks_module
from routes import promo as promo_module
from routes import youtube as youtube_module
from routes import branding as branding_module

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Constants
JWT_SECRET = os.environ.get('JWT_SECRET', 'sound-mesh-jwt-secret-change-in-prod')
JWT_ALGO = 'HS256'
JWT_EXPIRES_DAYS = 7
EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
AUDIO_MAX_BYTES = 20 * 1024 * 1024  # 20 MB cap before sending to Whisper

# Audius public API
AUDIUS_FALLBACK = "https://discoveryprovider.audius.co"
AUDIUS_APP_NAME = "SoundMesh"
_audius_nodes: List[str] = []


async def get_audius_node() -> str:
    global _audius_nodes
    if not _audius_nodes:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get("https://api.audius.co")
                _audius_nodes = (r.json() or {}).get("data", []) or []
        except Exception:
            _audius_nodes = []
    return random.choice(_audius_nodes) if _audius_nodes else AUDIUS_FALLBACK


async def audius_get(path: str, params: Optional[dict] = None) -> Any:
    node = await get_audius_node()
    p = dict(params or {})
    p.setdefault("app_name", AUDIUS_APP_NAME)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{node}/v1{path}", params=p)
        if r.status_code >= 400 and node != AUDIUS_FALLBACK:
            r2 = await c.get(f"{AUDIUS_FALLBACK}/v1{path}", params=p)
            r2.raise_for_status()
            return r2.json().get("data")
        r.raise_for_status()
        return r.json().get("data")


app = FastAPI(title="Sound API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------- Models ----------
class SignupBody(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = None


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionBody(BaseModel):
    session_id: str


class UserPublic(BaseModel):
    user_id: str
    email: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    providers: List[str] = []


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class Artist(BaseModel):
    id: str
    name: str
    handle: str
    tagline: str
    category: str
    platform: str
    image_url: str
    external_url: Optional[str] = None
    followers: int = 0
    featured: bool = False


class Track(BaseModel):
    id: str
    title: str
    artist: str
    genre: str
    cover_url: str
    platform: str
    external_url: Optional[str] = None
    plays: int = 0


class BeatModel(BaseModel):
    id: str
    title: str
    producer: str
    bpm: int
    key: str
    price: float
    cover_url: str
    license: str


class Video(BaseModel):
    id: str
    title: str
    artist: str
    description: str
    youtube_id: str
    thumbnail: str
    duration: str
    genre: str
    views: int


class News(BaseModel):
    id: str
    title: str
    summary: str
    body: str
    category: str
    image_url: str
    published_at: str


class Status(BaseModel):
    id: str
    user_id: str
    display_name: str
    text: str
    created_at: str


class StatusCreate(BaseModel):
    text: str


class Progress(BaseModel):
    user_id: str
    sound_balance: int
    xp: int
    streak: int
    best_streak: int
    multiplier: float
    total_tracks: int
    week_creations: int
    last_claim_at: Optional[str] = None
    next_milestone: int = 30
    next_milestone_reward: int = 50


class LeaderEntry(BaseModel):
    rank: int
    user_id: str
    display_name: str
    avatar_url: Optional[str] = None
    sound_balance: int
    streak: int
    xp: int


class TokenTransaction(BaseModel):
    id: str
    user_id: str
    delta: int  # negative = debit, positive = credit
    reason: str
    metadata: Optional[dict] = None
    balance_after: int
    created_at: str


class RecordingMeta(BaseModel):
    id: str
    user_id: str
    title: str
    duration_ms: int
    mime_type: str
    size_bytes: int
    created_at: str


class RhythmStartBody(BaseModel):
    difficulty: str = "normal"


class AlbumCreateBody(BaseModel):
    name: str
    theme: str
    track_titles: List[str]
    style: Optional[str] = "modern, vibrant, abstract album cover"


class AlbumPublic(BaseModel):
    id: str
    user_id: str
    name: str
    theme: str
    style: str
    track_titles: List[str]
    cover_base64: Optional[str] = None
    cover_mime: str = "image/png"
    created_at: str


class PostCreateBody(BaseModel):
    text: str
    track_id: Optional[str] = None
    album_id: Optional[str] = None
    recording_id: Optional[str] = None


class PostPublic(BaseModel):
    id: str
    user_id: str
    display_name: str
    avatar_url: Optional[str] = None
    text: str
    track_id: Optional[str] = None
    album_id: Optional[str] = None
    recording_id: Optional[str] = None
    likes: int = 0
    comments_count: int = 0
    liked_by_me: bool = False
    created_at: str


class CommentCreateBody(BaseModel):
    text: str


class CommentPublic(BaseModel):
    id: str
    post_id: str
    user_id: str
    display_name: str
    text: str
    created_at: str


class RhythmScoreBody(BaseModel):
    seed: str
    difficulty: str
    score: int
    max_combo: int
    accuracy: float  # 0..1
    duration_ms: int


class TTSBody(BaseModel):
    text: str
    voice: str = "alloy"
    speed: float = 1.0
    model: str = "tts-1"


# ---------- Token economy constants ----------
ACTION_COSTS = {
    "tts": 1,
    "stt": 1,
    "save_recording": 1,
    "publish_album": 3,
    "go_live": 3,
    "post": 0,
}


async def debit_tokens(user_id: str, amount: int, reason: str, metadata: Optional[dict] = None) -> dict:
    """
    Atomically debit `amount` tokens from a user. Raises HTTPException(402) on
    insufficient balance. Returns the post-debit progress doc + transaction.
    """
    if amount <= 0:
        raise ValueError("debit amount must be positive")
    res = await db.progress.find_one_and_update(
        {"user_id": user_id, "sound_balance": {"$gte": amount}},
        {"$inc": {"sound_balance": -amount}},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    if not res:
        # Either user has no progress doc, or insufficient balance
        existing = await db.progress.find_one({"user_id": user_id}, {"_id": 0})
        if not existing:
            await ensure_progress(user_id)
        bal = (existing or {}).get("sound_balance", 0)
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient $SOUND balance: need {amount}, have {bal}",
        )
    tx = {
        "id": uuid.uuid4().hex,
        "user_id": user_id,
        "delta": -amount,
        "reason": reason,
        "metadata": metadata or {},
        "balance_after": res["sound_balance"],
        "created_at": now_utc().isoformat(),
    }
    await db.token_transactions.insert_one(tx)
    tx.pop("_id", None)
    return {"progress": res, "transaction": tx}


async def credit_tokens(user_id: str, amount: int, reason: str, metadata: Optional[dict] = None) -> dict:
    if amount <= 0:
        raise ValueError("credit amount must be positive")
    res = await db.progress.find_one_and_update(
        {"user_id": user_id},
        {"$inc": {"sound_balance": amount}},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
        upsert=False,
    )
    if not res:
        await ensure_progress(user_id)
        res = await db.progress.find_one_and_update(
            {"user_id": user_id},
            {"$inc": {"sound_balance": amount}},
            projection={"_id": 0},
            return_document=ReturnDocument.AFTER,
        )
    tx = {
        "id": uuid.uuid4().hex,
        "user_id": user_id,
        "delta": amount,
        "reason": reason,
        "metadata": metadata or {},
        "balance_after": res["sound_balance"],
        "created_at": now_utc().isoformat(),
    }
    await db.token_transactions.insert_one(tx)
    tx.pop("_id", None)
    return {"progress": res, "transaction": tx}


# ---------- Helpers ----------
def now_utc():
    return datetime.now(timezone.utc)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def issue_jwt(user_id: str) -> str:
    payload = {"sub": user_id, "iat": now_utc(), "exp": now_utc() + timedelta(days=JWT_EXPIRES_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def resolve_user_from_authorization(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("sub")
        if user_id:
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
            if user:
                return user
    except jwt.PyJWTError:
        pass
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if sess:
        expires_at = sess.get("expires_at")
        if isinstance(expires_at, datetime):
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < now_utc():
                raise HTTPException(status_code=401, detail="Session expired")
        user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
        if user:
            return user
    raise HTTPException(status_code=401, detail="Invalid or expired token")


def to_user_public(user: dict) -> UserPublic:
    return UserPublic(
        user_id=user["user_id"],
        email=user["email"],
        display_name=user.get("display_name"),
        avatar_url=user.get("avatar_url"),
        providers=user.get("providers", []),
    )


async def ensure_progress(user_id: str):
    existing = await db.progress.find_one({"user_id": user_id})
    if existing:
        return existing
    doc = {
        "user_id": user_id, "sound_balance": 50, "xp": 0, "streak": 0, "best_streak": 0,
        "multiplier": 1.0, "total_tracks": 0, "week_creations": 0,
        "last_claim_at": None, "next_milestone": 30, "next_milestone_reward": 50,
    }
    await db.progress.insert_one(doc)
    return doc


# ---------- Auth ----------
@api_router.get("/")
async def root():
    return {"name": "Sound API", "status": "ok"}


@api_router.post("/auth/signup", response_model=TokenResponse, status_code=201)
async def signup(body: SignupBody):
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    email_lower = body.email.lower()
    if await db.users.find_one({"email_lower": email_lower}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id, "email": body.email, "email_lower": email_lower,
        "display_name": body.display_name or body.email.split("@")[0],
        "avatar_url": None, "password_hash": hash_password(body.password),
        "providers": ["local"], "created_at": now_utc(), "updated_at": now_utc(),
    }
    await db.users.insert_one(user_doc)
    await ensure_progress(user_id)
    token = issue_jwt(user_id)
    user_doc.pop("password_hash", None)
    return TokenResponse(access_token=token, user=to_user_public(user_doc))


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginBody):
    user = await db.users.find_one({"email_lower": body.email.lower()})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return TokenResponse(access_token=issue_jwt(user["user_id"]), user=to_user_public(user))


@api_router.post("/auth/google/session", response_model=TokenResponse)
async def google_session(body: GoogleSessionBody):
    async with httpx.AsyncClient(timeout=15.0) as http:
        resp = await http.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": body.session_id})
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = resp.json()
    google_email = data.get("email")
    session_token = data.get("session_token")
    if not google_email or not session_token:
        raise HTTPException(status_code=502, detail="Bad response from auth provider")
    email_lower = google_email.lower()
    existing = await db.users.find_one({"email_lower": email_lower})
    if existing:
        user_id = existing["user_id"]
        providers = list(set((existing.get("providers") or []) + ["google"]))
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "providers": providers, "google_id": data.get("id"),
            "avatar_url": existing.get("avatar_url") or data.get("picture"),
            "display_name": existing.get("display_name") or data.get("name"),
            "updated_at": now_utc(),
        }})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": google_email, "email_lower": email_lower,
            "display_name": data.get("name") or google_email.split("@")[0],
            "avatar_url": data.get("picture"), "providers": ["google"],
            "google_id": data.get("id"), "created_at": now_utc(), "updated_at": now_utc(),
        })
    await ensure_progress(user_id)
    await db.user_sessions.update_one({"session_token": session_token}, {"$set": {
        "session_token": session_token, "user_id": user_id,
        "expires_at": now_utc() + timedelta(days=7), "created_at": now_utc(),
    }}, upsert=True)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return TokenResponse(access_token=session_token, user=to_user_public(user))


@api_router.get("/auth/me", response_model=UserPublic)
async def me(authorization: Optional[str] = Header(None)):
    return to_user_public(await resolve_user_from_authorization(authorization))


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------- Content ----------
@api_router.get("/artists", response_model=List[Artist])
async def list_artists(featured: Optional[bool] = None):
    q = {} if featured is None else {"featured": featured}
    docs = await db.artists.find(q, {"_id": 0}).to_list(200)
    return [Artist(**d) for d in docs]


@api_router.get("/artists/{artist_id}", response_model=Artist)
async def get_artist(artist_id: str):
    doc = await db.artists.find_one({"id": artist_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Artist not found")
    return Artist(**doc)


@api_router.get("/tracks", response_model=List[Track])
async def list_tracks():
    return [Track(**d) for d in await db.tracks.find({}, {"_id": 0}).to_list(200)]


@api_router.get("/beats", response_model=List[BeatModel])
async def list_beats():
    return [BeatModel(**d) for d in await db.beats.find({}, {"_id": 0}).to_list(200)]


@api_router.get("/videos", response_model=List[Video])
async def list_videos():
    return [Video(**d) for d in await db.videos.find({}, {"_id": 0}).to_list(200)]


@api_router.get("/news", response_model=List[News])
async def list_news():
    docs = await db.news.find({}, {"_id": 0}).sort("published_at", -1).to_list(200)
    return [News(**d) for d in docs]


@api_router.get("/trending", response_model=List[Track])
async def list_trending(period: str = "24h"):
    docs = await db.tracks.find({}, {"_id": 0}).sort("plays", -1).limit(10).to_list(10)
    return [Track(**d) for d in docs]


# ---------- Profile / Gamification ----------
@api_router.get("/me/progress", response_model=Progress)
async def get_progress(authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    prog = await db.progress.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not prog:
        prog = await ensure_progress(user["user_id"])
        prog.pop("_id", None)
    return Progress(**prog)


@api_router.post("/me/claim-daily", response_model=Progress)
async def claim_daily(authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    prog = await db.progress.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not prog:
        prog = await ensure_progress(user["user_id"])
    now = now_utc()
    last_claim = prog.get("last_claim_at")
    last_dt = None
    if last_claim:
        try:
            last_dt = datetime.fromisoformat(last_claim.replace("Z", "+00:00"))
        except Exception:
            last_dt = None
    if last_dt and (now - last_dt) < timedelta(hours=20):
        raise HTTPException(status_code=400, detail="Daily bonus already claimed")
    new_streak = prog["streak"] + 1 if (last_dt and (now - last_dt) <= timedelta(hours=48)) else 1
    reward_sound = int(10 * prog.get("multiplier", 1.0))
    update = {
        "sound_balance": prog["sound_balance"] + reward_sound,
        "xp": prog["xp"] + 25,
        "streak": new_streak,
        "best_streak": max(prog["best_streak"], new_streak),
        "multiplier": round(1.0 + min(new_streak / 30.0, 2.0), 2),
        "last_claim_at": now.isoformat(),
    }
    await db.progress.update_one({"user_id": user["user_id"]}, {"$set": update})
    prog.update(update)
    return Progress(**prog)


@api_router.get("/me/statuses", response_model=List[Status])
async def my_statuses(authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    docs = await db.statuses.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return [Status(**d) for d in docs]


@api_router.post("/me/statuses", response_model=Status)
async def create_status(body: StatusCreate, authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    doc = {
        "id": uuid.uuid4().hex,
        "user_id": user["user_id"],
        "display_name": user.get("display_name") or user["email"].split("@")[0],
        "text": body.text,
        "created_at": now_utc().isoformat(),
    }
    await db.statuses.insert_one(doc)
    doc.pop("_id", None)
    return Status(**doc)


# ---------- Leaderboard ----------
@api_router.get("/leaderboard", response_model=List[LeaderEntry])
async def leaderboard(sort: str = "balance", limit: int = 20):
    sort_key = {"balance": "sound_balance", "streak": "streak", "xp": "xp"}.get(sort, "sound_balance")
    pipeline = [
        {"$sort": {sort_key: -1, "user_id": 1}},
        {"$limit": min(max(limit, 1), 100)},
        {"$lookup": {"from": "users", "localField": "user_id", "foreignField": "user_id", "as": "u"}},
        {"$unwind": {"path": "$u", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "_id": 0,
            "user_id": 1,
            "sound_balance": 1,
            "streak": 1,
            "xp": 1,
            "display_name": {"$ifNull": ["$u.display_name", "$user_id"]},
            "avatar_url": "$u.avatar_url",
        }},
    ]
    rows = await db.progress.aggregate(pipeline).to_list(100)
    return [LeaderEntry(
        rank=i + 1,
        user_id=r["user_id"],
        display_name=r.get("display_name") or r["user_id"],
        avatar_url=r.get("avatar_url"),
        sound_balance=r.get("sound_balance", 0),
        streak=r.get("streak", 0),
        xp=r.get("xp", 0),
    ) for i, r in enumerate(rows)]


# ---------- Recordings (save full takes) ----------
@api_router.post("/me/recordings", response_model=RecordingMeta)
async def save_recording(
    audio: UploadFile = File(...),
    title: str = Form("Untitled Take"),
    duration_ms: int = Form(0),
    authorization: Optional[str] = Header(None),
):
    user = await resolve_user_from_authorization(authorization)
    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty audio upload")
    if len(raw) > AUDIO_MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"audio exceeds {AUDIO_MAX_BYTES} bytes")
    rec_id = uuid.uuid4().hex
    debited = await debit_tokens(user["user_id"], ACTION_COSTS["save_recording"], "save_recording", {"recording_id": rec_id})
    mime = audio.content_type or "audio/m4a"
    b64 = base64.b64encode(raw).decode("ascii")
    doc = {
        "id": rec_id,
        "user_id": user["user_id"],
        "title": (title or "Untitled Take")[:120],
        "duration_ms": max(0, int(duration_ms or 0)),
        "mime_type": mime,
        "size_bytes": len(raw),
        "audio_base64": b64,
        "created_at": now_utc().isoformat(),
    }
    await db.recordings.insert_one(doc)
    # Return without the heavy audio body
    return RecordingMeta(
        id=rec_id,
        user_id=user["user_id"],
        title=doc["title"],
        duration_ms=doc["duration_ms"],
        mime_type=mime,
        size_bytes=doc["size_bytes"],
        created_at=doc["created_at"],
    )


@api_router.get("/me/recordings", response_model=List[RecordingMeta])
async def list_recordings(authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    docs = await db.recordings.find(
        {"user_id": user["user_id"]},
        {"_id": 0, "audio_base64": 0},
    ).sort("created_at", -1).to_list(100)
    return [RecordingMeta(**d) for d in docs]


@api_router.get("/me/recordings/{rec_id}/audio")
async def get_recording_audio(rec_id: str, authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    doc = await db.recordings.find_one({"id": rec_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="recording not found")
    return {
        "id": doc["id"],
        "audio_base64": doc["audio_base64"],
        "mime_type": doc.get("mime_type", "audio/m4a"),
        "title": doc.get("title", "Untitled Take"),
    }


# ---------- Token transactions ----------
@api_router.get("/me/transactions", response_model=List[TokenTransaction])
async def list_transactions(authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    docs = await db.token_transactions.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    return [TokenTransaction(**d) for d in docs]


@api_router.get("/me/costs")
async def get_costs(authorization: Optional[str] = Header(None)):
    await resolve_user_from_authorization(authorization)
    return ACTION_COSTS


# ---------- Albums (AI cover via Gemini Nano Banana) ----------
@api_router.post("/albums", response_model=AlbumPublic)
async def create_album(body: AlbumCreateBody, authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="name required")
    if len(body.track_titles) < 1 or len(body.track_titles) > 30:
        raise HTTPException(status_code=400, detail="track_titles must have 1..30 entries")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="LLM key not configured")
    debited = await debit_tokens(user["user_id"], ACTION_COSTS["publish_album"], "publish_album", {"album_name": body.name})
    cover_b64: Optional[str] = None
    try:
        gen = GeminiImageGeneration(api_key=EMERGENT_LLM_KEY)
        prompt = (
            f"Album cover art for '{body.name}'. Theme: {body.theme}. Style: {body.style}. "
            f"Bold typography readable. No watermarks. Cinematic, music-album aesthetic."
        )
        images = await gen.generate_images(
            prompt=prompt,
            model="gemini-2.5-flash-image-preview",
            number_of_images=1,
        )
        if images and images[0]:
            cover_b64 = base64.b64encode(images[0]).decode("ascii")
    except Exception as e:
        logger.warning(f"Cover gen failed (continuing without image): {e}")
        # Refund half on cover failure so the album still gets created
        await credit_tokens(user["user_id"], 1, "publish_album_partial_refund", {"err": str(e)})
    album_id = uuid.uuid4().hex
    doc = {
        "id": album_id,
        "user_id": user["user_id"],
        "name": body.name.strip()[:120],
        "theme": body.theme.strip()[:280],
        "style": body.style or "",
        "track_titles": [t.strip()[:120] for t in body.track_titles if t.strip()],
        "cover_base64": cover_b64,
        "cover_mime": "image/png",
        "created_at": now_utc().isoformat(),
    }
    await db.albums.insert_one(doc)
    return AlbumPublic(**{k: v for k, v in doc.items() if k != "_id"})


@api_router.get("/me/albums", response_model=List[AlbumPublic])
async def my_albums(authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    docs = await db.albums.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return [AlbumPublic(**d) for d in docs]


@api_router.get("/albums/{album_id}", response_model=AlbumPublic)
async def get_album(album_id: str):
    doc = await db.albums.find_one({"id": album_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="album not found")
    return AlbumPublic(**doc)


# ---------- Social Feed (posts + comments + likes) ----------
@api_router.post("/posts", response_model=PostPublic)
async def create_post(body: PostCreateBody, authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text required")
    doc = {
        "id": uuid.uuid4().hex,
        "user_id": user["user_id"],
        "display_name": user.get("display_name") or user["email"].split("@")[0],
        "avatar_url": user.get("avatar_url"),
        "text": body.text.strip()[:600],
        "track_id": body.track_id,
        "album_id": body.album_id,
        "recording_id": body.recording_id,
        "likes": 0,
        "comments_count": 0,
        "created_at": now_utc().isoformat(),
    }
    await db.posts.insert_one(doc)
    out = {k: v for k, v in doc.items() if k != "_id"}
    out["liked_by_me"] = False
    return PostPublic(**out)


@api_router.get("/feed", response_model=List[PostPublic])
async def feed(authorization: Optional[str] = Header(None), limit: int = 30):
    user: Optional[dict] = None
    try:
        user = await resolve_user_from_authorization(authorization)
    except HTTPException:
        user = None
    docs = await db.posts.find({}, {"_id": 0}).sort("created_at", -1).limit(min(max(limit, 1), 100)).to_list(100)
    liked_set: set = set()
    if user:
        likes = await db.post_likes.find({"user_id": user["user_id"]}, {"_id": 0, "post_id": 1}).to_list(500)
        liked_set = {l["post_id"] for l in likes}
    return [PostPublic(**{**d, "liked_by_me": d["id"] in liked_set}) for d in docs]


@api_router.post("/posts/{post_id}/like")
async def like_post(post_id: str, authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    existing = await db.post_likes.find_one({"post_id": post_id, "user_id": user["user_id"]})
    if existing:
        await db.post_likes.delete_one({"post_id": post_id, "user_id": user["user_id"]})
        res = await db.posts.find_one_and_update(
            {"id": post_id}, {"$inc": {"likes": -1}},
            return_document=ReturnDocument.AFTER, projection={"_id": 0, "likes": 1},
        )
        return {"liked": False, "likes": max(0, (res or {}).get("likes", 0))}
    await db.post_likes.insert_one({
        "post_id": post_id, "user_id": user["user_id"], "created_at": now_utc().isoformat()
    })
    res = await db.posts.find_one_and_update(
        {"id": post_id}, {"$inc": {"likes": 1}},
        return_document=ReturnDocument.AFTER, projection={"_id": 0, "likes": 1},
    )
    return {"liked": True, "likes": (res or {}).get("likes", 1)}


@api_router.get("/posts/{post_id}/comments", response_model=List[CommentPublic])
async def list_comments(post_id: str):
    docs = await db.post_comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [CommentPublic(**d) for d in docs]


@api_router.post("/posts/{post_id}/comments", response_model=CommentPublic)
async def add_comment(post_id: str, body: CommentCreateBody, authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text required")
    doc = {
        "id": uuid.uuid4().hex,
        "post_id": post_id,
        "user_id": user["user_id"],
        "display_name": user.get("display_name") or user["email"].split("@")[0],
        "text": body.text.strip()[:400],
        "created_at": now_utc().isoformat(),
    }
    await db.post_comments.insert_one(doc)
    await db.posts.update_one({"id": post_id}, {"$inc": {"comments_count": 1}})
    out = {k: v for k, v in doc.items() if k != "_id"}
    return CommentPublic(**out)


# ---------- Rhythm Tap Game ----------
DIFFICULTY_CFG = {
    "easy":   {"bpm": 90,  "duration_ms": 30_000, "notes_per_beat": 0.5, "lanes": 4},
    "normal": {"bpm": 120, "duration_ms": 30_000, "notes_per_beat": 1.0, "lanes": 4},
    "hard":   {"bpm": 150, "duration_ms": 30_000, "notes_per_beat": 1.5, "lanes": 4},
}


@api_router.post("/games/rhythm/start")
async def rhythm_start(body: RhythmStartBody, authorization: Optional[str] = Header(None)):
    await resolve_user_from_authorization(authorization)
    cfg = DIFFICULTY_CFG.get(body.difficulty, DIFFICULTY_CFG["normal"])
    seed = secrets.token_urlsafe(8)
    rng = random.Random(seed)
    # Generate note pattern. Beat interval = 60_000 / bpm ms.
    interval_ms = int(60_000 / cfg["bpm"])
    total_notes = int((cfg["duration_ms"] / interval_ms) * cfg["notes_per_beat"])
    notes = []
    t = 800  # 800ms grace before first note
    for _ in range(total_notes):
        notes.append({"t_ms": t, "lane": rng.randint(0, cfg["lanes"] - 1)})
        # Sometimes add a 2-note chord on hard
        if body.difficulty == "hard" and rng.random() < 0.15:
            second_lane = rng.randint(0, cfg["lanes"] - 1)
            if second_lane != notes[-1]["lane"]:
                notes.append({"t_ms": t, "lane": second_lane})
        # Stagger next note: interval +/- jitter
        jitter = rng.randint(-60, 80)
        t += max(180, interval_ms + jitter)
        if t > cfg["duration_ms"] - 600:
            break
    return {
        "seed": seed,
        "difficulty": body.difficulty,
        "bpm": cfg["bpm"],
        "lanes": cfg["lanes"],
        "duration_ms": cfg["duration_ms"],
        "notes": notes,
    }


@api_router.post("/games/rhythm/submit")
async def rhythm_submit(body: RhythmScoreBody, authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    # Server-side sanity: reject obviously bogus scores
    if not 0.0 <= body.accuracy <= 1.0:
        raise HTTPException(status_code=400, detail="accuracy out of range")
    if body.score < 0 or body.score > 500_000:
        raise HTTPException(status_code=400, detail="score out of range")
    if body.duration_ms < 5000 or body.duration_ms > 180_000:
        raise HTTPException(status_code=400, detail="duration_ms out of range")

    # $SOUND reward formula: 1 token per 200 points, capped at 25, +5 bonus for >=95% accuracy
    reward = min(body.score // 200, 25)
    if body.accuracy >= 0.95:
        reward += 5
    xp_gain = body.score // 50

    # Update best score per user/difficulty
    key = f"rhythm_{body.difficulty}"
    prev = await db.game_scores.find_one(
        {"user_id": user["user_id"], "game": key},
        {"_id": 0},
    )
    is_new_best = (not prev) or body.score > prev.get("best_score", 0)
    if is_new_best:
        await db.game_scores.update_one(
            {"user_id": user["user_id"], "game": key},
            {"$set": {
                "user_id": user["user_id"],
                "game": key,
                "best_score": body.score,
                "best_accuracy": body.accuracy,
                "best_combo": body.max_combo,
                "updated_at": now_utc().isoformat(),
            }},
            upsert=True,
        )

    # Always log the run
    await db.game_runs.insert_one({
        "id": uuid.uuid4().hex,
        "user_id": user["user_id"],
        "game": key,
        "seed": body.seed,
        "score": body.score,
        "max_combo": body.max_combo,
        "accuracy": body.accuracy,
        "duration_ms": body.duration_ms,
        "created_at": now_utc().isoformat(),
    })

    # Award XP via direct progress update; tokens via credit_tokens
    if xp_gain > 0:
        await db.progress.update_one(
            {"user_id": user["user_id"]},
            {"$inc": {"xp": xp_gain}},
            upsert=False,
        )
    credited = None
    if reward > 0:
        credited = await credit_tokens(
            user["user_id"], reward, "rhythm_game", {"score": body.score, "difficulty": body.difficulty}
        )

    bal = credited["progress"]["sound_balance"] if credited else (await db.progress.find_one({"user_id": user["user_id"]}, {"_id": 0}))["sound_balance"]
    return {
        "tokens_awarded": reward,
        "xp_awarded": xp_gain,
        "new_best": is_new_best,
        "balance": bal,
    }


@api_router.get("/games/rhythm/leaderboard")
async def rhythm_leaderboard(difficulty: str = "normal", limit: int = 20):
    key = f"rhythm_{difficulty}"
    pipeline = [
        {"$match": {"game": key}},
        {"$sort": {"best_score": -1}},
        {"$limit": min(max(limit, 1), 100)},
        {"$lookup": {"from": "users", "localField": "user_id", "foreignField": "user_id", "as": "u"}},
        {"$unwind": {"path": "$u", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "_id": 0,
            "user_id": 1,
            "best_score": 1,
            "best_accuracy": 1,
            "best_combo": 1,
            "display_name": {"$ifNull": ["$u.display_name", "$user_id"]},
            "avatar_url": "$u.avatar_url",
        }},
    ]
    rows = await db.game_scores.aggregate(pipeline).to_list(100)
    return [{
        "rank": i + 1,
        "user_id": r["user_id"],
        "display_name": r.get("display_name") or r["user_id"],
        "avatar_url": r.get("avatar_url"),
        "best_score": r.get("best_score", 0),
        "best_accuracy": r.get("best_accuracy", 0),
        "best_combo": r.get("best_combo", 0),
    } for i, r in enumerate(rows)]


# ---------- Audius ----------
def _audius_track_to_dict(t: dict) -> dict:
    user = t.get("user") or {}
    artwork = t.get("artwork") or {}
    cover = (
        artwork.get("480x480") or artwork.get("150x150") or artwork.get("1000x1000")
        or "https://images.pexels.com/photos/164938/pexels-photo-164938.jpeg?auto=compress&w=600"
    )
    return {
        "id": t.get("id"),
        "title": t.get("title") or "Untitled",
        "artist": user.get("name") or user.get("handle") or "Unknown",
        "artist_handle": user.get("handle"),
        "genre": t.get("genre") or "",
        "duration": t.get("duration") or 0,
        "play_count": t.get("play_count") or 0,
        "cover_url": cover,
        "permalink": f"https://audius.co{t.get('permalink', '')}" if t.get("permalink") else None,
    }


@api_router.get("/audius/trending")
async def audius_trending(genre: Optional[str] = None, limit: int = 20):
    try:
        params: dict = {"limit": min(max(limit, 1), 50)}
        if genre:
            params["genre"] = genre
        data = await audius_get("/tracks/trending", params)
        return [_audius_track_to_dict(t) for t in (data or [])]
    except Exception as e:
        logger.warning(f"Audius trending failed: {e}")
        raise HTTPException(status_code=502, detail="Audius API unavailable")


@api_router.get("/audius/search")
async def audius_search(q: str, limit: int = 20):
    if not q.strip():
        return []
    try:
        data = await audius_get("/tracks/search", {"query": q, "limit": min(max(limit, 1), 50)})
        return [_audius_track_to_dict(t) for t in (data or [])]
    except Exception as e:
        logger.warning(f"Audius search failed: {e}")
        raise HTTPException(status_code=502, detail="Audius API unavailable")


@api_router.get("/audius/track/{track_id}/stream")
async def audius_stream_url(track_id: str):
    node = await get_audius_node()
    return {"stream_url": f"{node}/v1/tracks/{track_id}/stream?app_name={AUDIUS_APP_NAME}"}


# ---------- AI Voice (TTS + Whisper via Emergent LLM key) ----------
@api_router.post("/ai/tts")
async def ai_tts(body: TTSBody, authorization: Optional[str] = Header(None)):
    user = await resolve_user_from_authorization(authorization)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="LLM key not configured")
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if len(body.text) > 4096:
        raise HTTPException(status_code=400, detail="text exceeds 4096 chars")
    debited = await debit_tokens(user["user_id"], ACTION_COSTS["tts"], "tts", {"voice": body.voice})
    tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
    try:
        b64 = await tts.generate_speech_base64(
            text=body.text, model=body.model, voice=body.voice,
            speed=body.speed, response_format="mp3",
        )
    except ValueError as ve:
        # Refund on validation failure
        await credit_tokens(user["user_id"], ACTION_COSTS["tts"], "tts_refund", {"err": str(ve)})
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        await credit_tokens(user["user_id"], ACTION_COSTS["tts"], "tts_refund", {"err": str(e)})
        logger.exception("TTS failed")
        raise HTTPException(status_code=502, detail=f"TTS provider error: {e}")
    return {
        "audio_base64": b64,
        "mime_type": "audio/mpeg",
        "voice": body.voice,
        "model": body.model,
        "tokens_spent": ACTION_COSTS["tts"],
        "balance": debited["progress"]["sound_balance"],
    }


@api_router.post("/ai/stt")
async def ai_stt(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None),
):
    await resolve_user_from_authorization(authorization)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="LLM key not configured")
    name = (audio.filename or "").lower()
    suffix = next((e for e in ("m4a", "mp3", "mp4", "mpeg", "mpga", "wav", "webm") if name.endswith(f".{e}")), None)
    if not suffix:
        ct = (audio.content_type or "").lower()
        if "m4a" in ct or "mp4" in ct or "aac" in ct:
            suffix = "m4a"
        elif "wav" in ct:
            suffix = "wav"
        elif "webm" in ct:
            suffix = "webm"
        else:
            suffix = "mp3"
    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty audio upload")
    if len(raw) > AUDIO_MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"audio exceeds {AUDIO_MAX_BYTES} bytes")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{suffix}")
    try:
        tmp.write(raw); tmp.flush(); tmp.close()
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        try:
            with open(tmp.name, "rb") as fh:
                resp = await stt.transcribe(file=fh, model="whisper-1", response_format="json", language=language)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        except Exception as e:
            logger.exception("Whisper failed")
            raise HTTPException(status_code=502, detail=f"STT provider error: {e}")
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass
    text = getattr(resp, "text", None) or (resp.get("text") if isinstance(resp, dict) else None) or ""
    return {"text": text, "language": language}


# ---------- Seed data ----------
SEED_ARTISTS = [
    {"id": "tremayne", "name": "Tremayne", "handle": "tremayne", "tagline": "Visionary entrepreneur building success through creativity and hustle.", "category": "Entrepreneur", "platform": "YouTube", "image_url": "https://img.youtube.com/vi/90A4IMPOmio/maxresdefault.jpg", "external_url": "https://youtube.com", "followers": 24500, "featured": True},
    {"id": "lilmizzy", "name": "Lil Mizzy", "handle": "lilmizzy", "tagline": "Rising star with heat. Stream the latest tracks on Apple Music.", "category": "Hip-Hop", "platform": "Apple Music", "image_url": "https://images.pexels.com/photos/164693/pexels-photo-164693.jpeg?auto=compress&cs=tinysrgb&w=800", "external_url": "https://music.apple.com", "followers": 18200, "featured": True},
    {"id": "lashellz", "name": "Lashellz", "handle": "lashellz", "tagline": "Rising artist bringing fresh vibes and authentic sound.", "category": "R&B", "platform": "Spotify", "image_url": "https://images.pexels.com/photos/3984353/pexels-photo-3984353.jpeg?auto=compress&cs=tinysrgb&w=800", "external_url": "https://spotify.com", "followers": 12300, "featured": True},
    {"id": "treyriddick", "name": "Trey Riddick", "handle": "treyriddick", "tagline": "Hard-hitting bars and authentic hip-hop.", "category": "Hip-Hop", "platform": "Apple Music", "image_url": "https://images.pexels.com/photos/1389994/pexels-photo-1389994.jpeg?auto=compress&cs=tinysrgb&w=800", "external_url": "https://music.apple.com", "followers": 9800, "featured": True},
    {"id": "greatergood", "name": "Greater Good", "handle": "greatergood", "tagline": "Join the movement. Exclusive music, merch and more.", "category": "Collective", "platform": "Web", "image_url": "https://customer-assets.emergentagent.com/job_musicaads/artifacts/g4gpgdkx_IMG_4352.jpeg", "external_url": "https://greatergood.com", "followers": 33400, "featured": True},
    {"id": "redempti0n", "name": "Redempti0n", "handle": "redempti0n", "tagline": "Premium streetwear for those who rise.", "category": "Streetwear", "platform": "Shop", "image_url": "https://images.pexels.com/photos/4066293/pexels-photo-4066293.jpeg?auto=compress&cs=tinysrgb&w=800", "external_url": "https://redempti0n.com", "followers": 15700, "featured": False},
    {"id": "thebleezedot", "name": "thebleezedot", "handle": "thebleezedot", "tagline": "Fire beats for your next hit. Browse exclusive instrumentals.", "category": "Producer", "platform": "BeatStars", "image_url": "https://images.pexels.com/photos/164938/pexels-photo-164938.jpeg?auto=compress&cs=tinysrgb&w=800", "external_url": "https://beatstars.com", "followers": 21900, "featured": True},
    {"id": "thatguy2x", "name": "thatguy2xgaming", "handle": "thatguy2x", "tagline": "Gaming content, live streams, and entertainment.", "category": "Gaming", "platform": "YouTube", "image_url": "https://img.youtube.com/vi/TkATpsHPiDs/maxresdefault.jpg", "external_url": "https://youtube.com", "followers": 8600, "featured": False},
    {"id": "robdollaz", "name": "Rob Dollaz", "handle": "robdollaz", "tagline": "Independent artist making waves on UnitedMasters.", "category": "Hip-Hop", "platform": "UnitedMasters", "image_url": "https://images.pexels.com/photos/2531728/pexels-photo-2531728.jpeg?auto=compress&cs=tinysrgb&w=800", "external_url": "https://unitedmasters.com", "followers": 14200, "featured": False},
    {"id": "jcrtech", "name": "JCR Tech", "handle": "jcrtech", "tagline": "Innovative technology solutions and services.", "category": "Tech", "platform": "Web", "image_url": "https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg?auto=compress&cs=tinysrgb&w=800", "external_url": "https://jcrtech.com", "followers": 5400, "featured": False},
]
SEED_TRACKS = [
    {"id": "godspeed", "title": "God Speed", "artist": "PA Bucks", "genre": "Hip Hop", "cover_url": "https://images.pexels.com/photos/1763075/pexels-photo-1763075.jpeg?auto=compress&cs=tinysrgb&w=600", "platform": "Apple Music", "external_url": "https://music.apple.com", "plays": 52800},
    {"id": "almostfamous", "title": "Almost Famous", "artist": "9kshawn", "genre": "Hip Hop", "cover_url": "https://images.pexels.com/photos/1644924/pexels-photo-1644924.jpeg?auto=compress&cs=tinysrgb&w=600", "platform": "Apple Music", "external_url": "https://music.apple.com", "plays": 41200},
    {"id": "runitup", "title": "Run It Up", "artist": "Thatguy2x", "genre": "Hip Hop", "cover_url": "https://img.youtube.com/vi/TkATpsHPiDs/maxresdefault.jpg", "platform": "YouTube", "external_url": "https://youtube.com/watch?v=TkATpsHPiDs", "plays": 38900},
    {"id": "poundcake", "title": "Pound Cake Freestyle", "artist": "N. Brown", "genre": "Hip Hop", "cover_url": "https://img.youtube.com/vi/ztqMzCanUfk/maxresdefault.jpg", "platform": "YouTube", "external_url": "https://youtube.com/watch?v=ztqMzCanUfk", "plays": 28100},
    {"id": "paradox", "title": "Paradox Vibes", "artist": "The Paradox Band", "genre": "Rock/Alt", "cover_url": "https://img.youtube.com/vi/eXaDWh0I02A/maxresdefault.jpg", "platform": "YouTube", "external_url": "https://youtube.com/watch?v=eXaDWh0I02A", "plays": 18700},
    {"id": "soundvision", "title": "Sound Vision", "artist": "Sound Music", "genre": "Electronic", "cover_url": "https://img.youtube.com/vi/ThOZBIAMlxw/maxresdefault.jpg", "platform": "YouTube", "external_url": "https://youtube.com/watch?v=ThOZBIAMlxw", "plays": 14200},
]
SEED_BEATS = [
    {"id": "b1", "title": "Midnight Trap", "producer": "thebleezedot", "bpm": 142, "key": "F# min", "price": 29.99, "cover_url": "https://images.pexels.com/photos/210922/pexels-photo-210922.jpeg?auto=compress&cs=tinysrgb&w=600", "license": "Non-Exclusive"},
    {"id": "b2", "title": "Diamond Drip", "producer": "thebleezedot", "bpm": 138, "key": "G min", "price": 39.99, "cover_url": "https://images.pexels.com/photos/144429/pexels-photo-144429.jpeg?auto=compress&cs=tinysrgb&w=600", "license": "Premium"},
    {"id": "b3", "title": "Skyline", "producer": "AI Studio", "bpm": 128, "key": "A min", "price": 19.99, "cover_url": "https://images.pexels.com/photos/164819/pexels-photo-164819.jpeg?auto=compress&cs=tinysrgb&w=600", "license": "Lease"},
    {"id": "b4", "title": "Echo Chamber", "producer": "AI Studio", "bpm": 90, "key": "D min", "price": 24.99, "cover_url": "https://images.pexels.com/photos/164938/pexels-photo-164938.jpeg?auto=compress&cs=tinysrgb&w=600", "license": "Lease"},
]
SEED_VIDEOS = [
    {"id": "v1", "title": "Thatguy2x - Run It Up (OFFICIAL MUSIC VIDEO)", "artist": "thatguy2x", "description": "Official music video for Run It Up.", "youtube_id": "TkATpsHPiDs", "thumbnail": "https://img.youtube.com/vi/TkATpsHPiDs/maxresdefault.jpg", "duration": "3:16", "genre": "Hip Hop", "views": 2000},
    {"id": "v2", "title": "N. Brown - Pound Cake Freestyle", "artist": "N. Brown", "description": "Hip hop freestyle over Drake's iconic beat.", "youtube_id": "ztqMzCanUfk", "thumbnail": "https://img.youtube.com/vi/ztqMzCanUfk/maxresdefault.jpg", "duration": "2:48", "genre": "Hip Hop", "views": 3500},
    {"id": "v3", "title": "The Paradox Band Short", "artist": "The Paradox Band", "description": "Latest short bringing unique sounds and vibes.", "youtube_id": "eXaDWh0I02A", "thumbnail": "https://img.youtube.com/vi/eXaDWh0I02A/maxresdefault.jpg", "duration": "0:60", "genre": "Rock/Alt", "views": 500},
    {"id": "v4", "title": "Featured Music Video on Sound", "artist": "Sound Music", "description": "Latest featured music video on Sound app.", "youtube_id": "ThOZBIAMlxw", "thumbnail": "https://img.youtube.com/vi/ThOZBIAMlxw/maxresdefault.jpg", "duration": "3:30", "genre": "Music", "views": 1000},
]
SEED_NEWS = [
    {"id": "n1", "title": "AI Music Generation Transforms the Industry", "summary": "AI tools like Sound enable anyone to produce professional-quality tracks.", "body": "Artificial intelligence is revolutionizing how music is created. Sound enables anyone to produce professional-quality tracks. The democratization of music production opens new opportunities for aspiring artists worldwide.", "category": "AI", "image_url": "https://images.pexels.com/photos/2607311/pexels-photo-2607311.jpeg?auto=compress&cs=tinysrgb&w=800", "published_at": "2026-01-28"},
    {"id": "n2", "title": "Streaming Platforms See Record Growth", "summary": "Independent artists are gaining more visibility than ever before.", "body": "Music streaming continues to dominate consumption patterns. Platforms that support direct artist-to-fan connections are leading the charge.", "category": "Streaming", "image_url": "https://images.pexels.com/photos/3756766/pexels-photo-3756766.jpeg?auto=compress&cs=tinysrgb&w=800", "published_at": "2026-01-25"},
    {"id": "n3", "title": "The Rise of Music NFTs and Digital Ownership", "summary": "New revenue streams for musicians via blockchain.", "body": "Digital tokens and blockchain technology are creating new revenue streams for musicians. From limited edition releases to fan engagement tokens, the future of music monetization is being reimagined.", "category": "Web3", "image_url": "https://images.pexels.com/photos/730547/pexels-photo-730547.jpeg?auto=compress&cs=tinysrgb&w=800", "published_at": "2026-01-20"},
    {"id": "n4", "title": "Mobile-First: Creators Are Producing on Their Phones", "summary": "Mobile DAWs democratize music production.", "body": "A new generation of mobile-first creators is producing chart-ready tracks entirely on their phones, leveraging AI-assisted tools and cloud collaboration.", "category": "Mobile", "image_url": "https://images.pexels.com/photos/3756879/pexels-photo-3756879.jpeg?auto=compress&cs=tinysrgb&w=800", "published_at": "2026-01-15"},
]


@app.on_event("startup")
async def startup():
    await db.users.create_index("email_lower", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.artists.create_index("id", unique=True)
    await db.tracks.create_index("id", unique=True)
    await db.beats.create_index("id", unique=True)
    await db.videos.create_index("id", unique=True)
    await db.news.create_index("id", unique=True)
    await db.statuses.create_index([("user_id", 1), ("created_at", -1)])
    await db.progress.create_index("user_id", unique=True)
    await db.progress.create_index([("sound_balance", -1)])
    await db.progress.create_index([("streak", -1)])
    await db.progress.create_index([("xp", -1)])
    await db.token_transactions.create_index([("user_id", 1), ("created_at", -1)])
    await db.recordings.create_index([("user_id", 1), ("created_at", -1)])
    await db.recordings.create_index("id", unique=True)
    await db.game_scores.create_index([("user_id", 1), ("game", 1)], unique=True)
    await db.game_scores.create_index([("game", 1), ("best_score", -1)])
    await db.game_runs.create_index([("user_id", 1), ("created_at", -1)])
    await db.albums.create_index([("user_id", 1), ("created_at", -1)])
    await db.albums.create_index("id", unique=True)
    await db.posts.create_index([("created_at", -1)])
    await db.posts.create_index("id", unique=True)
    await db.post_likes.create_index([("post_id", 1), ("user_id", 1)], unique=True)
    await db.post_comments.create_index([("post_id", 1), ("created_at", 1)])
    if await db.artists.count_documents({}) == 0:
        await db.artists.insert_many(SEED_ARTISTS)
    if await db.tracks.count_documents({}) == 0:
        await db.tracks.insert_many(SEED_TRACKS)
    if await db.beats.count_documents({}) == 0:
        await db.beats.insert_many(SEED_BEATS)
    if await db.videos.count_documents({}) == 0:
        await db.videos.insert_many(SEED_VIDEOS)
    if await db.news.count_documents({}) == 0:
        await db.news.insert_many(SEED_NEWS)
    # Smartcar / IAP indexes
    await db.smartcar_tokens.create_index("user_id", unique=True)
    await db.vehicle_snapshots.create_index([("user_id", 1), ("created_at", -1)])
    await db.driving_trips.create_index([("user_id", 1), ("created_at", -1)])
    await db.driving_stats.create_index("user_id", unique=True)
    await db.car_mesh.create_index([("created_at", -1)])
    await db.iap_transactions.create_index([("platform", 1), ("tx_key", 1)], unique=True)
    await db.iap_transactions.create_index([("user_id", 1), ("created_at", -1)])
    await db.subscriptions.create_index("user_id", unique=True)
    # Collab + lyric analyses
    await db.collab_posts.create_index([("status", 1), ("created_at", -1)])
    await db.collab_posts.create_index("owner_id")
    await db.collab_applications.create_index([("post_id", 1), ("applicant_id", 1)], unique=True)
    await db.collab_applications.create_index("applicant_id")
    await db.lyric_analyses.create_index([("user_id", 1), ("created_at", -1)])
    await db.users.create_index("privy_did", sparse=True)
    # === Migrate stock pexels cover URLs to branded SoundMesh SVG covers ===
    from urllib.parse import quote as _q
    BRAND_BASE = "/api/branding/cover.svg"
    async def _rebrand(col, title_field: str = "title"):
        cursor = col.find({"cover_url": {"$regex": "images.pexels.com|images.unsplash.com|placeholder.com"}})
        async for d in cursor:
            t = (d.get(title_field) or d.get("name") or "SoundMesh")
            new = f"{BRAND_BASE}?title={_q(t)}&seed={_q(str(d.get('id') or t))}"
            await col.update_one({"_id": d["_id"]}, {"$set": {"cover_url": new}})
    try:
        await _rebrand(db.tracks, "title")
        await _rebrand(db.videos, "title")
        await _rebrand(db.news, "title")
        # artists also have cover_url
        await _rebrand(db.artists, "name")
    except Exception as _e:
        print(f"[branding] migration skipped: {_e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# Register modular routers (Smartcar + IAP) - MUST run BEFORE include_router so they get mounted
smartcar_module.register(api_router, {
    "resolve_user": resolve_user_from_authorization,
    "db": db,
    "credit_tokens": credit_tokens,
})
iap_module.register(api_router, {
    "resolve_user": resolve_user_from_authorization,
    "db": db,
    "credit_tokens": credit_tokens,
})
collab_module.register(api_router, {
    "resolve_user": resolve_user_from_authorization,
    "db": db,
})
lyrics_module.register(api_router, {
    "resolve_user": resolve_user_from_authorization,
    "db": db,
})
privy_module.register(api_router, {
    "resolve_user": resolve_user_from_authorization,
    "db": db,
    "issue_jwt": issue_jwt,
    "users_col": db.users,
})
tracks_module.register(api_router, {
    "resolve_user": resolve_user_from_authorization,
    "db": db,
    "credit_tokens": credit_tokens,
})


async def _resolve_user_opt(authorization: Optional[str]):
    if not authorization:
        return None
    try:
        return await resolve_user_from_authorization(authorization)
    except Exception:
        return None


promo_module.register(api_router, {
    "resolve_user_opt": _resolve_user_opt,
})
youtube_module.register(api_router, {})
branding_module.register(api_router, {})
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
