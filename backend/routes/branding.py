"""Dynamic branded SVG cover generator.
Used as the default placeholder for tracks/videos/news/etc.

Endpoint: GET /api/branding/cover.svg?title=X&seed=Y
Returns SVG with the SOUND wordmark on a deterministic gradient.
"""
from __future__ import annotations

import hashlib
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import Response

router = APIRouter(prefix="/branding", tags=["branding"])


def _hash_int(s: str, mod: int) -> int:
    return int(hashlib.sha256(s.encode("utf-8")).hexdigest(), 16) % mod


def _hue(seed: str) -> int:
    return _hash_int(seed or "soundmesh", 360)


def _accent_hue(seed: str) -> int:
    return (_hue(seed) + 35) % 360


def _esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def make_cover_svg(title: str = "SoundMesh", seed: Optional[str] = None, size: int = 600) -> str:
    seed = seed or title or "soundmesh"
    h1 = _hue(seed)
    h2 = _accent_hue(seed)
    safe_title = _esc(title)[:48]
    return f"""<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {size} {size}' width='{size}' height='{size}'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='hsl({h1},78%,18%)'/>
      <stop offset='100%' stop-color='hsl({h2},92%,10%)'/>
    </linearGradient>
    <radialGradient id='ring' cx='75%' cy='25%' r='65%'>
      <stop offset='0%' stop-color='hsla({h2},100%,60%,0.35)'/>
      <stop offset='60%' stop-color='hsla({h1},90%,40%,0.05)'/>
      <stop offset='100%' stop-color='transparent'/>
    </radialGradient>
  </defs>
  <rect width='{size}' height='{size}' fill='url(#g)'/>
  <rect width='{size}' height='{size}' fill='url(#ring)'/>
  <!-- Equalizer bars -->
  <g fill='hsl({h2},100%,80%)' opacity='0.85'>
    <rect x='{int(size*0.08)}' y='{int(size*0.62)}' width='{int(size*0.06)}' height='{int(size*0.18)}' rx='4'/>
    <rect x='{int(size*0.17)}' y='{int(size*0.42)}' width='{int(size*0.06)}' height='{int(size*0.38)}' rx='4'/>
    <rect x='{int(size*0.26)}' y='{int(size*0.55)}' width='{int(size*0.06)}' height='{int(size*0.25)}' rx='4'/>
    <rect x='{int(size*0.35)}' y='{int(size*0.30)}' width='{int(size*0.06)}' height='{int(size*0.50)}' rx='4'/>
    <rect x='{int(size*0.44)}' y='{int(size*0.50)}' width='{int(size*0.06)}' height='{int(size*0.30)}' rx='4'/>
    <rect x='{int(size*0.53)}' y='{int(size*0.38)}' width='{int(size*0.06)}' height='{int(size*0.42)}' rx='4'/>
    <rect x='{int(size*0.62)}' y='{int(size*0.55)}' width='{int(size*0.06)}' height='{int(size*0.25)}' rx='4'/>
    <rect x='{int(size*0.71)}' y='{int(size*0.45)}' width='{int(size*0.06)}' height='{int(size*0.35)}' rx='4'/>
    <rect x='{int(size*0.80)}' y='{int(size*0.60)}' width='{int(size*0.06)}' height='{int(size*0.20)}' rx='4'/>
  </g>
  <!-- SOUND wordmark -->
  <text x='50%' y='44%' text-anchor='middle' font-family='Helvetica Neue, Arial Black, sans-serif'
        font-weight='900' font-size='{int(size*0.18)}' letter-spacing='8'
        fill='#fff'>SOUND</text>
  <text x='50%' y='52%' text-anchor='middle' font-family='Helvetica Neue, sans-serif'
        font-size='{int(size*0.045)}' letter-spacing='6' fill='hsl({h2},90%,70%)'>MESH</text>
  <!-- Title -->
  <text x='50%' y='90%' text-anchor='middle' font-family='Helvetica Neue, sans-serif'
        font-size='{int(size*0.04)}' fill='rgba(255,255,255,0.85)'>{safe_title}</text>
</svg>"""


def register(api_router: APIRouter, dependencies: dict):
    @router.get("/cover.svg")
    async def cover_svg(title: str = "SoundMesh", seed: Optional[str] = None, size: int = 600):
        svg = make_cover_svg(title=title, seed=seed, size=max(200, min(size, 1200)))
        return Response(
            content=svg,
            media_type="image/svg+xml",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    api_router.include_router(router)


def branded_cover_url(base_url: str, title: str, seed: Optional[str] = None) -> str:
    """Helper to construct a branded cover URL given the public base URL."""
    from urllib.parse import quote
    s = quote(seed or title or "", safe="")
    t = quote(title or "", safe="")
    return f"{base_url.rstrip('/')}/api/branding/cover.svg?title={t}&seed={s}"
