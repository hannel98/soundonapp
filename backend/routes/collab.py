"""Music Collab Finder.
Users post collab projects (looking for singer/producer/etc.) and others apply.
Owner reviews applications -> accept reveals contact info to both parties.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/collab", tags=["collab"])

ROLES = [
    "Singer", "Songwriter", "Producer", "Beatmaker", "Rapper",
    "Vocalist", "Mixing Engineer", "Mastering Engineer", "Instrumentalist",
]
GENRES = [
    "Hip-Hop", "R&B", "Pop", "Electronic", "Rock", "Indie",
    "Country", "Jazz", "Lo-Fi", "Latin", "Afrobeats", "Other",
]
LOC_PREF = ["Remote", "Local", "Either"]
CONTACT_TYPES = ["email", "discord", "instagram", "phone"]


class ProjectBody(BaseModel):
    title: str = Field(..., min_length=3, max_length=80)
    description: str = Field(..., min_length=10, max_length=1500)
    roles_needed: List[str] = Field(..., min_length=1)
    genre: str
    location_pref: str = "Remote"
    budget: Optional[str] = None  # e.g. "Paid" | "Royalty" | "Free / for portfolio"
    deadline: Optional[str] = None
    contact_type: str = "email"  # what owner will reveal on accept
    contact_value: str  # the actual contact handle/email/etc.


class ApplicationBody(BaseModel):
    role: str
    message: str = Field(..., min_length=5, max_length=800)
    sample_url: Optional[str] = None  # link to portfolio / demo
    contact_type: str = "email"
    contact_value: str


class RespondBody(BaseModel):
    action: str  # "accept" | "decline"


def _clean(d: dict) -> dict:
    d = {k: v for k, v in d.items() if k != "_id"}
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


def register(api_router: APIRouter, dependencies: dict):
    resolve_user = dependencies["resolve_user"]
    db = dependencies["db"]

    @router.get("/meta")
    async def meta():
        return {"roles": ROLES, "genres": GENRES, "location_prefs": LOC_PREF, "contact_types": CONTACT_TYPES}

    @router.post("/posts")
    async def create_post(body: ProjectBody, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        for r in body.roles_needed:
            if r not in ROLES:
                raise HTTPException(status_code=400, detail=f"Unknown role: {r}")
        if body.genre not in GENRES:
            raise HTTPException(status_code=400, detail="Unknown genre")
        if body.location_pref not in LOC_PREF:
            raise HTTPException(status_code=400, detail="Unknown location_pref")
        if body.contact_type not in CONTACT_TYPES:
            raise HTTPException(status_code=400, detail="Unknown contact_type")
        post = {
            "id": secrets.token_hex(8),
            "owner_id": user["user_id"],
            "owner_name": user.get("display_name") or user["email"].split("@")[0],
            "title": body.title.strip(),
            "description": body.description.strip(),
            "roles_needed": body.roles_needed,
            "genre": body.genre,
            "location_pref": body.location_pref,
            "budget": body.budget,
            "deadline": body.deadline,
            "contact_type": body.contact_type,
            "contact_value": body.contact_value,  # hidden until accept
            "status": "open",
            "applications_count": 0,
            "created_at": datetime.now(timezone.utc),
        }
        await db.collab_posts.insert_one(post)
        out = _clean(post)
        out.pop("contact_value", None)
        return out

    @router.get("/posts")
    async def list_posts(
        role: Optional[str] = None,
        genre: Optional[str] = None,
        location_pref: Optional[str] = None,
        limit: int = 30,
        authorization: Optional[str] = Header(None),
    ):
        q: dict = {"status": "open"}
        if role:
            q["roles_needed"] = role
        if genre:
            q["genre"] = genre
        if location_pref and location_pref != "Either":
            q["location_pref"] = {"$in": [location_pref, "Either"]}
        docs = await db.collab_posts.find(q).sort("created_at", -1).limit(min(max(limit, 1), 100)).to_list(100)
        result = []
        for d in docs:
            o = _clean(d)
            o.pop("contact_value", None)
            result.append(o)
        return result

    @router.get("/posts/{post_id}")
    async def get_post(post_id: str, authorization: Optional[str] = Header(None)):
        user = None
        try:
            user = await resolve_user(authorization)
        except Exception:
            pass
        post = await db.collab_posts.find_one({"id": post_id})
        if not post:
            raise HTTPException(status_code=404, detail="Not found")
        out = _clean(post)
        # Only owner sees their own contact_value via /me/posts
        out.pop("contact_value", None)
        # Check if current user already applied
        if user:
            app_doc = await db.collab_applications.find_one(
                {"post_id": post_id, "applicant_id": user["user_id"]}, {"_id": 0}
            )
            if app_doc and isinstance(app_doc.get("created_at"), datetime):
                app_doc["created_at"] = app_doc["created_at"].isoformat()
            out["my_application"] = app_doc
            out["is_owner"] = post["owner_id"] == user["user_id"]
        return out

    @router.post("/posts/{post_id}/apply")
    async def apply(post_id: str, body: ApplicationBody, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        post = await db.collab_posts.find_one({"id": post_id})
        if not post:
            raise HTTPException(status_code=404, detail="Project not found")
        if post["owner_id"] == user["user_id"]:
            raise HTTPException(status_code=400, detail="Cannot apply to your own project")
        if post["status"] != "open":
            raise HTTPException(status_code=400, detail="Project is closed")
        if body.role not in post["roles_needed"]:
            raise HTTPException(status_code=400, detail="Role not requested for this project")
        if body.contact_type not in CONTACT_TYPES:
            raise HTTPException(status_code=400, detail="Unknown contact_type")
        existing = await db.collab_applications.find_one(
            {"post_id": post_id, "applicant_id": user["user_id"]}
        )
        if existing:
            raise HTTPException(status_code=409, detail="Already applied")
        appdoc = {
            "id": secrets.token_hex(8),
            "post_id": post_id,
            "post_title": post["title"],
            "owner_id": post["owner_id"],
            "applicant_id": user["user_id"],
            "applicant_name": user.get("display_name") or user["email"].split("@")[0],
            "role": body.role,
            "message": body.message.strip(),
            "sample_url": body.sample_url,
            "contact_type": body.contact_type,
            "contact_value": body.contact_value,  # hidden until accept
            "status": "pending",
            "created_at": datetime.now(timezone.utc),
        }
        await db.collab_applications.insert_one(appdoc)
        await db.collab_posts.update_one(
            {"id": post_id}, {"$inc": {"applications_count": 1}}
        )
        out = _clean(appdoc)
        out.pop("contact_value", None)
        return out

    @router.get("/posts/{post_id}/applications")
    async def list_applications(post_id: str, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        post = await db.collab_posts.find_one({"id": post_id})
        if not post:
            raise HTTPException(status_code=404, detail="Not found")
        if post["owner_id"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Only owner can view applications")
        docs = await db.collab_applications.find({"post_id": post_id}).sort("created_at", -1).to_list(200)
        return [_clean(d) for d in docs]

    @router.post("/applications/{app_id}/respond")
    async def respond(app_id: str, body: RespondBody, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        appdoc = await db.collab_applications.find_one({"id": app_id})
        if not appdoc:
            raise HTTPException(status_code=404, detail="Application not found")
        post = await db.collab_posts.find_one({"id": appdoc["post_id"]})
        if not post or post["owner_id"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Only owner can respond")
        if body.action not in ("accept", "decline"):
            raise HTTPException(status_code=400, detail="action must be accept or decline")
        new_status = "accepted" if body.action == "accept" else "declined"
        await db.collab_applications.update_one(
            {"id": app_id},
            {"$set": {"status": new_status, "responded_at": datetime.now(timezone.utc)}},
        )
        out_app = await db.collab_applications.find_one({"id": app_id}, {"_id": 0})
        out_app = _clean(out_app) if out_app else {}
        result = {"application": out_app}
        if new_status == "accepted":
            # Reveal contacts to both sides
            result["owner_contact"] = {
                "type": post["contact_type"], "value": post["contact_value"], "name": post["owner_name"]
            }
            result["applicant_contact"] = {
                "type": appdoc["contact_type"], "value": appdoc["contact_value"], "name": appdoc["applicant_name"]
            }
        return result

    @router.get("/me")
    async def my_collab(authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        my_posts = await db.collab_posts.find({"owner_id": user["user_id"]}).sort("created_at", -1).to_list(100)
        my_apps = await db.collab_applications.find({"applicant_id": user["user_id"]}).sort("created_at", -1).to_list(100)
        return {
            "posts": [_clean(p) for p in my_posts],  # includes their own contact_value
            "applications": [_clean(a) for a in my_apps],
        }

    api_router.include_router(router)
