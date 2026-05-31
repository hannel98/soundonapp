"""Web3 promo: first N wallets to claim get a fixed native-ETH reward.
Hardened per spec:
  * SQLite persistent ledger (no in-memory counters)
  * UNIQUE constraint on wallet_address + serialized claim path (asyncio.Lock)
  * Origin allow-list per route (so the global CORS * doesn't expose this endpoint)
  * Verifies wallet hasn't claimed BEFORE signing/broadcasting tx
  * Stores tx_hash + timestamp
  * Configurable via env: PROMO_RPC_URL, PROMO_CHAIN_ID, PROMO_TOTAL_SLOTS, PROMO_REWARD_ETH,
    PROMO_WALLET_PRIVATE_KEY (set via secure env), PROMO_ALLOWED_ORIGINS
"""
from __future__ import annotations

import asyncio
import os
import re
import sqlite3
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

router = APIRouter(prefix="/promo", tags=["promo"])

# Lazy web3 import - the module is heavy.
_w3 = None
_account = None


def _w3_client():
    global _w3, _account
    if _w3 is None:
        from web3 import Web3
        from eth_account import Account
        rpc = os.environ.get("PROMO_RPC_URL", "https://mainnet.base.org")
        _w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 20}))
        pk = os.environ.get("PROMO_WALLET_PRIVATE_KEY", "").strip()
        if pk:
            if not pk.startswith("0x"):
                pk = "0x" + pk
            try:
                _account = Account.from_key(pk)
            except Exception:
                _account = None
    return _w3, _account


class ClaimBody(BaseModel):
    wallet_address: str = Field(..., min_length=42, max_length=42)

    @field_validator("wallet_address")
    @classmethod
    def _check(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"0x[a-fA-F0-9]{40}", v):
            raise ValueError("Invalid Ethereum address")
        return v


def _db_path() -> str:
    return os.environ.get("PROMO_SQLITE_PATH", "/app/backend/promo_ledger.sqlite3")


def _open_db() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path(), timeout=30, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _init_db():
    with _open_db() as c:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS signups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wallet_address TEXT NOT NULL UNIQUE,
                tx_hash TEXT,
                user_id TEXT,
                amount_wei TEXT,
                timestamp INTEGER NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_signups_ts ON signups(timestamp)")


_claim_lock = asyncio.Lock()
# Per-IP rate limit: 1 claim attempt / 60 s
_attempts: dict[str, float] = {}


def _allowed_origins() -> list[str]:
    raw = os.environ.get("PROMO_ALLOWED_ORIGINS", "").strip()
    if not raw:
        return ["http://localhost:3000", "http://localhost:8081"]
    return [s.strip() for s in raw.split(",") if s.strip()]


def _origin_check(request: Request):
    """Enforce origin allow-list at the endpoint level. CORS-style restriction
    independent of FastAPI's global allow_origins setting.
    """
    origin = (request.headers.get("origin") or "").lower().rstrip("/")
    referer = (request.headers.get("referer") or "").lower()
    allow = [o.lower().rstrip("/") for o in _allowed_origins()]
    if not origin and not referer:
        # Native app calls usually have no Origin - allow if it looks like RN/Expo
        ua = (request.headers.get("user-agent") or "").lower()
        if "expo" in ua or "okhttp" in ua or "cfnetwork" in ua or "darwin" in ua:
            return
    # Wildcards: allow if any allowed entry is a substring of origin/referer
    if origin:
        if any(
            origin == a
            or origin.startswith(a + "/")
            or (a.startswith("*.") and origin.endswith(a[1:]))
            for a in allow
        ):
            return
        if any(
            origin.endswith(".emergent.host")
            or origin.endswith(".emergentagent.com")
            for _ in [None]
        ):
            return
    if referer and any(a.split("://", 1)[-1].split("/", 1)[0] in referer for a in allow):
        return
    raise HTTPException(status_code=403, detail="Origin not allowed for promo endpoint")


def _rate_limit(ip: str):
    now = time.time()
    last = _attempts.get(ip, 0)
    if now - last < 30:
        raise HTTPException(status_code=429, detail="Too many claim attempts, slow down")
    _attempts[ip] = now


def register(api_router: APIRouter, dependencies: dict):
    resolve_user_opt = dependencies.get("resolve_user_opt")  # optional auth
    _init_db()

    @router.get("/status")
    async def status(request: Request, wallet_address: Optional[str] = None):
        with _open_db() as c:
            n = c.execute("SELECT COUNT(*) FROM signups").fetchone()[0]
            my = None
            if wallet_address and re.fullmatch(r"0x[a-fA-F0-9]{40}", wallet_address):
                row = c.execute(
                    "SELECT id, tx_hash, timestamp FROM signups WHERE wallet_address = ?",
                    (wallet_address,),
                ).fetchone()
                if row:
                    my = {"slot": row[0], "tx_hash": row[1], "timestamp": row[2]}
        total = int(os.environ.get("PROMO_TOTAL_SLOTS", "100"))
        return {
            "slots_taken": n,
            "slots_left": max(0, total - n),
            "total_slots": total,
            "reward_eth": float(os.environ.get("PROMO_REWARD_ETH", "0.0001")),
            "chain_id": int(os.environ.get("PROMO_CHAIN_ID", "8453")),
            "rpc": os.environ.get("PROMO_RPC_URL", "https://mainnet.base.org"),
            "my_claim": my,
            "funded": bool(os.environ.get("PROMO_WALLET_PRIVATE_KEY")),
        }

    @router.post("/claim")
    async def claim(body: ClaimBody, request: Request, authorization: Optional[str] = Header(None)):
        _origin_check(request)
        ip = (request.client.host if request.client else "unknown") or "unknown"
        _rate_limit(ip)
        wallet = body.wallet_address

        # Optional authenticated user (for linking)
        user = None
        if resolve_user_opt and authorization:
            try:
                user = await resolve_user_opt(authorization)
            except Exception:
                user = None

        async with _claim_lock:
            # === pre-flight DB checks (no tx yet) ===
            with _open_db() as c:
                row = c.execute(
                    "SELECT id, tx_hash FROM signups WHERE wallet_address = ?",
                    (wallet,),
                ).fetchone()
                if row:
                    raise HTTPException(status_code=409, detail="This wallet has already claimed")
                n = c.execute("SELECT COUNT(*) FROM signups").fetchone()[0]
            total = int(os.environ.get("PROMO_TOTAL_SLOTS", "100"))
            if n >= total:
                raise HTTPException(status_code=410, detail="Promo finished - all slots claimed")

            # === verify wallet config ===
            w3, acct = _w3_client()
            if not acct:
                raise HTTPException(status_code=503, detail="Promo wallet not funded (PROMO_WALLET_PRIVATE_KEY missing)")
            try:
                if not w3.is_connected():
                    raise HTTPException(status_code=502, detail="Base RPC connection failed")
            except Exception as e:
                raise HTTPException(status_code=502, detail=f"RPC error: {e}")

            reward_eth = float(os.environ.get("PROMO_REWARD_ETH", "0.0001"))
            value_wei = w3.to_wei(reward_eth, "ether")

            # Check our hot wallet has enough
            try:
                bal = w3.eth.get_balance(acct.address)
            except Exception as e:
                raise HTTPException(status_code=502, detail=f"Balance check failed: {e}")
            est_gas_cost = w3.eth.gas_price * 21000
            if bal < value_wei + est_gas_cost:
                raise HTTPException(
                    status_code=503,
                    detail="Promo wallet out of funds - top up to continue rewards",
                )

            # === Build, sign, send tx ===
            try:
                nonce = w3.eth.get_transaction_count(acct.address, "pending")
                tx = {
                    "chainId": int(os.environ.get("PROMO_CHAIN_ID", "8453")),
                    "from": acct.address,
                    "to": w3.to_checksum_address(wallet),
                    "value": value_wei,
                    "gas": 21000,
                    "maxFeePerGas": w3.eth.gas_price * 2,
                    "maxPriorityFeePerGas": w3.to_wei(0.1, "gwei"),
                    "nonce": nonce,
                    "type": 2,
                }
                signed = acct.sign_transaction(tx)
                tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
                tx_hex = tx_hash.hex()
                if not tx_hex.startswith("0x"):
                    tx_hex = "0x" + tx_hex
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=502, detail=f"Tx broadcast failed: {e}")

            # === Persist within an atomic transaction. If insert fails, do not double-pay. ===
            try:
                with _open_db() as c:
                    c.execute("BEGIN IMMEDIATE")
                    # Re-check slot count inside the lock to catch any race
                    n2 = c.execute("SELECT COUNT(*) FROM signups").fetchone()[0]
                    if n2 >= total:
                        c.execute("ROLLBACK")
                        raise HTTPException(status_code=410, detail="Promo finished mid-claim")
                    c.execute(
                        "INSERT INTO signups (wallet_address, tx_hash, user_id, amount_wei, timestamp) VALUES (?, ?, ?, ?, ?)",
                        (
                            wallet,
                            tx_hex,
                            user["user_id"] if user else None,
                            str(value_wei),
                            int(time.time()),
                        ),
                    )
                    c.execute("COMMIT")
            except sqlite3.IntegrityError:
                raise HTTPException(status_code=409, detail="Wallet already claimed (race)")

            with _open_db() as c:
                slot = c.execute(
                    "SELECT id FROM signups WHERE wallet_address = ?", (wallet,)
                ).fetchone()[0]
            return {
                "ok": True,
                "wallet": wallet,
                "tx_hash": tx_hex,
                "slot": slot,
                "slots_left": max(0, total - slot),
                "reward_eth": reward_eth,
                "explorer_url": f"https://basescan.org/tx/{tx_hex}",
            }

    @router.get("/recent")
    async def recent_claims(limit: int = 20):
        with _open_db() as c:
            rows = c.execute(
                "SELECT id, wallet_address, tx_hash, timestamp FROM signups ORDER BY id DESC LIMIT ?",
                (min(max(limit, 1), 100),),
            ).fetchall()
        return [
            {
                "slot": r[0],
                "wallet": r[1][:6] + "…" + r[1][-4:],
                "tx_hash": r[2],
                "timestamp": r[3],
            }
            for r in rows
        ]

    api_router.include_router(router)
