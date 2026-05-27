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

from emergentintegrations.llm.openai.text_to_speech import OpenAITextToSpeech
from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText

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


class TTSBody(BaseModel):
    text: str
    voice: str = "alloy"
    speed: float = 1.0
    model: str = "tts-1"


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
        "user_id": user_id, "sound_balance": 0, "xp": 0, "streak": 0, "best_streak": 0,
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
    await resolve_user_from_authorization(authorization)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="LLM key not configured")
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if len(body.text) > 4096:
        raise HTTPException(status_code=400, detail="text exceeds 4096 chars")
    tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
    try:
        b64 = await tts.generate_speech_base64(
            text=body.text, model=body.model, voice=body.voice,
            speed=body.speed, response_format="mp3",
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.exception("TTS failed")
        raise HTTPException(status_code=502, detail=f"TTS provider error: {e}")
    return {"audio_base64": b64, "mime_type": "audio/mpeg", "voice": body.voice, "model": body.model}


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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
