"""Ad reward endpoint - credits $SOUND when a rewarded ad completes.
For MVP this trusts the client signal. Production should verify via HypeLab
server-to-server callback once available.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/ads", tags=["ads"])

REWARD_PER_AD = 5
COOLDOWN_S = 60
_last_claim: dict[str, float] = {}


class RewardBody(BaseModel):
    placement: str


def register(api_router: APIRouter, dependencies: dict):
    resolve_user = dependencies["resolve_user"]
    db = dependencies["db"]
    credit_tokens = dependencies["credit_tokens"]

    @router.post("/reward")
    async def reward(body: RewardBody, authorization: Optional[str] = Header(None)):
        user = await resolve_user(authorization)
        now = time.time()
        last = _last_claim.get(user["user_id"], 0)
        if now - last < COOLDOWN_S:
            raise HTTPException(status_code=429, detail=f"Wait {int(COOLDOWN_S - (now - last))}s before next reward")
        _last_claim[user["user_id"]] = now
        credit = await credit_tokens(
            user["user_id"], REWARD_PER_AD, "ad_reward",
            {"placement": body.placement},
        )
        await db.ad_views.insert_one({
            "user_id": user["user_id"],
            "placement": body.placement,
            "credited": REWARD_PER_AD,
            "created_at": datetime.now(timezone.utc),
        })
        return {"ok": True, "sound_awarded": REWARD_PER_AD, "balance": credit["progress"]["sound_balance"]}

    api_router.include_router(router)
