"""Featured YouTube channels via RSS (no API key needed).
RSS feed format: https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}
Returns up to ~15 latest videos with title/published/videoId/thumbnail.
"""
from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from xml.etree import ElementTree as ET

router = APIRouter(prefix="/youtube", tags=["youtube"])

# Curated featured channels for the home feed.
FEATURED_CHANNELS = [
    {
        "handle": "SoLauraPodcast",
        "channel_id": "UC76Mm-NblodizsVP9fpruJQ",
        "display_name": "So Laura Podcast",
        "url": "https://m.youtube.com/@SoLauraPodcast/videos",
        "category": "Podcast",
        "featured": True,
    },
]

_cache: dict[str, tuple[float, list]] = {}
_CACHE_TTL = 600  # 10 minutes


async def _fetch_channel_rss(channel_id: str) -> list[dict]:
    now = time.time()
    cached = _cache.get(channel_id)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
            r = await c.get(url, headers={"User-Agent": "SoundMesh/1.0"})
            r.raise_for_status()
            xml = r.text
    except Exception as e:
        # Return stale if available
        if cached:
            return cached[1]
        raise HTTPException(status_code=502, detail=f"YouTube RSS fetch failed: {e}")
    ns = {
        "a": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }
    items: list[dict] = []
    try:
        root = ET.fromstring(xml)
        for entry in root.findall("a:entry", ns):
            vid_el = entry.find("yt:videoId", ns)
            title_el = entry.find("a:title", ns)
            published_el = entry.find("a:published", ns)
            link_el = entry.find("a:link", ns)
            thumb_el = entry.find("media:group/media:thumbnail", ns)
            desc_el = entry.find("media:group/media:description", ns)
            if vid_el is None or title_el is None:
                continue
            vid = vid_el.text or ""
            items.append({
                "video_id": vid,
                "title": (title_el.text or "").strip(),
                "url": (link_el.get("href") if link_el is not None else f"https://www.youtube.com/watch?v={vid}"),
                "published": (published_el.text if published_el is not None else None),
                "thumb_url": (thumb_el.get("url") if thumb_el is not None else f"https://img.youtube.com/vi/{vid}/maxresdefault.jpg"),
                "description": (desc_el.text or "").strip() if desc_el is not None else "",
            })
    except ET.ParseError:
        if cached:
            return cached[1]
        raise HTTPException(status_code=502, detail="Could not parse YouTube RSS")
    _cache[channel_id] = (now, items)
    return items


def register(api_router: APIRouter, dependencies: dict):
    @router.get("/featured")
    async def list_featured(limit: int = 8):
        out = []
        for ch in FEATURED_CHANNELS:
            videos = await _fetch_channel_rss(ch["channel_id"])
            out.append({
                **ch,
                "videos": videos[: min(max(limit, 1), 15)],
            })
        return out

    @router.get("/channel/{channel_id}")
    async def channel_videos(channel_id: str, limit: int = 15):
        if not re.fullmatch(r"UC[A-Za-z0-9_-]{22}", channel_id):
            raise HTTPException(status_code=400, detail="Invalid channel id")
        items = await _fetch_channel_rss(channel_id)
        return items[: min(max(limit, 1), 15)]

    api_router.include_router(router)
