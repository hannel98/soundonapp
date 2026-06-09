"""P2P car marketplace - first slice.

Real integrations live:
  * NHTSA vPIC VIN decoder (free, no key)
  * Reuses existing Smartcar module for odometer/location verification

Stubbed (returns deterministic mock data, ready to swap for real API):
  * Vehicle history report (Bumper/carVertical)
  * Pricing engine (MarketCheck / KBB)
  * Identity verification (Persona / Stripe Identity)
  * Escrow + Stripe Connect payout
"""
from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from typing import Optional, List

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

router = APIRouter(prefix="/cars", tags=["cars"])

VIN_RE = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")


class VINDecode(BaseModel):
    vin: str

    @field_validator("vin")
    @classmethod
    def _v(cls, v: str) -> str:
        v = v.strip().upper()
        if not VIN_RE.fullmatch(v):
            raise ValueError("VIN must be 17 chars, no I/O/Q")
        return v


class ListingBody(BaseModel):
    vin: str
    year: Optional[int] = None
    make: Optional[str] = None
    model: Optional[str] = None
    trim: Optional[str] = None
    engine: Optional[str] = None
    mileage: int = Field(..., ge=0, le=2_000_000)
    asking_price: int = Field(..., ge=100, le=2_000_000)
    description: str = Field("", max_length=4000)
    photo_urls: List[str] = []
    video_urls: List[str] = []
    zip_code: Optional[str] = None
    verified_via_smartcar: bool = False


def register(api_router: APIRouter, dependencies: dict):
    resolve_user = dependencies["resolve_user"]
    db = dependencies["db"]

    @router.post("/vin/decode")
    async def vin_decode(body: VINDecode):
        url = f"https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{body.vin}?format=json"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(url)
                r.raise_for_status()
                data = r.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"NHTSA fetch failed: {e}")
        results = (data.get("Results") or [{}])[0]
        return {
            "vin": body.vin,
            "year": int(results["ModelYear"]) if results.get("ModelYear", "").isdigit() else None,
            "make": results.get("Make") or None,
            "model": results.get("Model") or None,
            "trim": results.get("Trim") or None,
            "engine": results.get("EngineConfiguration") or results.get("DisplacementL") or None,
            "body_class": results.get("BodyClass") or None,
            "fuel_type": results.get("FuelTypePrimary") or None,
            "drive_type": results.get("DriveType") or None,
            "raw": {k: v for k, v in results.items() if v},
        }

    @router.post("/listings")
    async def create_listing(body: ListingBody, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        if not VIN_RE.fullmatch(body.vin.upper()):
            raise HTTPException(status_code=400, detail="Invalid VIN")
        # Identity gate (stubbed - mark verified upon Persona stub success)
        u = await db.users.find_one({"user_id": user["user_id"]})
        if u and not u.get("identity_verified"):
            raise HTTPException(status_code=403, detail="Verify identity before listing")
        doc = {
            "id": secrets.token_hex(8),
            "seller_id": user["user_id"],
            "seller_name": user.get("display_name") or user["email"].split("@")[0],
            "vin": body.vin.upper(),
            "year": body.year, "make": body.make, "model": body.model,
            "trim": body.trim, "engine": body.engine,
            "mileage": body.mileage,
            "asking_price": body.asking_price,
            "description": body.description.strip(),
            "photo_urls": body.photo_urls,
            "video_urls": body.video_urls,
            "zip_code": body.zip_code,
            "verified_via_smartcar": bool(body.verified_via_smartcar),
            "status": "active",
            "views": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.car_listings.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/listings")
    async def list_cars(limit: int = 30, make: Optional[str] = None):
        q: dict = {"status": "active"}
        if make:
            q["make"] = {"$regex": f"^{re.escape(make)}$", "$options": "i"}
        docs = await db.car_listings.find(q, {"_id": 0}).sort("created_at", -1).limit(min(max(limit, 1), 100)).to_list(100)
        return docs

    @router.get("/listings/{lid}")
    async def get_listing(lid: str, authorization: Optional[str] = Header(None)):
        doc = await db.car_listings.find_one({"id": lid}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Not found")
        await db.car_listings.update_one({"id": lid}, {"$inc": {"views": 1}})
        return doc

    @router.delete("/listings/{lid}")
    async def del_listing(lid: str, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        res = await db.car_listings.delete_one({"id": lid, "seller_id": user["user_id"]})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}

    @router.get("/history/{vin}")
    async def vehicle_history(vin: str):
        """STUB - simulates Bumper/carVertical. Deterministic from VIN hash."""
        vin = vin.upper()
        if not VIN_RE.fullmatch(vin):
            raise HTTPException(status_code=400, detail="Invalid VIN")
        h = sum(ord(c) for c in vin)
        return {
            "vin": vin,
            "accidents": h % 4,
            "salvage_title": h % 17 == 0,
            "active_liens": h % 13 == 0,
            "open_recalls": h % 5,
            "owners": (h % 4) + 1,
            "last_reported_mileage": 50000 + (h % 90000),
            "source": "stub",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    @router.get("/pricing/{vin}")
    async def pricing(vin: str, mileage: int = 60000, zip_code: Optional[str] = None):
        """STUB - simulates MarketCheck/KBB."""
        h = sum(ord(c) for c in vin.upper())
        base = 18000 + (h % 28000)
        # depreciate by mileage
        depr = max(0.4, 1 - (mileage / 200000))
        target = int(base * depr)
        return {
            "vin": vin.upper(),
            "wholesale": int(target * 0.78),
            "fair_low": int(target * 0.93),
            "fair_high": int(target * 1.07),
            "retail": int(target * 1.18),
            "currency": "USD",
            "source": "stub",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    @router.post("/identity/verify")
    async def identity_verify(authorization: Optional[str] = Header(None)):
        """STUB - simulates Persona / Stripe Identity. Auto-approves."""
        user = await resolve_user(authorization)
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"identity_verified": True, "identity_verified_at": datetime.now(timezone.utc)}},
        )
        return {"status": "approved", "verified": True, "source": "stub"}

    @router.post("/escrow/create")
    async def escrow_create(body: dict, authorization: Optional[str] = Header(None)):
        """STUB - simulates Escrow.com transaction creation."""
        user = await resolve_user(authorization)
        lid = body.get("listing_id")
        listing = await db.car_listings.find_one({"id": lid})
        if not listing:
            raise HTTPException(status_code=404, detail="Listing not found")
        if listing["seller_id"] == user["user_id"]:
            raise HTTPException(status_code=400, detail="Can't buy your own listing")
        tx_id = "esc_" + secrets.token_hex(8)
        doc = {
            "id": tx_id,
            "listing_id": lid,
            "buyer_id": user["user_id"],
            "seller_id": listing["seller_id"],
            "amount": listing["asking_price"],
            "fee_amount": int(listing["asking_price"] * 0.01),
            "status": "funds_secured",  # funds_secured -> meetup -> signoff -> released
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.car_escrow.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.post("/escrow/{tx_id}/release")
    async def escrow_release(tx_id: str, authorization: Optional[str] = Header(None)):
        """STUB - 99% to seller, 1% to platform."""
        user = await resolve_user(authorization)
        tx = await db.car_escrow.find_one({"id": tx_id})
        if not tx:
            raise HTTPException(status_code=404, detail="Not found")
        if tx["buyer_id"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Only buyer can release")
        await db.car_escrow.update_one(
            {"id": tx_id},
            {"$set": {"status": "released", "released_at": datetime.now(timezone.utc).isoformat()}},
        )
        tx.pop("_id", None)
        tx["status"] = "released"
        tx["payouts"] = {
            "seller_amount": tx["amount"] - tx["fee_amount"],
            "platform_fee": tx["fee_amount"],
        }
        return tx

    api_router.include_router(router)
