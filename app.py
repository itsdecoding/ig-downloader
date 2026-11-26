import os
import re
import time
import shutil
import asyncio
import tempfile
import urllib.parse
from collections import defaultdict, deque
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Header, Request, UploadFile, File, Form
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    RedirectResponse,
    StreamingResponse,
    PlainTextResponse,
    Response,
)
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.background import BackgroundTask
from starlette.datastructures import MutableHeaders
from pydantic import BaseModel
from dotenv import load_dotenv
import httpx
import yt_dlp

import landing_pages

# Load environment variables from .env if present
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

# Optional search/analytics tags. Both are empty by default: no token, no tag,
# no bytes. Set them as environment variables in Render when the tokens exist.
GOOGLE_SITE_VERIFICATION = (os.getenv("GOOGLE_SITE_VERIFICATION") or "").strip()
CF_ANALYTICS_TOKEN = (os.getenv("CF_ANALYTICS_TOKEN") or "").strip()

# Groq Whisper API for /tools/video-to-text
GROQ_API_KEY = (os.getenv("GROQ_API_KEY") or "").strip()
GROQ_WHISPER_MODEL = (os.getenv("GROQ_WHISPER_MODEL") or "whisper-large-v3-turbo").strip()

# Bump when the page content changes so the sitemap's lastmod stays truthful.
SITE_UPDATED = "2026-11-26"

# Optional Proxy Configuration
PROXY_URL = os.getenv("PROXY_URL") or os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY")

# Only allow proxying media from Instagram's public CDN hosts.
ALLOWED_VIDEO_CDN_SUFFIXES = (
    "cdninstagram.com",
    "fbcdn.net",
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "tiktokcdn-eu.com",
    "tiktokv.com",
    "tiktok.com",
    "byteoversea.com",
    "ibytedtos.com",
    "muscdn.com",
    "googlevideo.com",
)
ALLOWED_THUMB_CDN_SUFFIXES = (
    "cdninstagram.com",
    "fbcdn.net",
    "ytimg.com",
    "ggpht.com",
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "tiktokcdn-eu.com",
    "tiktokv.com",
    "ibytedtos.com",
    "muscdn.com",
)

# Refuse to proxy absurdly large files (safety valve, not a product limit).
MAX_DOWNLOAD_BYTES = 300 * 1024 * 1024
MAX_TRANSCRIBE_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_TRANSCRIBE_DURATION_SEC = 600
MAX_GROQ_AUDIO_BYTES = 24 * 1024 * 1024
ALLOWED_MEDIA_EXTS = {
    ".mp4", ".mov", ".webm", ".mkv", ".m4a", ".mp3", ".wav", ".ogg", ".mpeg", ".aac"
}

# Short-lived extraction cache: repeat requests for the same post reuse the
# resolved stream instead of hitting Instagram again.
_EXTRACT_CACHE: Dict[str, Tuple[float, Any]] = {}
_EXTRACT_CACHE_TTL = 600
_EXTRACT_CACHE_MAX = 500

# Cached upstream headers (cookies/referer/user-agent) returned by yt-dlp for CDN URLs
_MEDIA_HEADERS_CACHE: Dict[str, Tuple[float, Dict[str, str]]] = {}

# Simple sliding-window rate limiter per IP for expensive FFmpeg/Groq endpoints
_RATE_BUCKETS: Dict[str, deque] = defaultdict(deque)

class TranscribeBodyLimitMiddleware:
    """Reject oversized transcription uploads before Starlette spools the body."""

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if (
            scope.get("type") == "http"
            and scope.get("method") == "POST"
            and scope.get("path") == "/api/transcribe"
        ):
            for key, value in scope.get("headers") or []:
                if key == b"content-length":
                    try:
                        too_big = int(value) > self.max_bytes
                    except (TypeError, ValueError):
                        too_big = False
                    if too_big:
                        body = b'{"detail":"Clip is too large. Keep uploads under 50 MB."}'
                        await send(
                            {
                                "type": "http.response.start",
                                "status": 413,
                                "headers": [
                                    (b"content-type", b"application/json"),
                                    (b"content-length", str(len(body)).encode()),
                                    (b"connection", b"close"),
                                ],
                            }
                        )
                        await send({"type": "http.response.body", "body": body})
                        return
                    break
        await self.app(scope, receive, send)


class StaticCacheMiddleware:
    """Give hashed/versioned static assets a long, immutable cache lifetime.

    Every asset reference in the HTML carries ?v=N, so a version bump is the
    cache key. Without this header Cloudflare marks the files DYNAMIC and the
    browser revalidates them on each visit.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if scope.get("type") != "http" or not path.startswith("/static/"):
            await self.app(scope, receive, send)
            return

        versioned = b"v=" in (scope.get("query_string") or b"")
        cache_value = (
            "public, max-age=31536000, immutable"
            if versioned
            else "public, max-age=86400"
        )

        async def send_with_cache(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if "cache-control" not in headers:
                    headers["cache-control"] = cache_value
            await send(message)

        await self.app(scope, receive, send_with_cache)


app = FastAPI(
    title="InstaFetch API",
    description="High-speed public Instagram video extraction and streaming engine.",
    version="1.0.0"
)

# Enable CORS for cross-origin deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Reject oversized uploads from the headers, before the multipart body is spooled.
app.add_middleware(
    TranscribeBodyLimitMiddleware,
    max_bytes=MAX_TRANSCRIBE_UPLOAD_BYTES + 2 * 1024 * 1024,
)

# Let versioned JS/CSS/images cache at the edge and in the browser.
app.add_middleware(StaticCacheMiddleware)

class ExtractRequest(BaseModel):
    url: str

def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "0:00"
    mins = seconds // 60
    secs = seconds % 60
    return f"{mins}:{secs:02d}"

def sanitize_filename(name: str) -> str:
    """Keeps unicode titles intact but strips characters that break headers/paths."""
    cleaned = re.sub(r'[\\/*?:"<>|\r\n\t\x00-\x1f]', "", name or "")
    cleaned = cleaned.strip().replace(" ", "_")
    cleaned = re.sub(r"_{2,}", "_", cleaned).strip("._-")
    return cleaned[:80] if cleaned else "instagram_video"

def build_content_disposition(filename: str) -> str:
    """
    Builds an RFC 5987 Content-Disposition value so non-ASCII titles
    (emoji, Arabic, Japanese, etc.) download with a readable filename.
    """
    ascii_name = filename.encode("ascii", "ignore").decode().strip() or "instagram_video.mp4"
    quoted = urllib.parse.quote(filename, safe="")
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quoted}'

def _host_matches_suffixes(url: str, suffixes: Tuple[str, ...]) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in suffixes)


def is_allowed_video_cdn_url(url: str) -> bool:
    """Public video CDNs allowed for /api/video/download."""
    return _host_matches_suffixes(url, ALLOWED_VIDEO_CDN_SUFFIXES)


def is_allowed_thumb_url(url: str) -> bool:
    """Public thumbnail CDNs allowed for /api/thumbnail."""
    return _host_matches_suffixes(url, ALLOWED_THUMB_CDN_SUFFIXES)


def _client_ip(request: Request) -> str:
    # Cloudflare sets this at the edge to the real client address. Fall back to
    # the last X-Forwarded-For hop (the one appended by the nearest proxy), not
    # the first, because the first value is client-controlled and spoofable.
    cf_ip = (request.headers.get("cf-connecting-ip") or "").strip()
    if cf_ip:
        return cf_ip
    xff = [part.strip() for part in (request.headers.get("x-forwarded-for") or "").split(",") if part.strip()]
    if xff:
        return xff[-1]
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


_RATE_SWEEP_AT = 0.0


def _prune_rate_buckets(now: float) -> None:
    """Drop buckets that have been idle for an hour so the dict cannot grow forever."""
    global _RATE_SWEEP_AT
    if now < _RATE_SWEEP_AT:
        return
    _RATE_SWEEP_AT = now + 300
    stale = [key for key, q in _RATE_BUCKETS.items() if not q or now - q[-1] > 3600]
    for key in stale:
        _RATE_BUCKETS.pop(key, None)


def _check_rate_limit(request: Request, bucket: str, limit: int, window_sec: int) -> None:
    now = time.time()
    _prune_rate_buckets(now)
    key = f"{bucket}:{_client_ip(request)}"
    q = _RATE_BUCKETS[key]
    while q and now - q[0] > window_sec:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(
            status_code=429,
            detail="Rate limit reached. Please wait a couple of minutes and try again.",
        )
    q.append(now)


def _remember_media_headers(media_url: str, headers: Optional[Dict[str, str]]) -> None:
    if not media_url or not headers:
        return
    if len(_MEDIA_HEADERS_CACHE) >= _EXTRACT_CACHE_MAX:
        _MEDIA_HEADERS_CACHE.clear()
    cleaned = {
        str(k): str(v)
        for k, v in headers.items()
        if str(k).lower() in ("user-agent", "referer", "origin", "cookie", "accept", "accept-language")
    }
    if cleaned:
        _MEDIA_HEADERS_CACHE[media_url] = (time.time(), cleaned)


def _cached_media_headers(media_url: str) -> Dict[str, str]:
    entry = _MEDIA_HEADERS_CACHE.get(media_url)
    if not entry:
        return {}
    created_at, hdrs = entry
    if time.time() - created_at > _EXTRACT_CACHE_TTL:
        _MEDIA_HEADERS_CACHE.pop(media_url, None)
        return {}
    return dict(hdrs)


def format_timestamp(seconds: float) -> str:
    total = max(0, int(seconds))
    hrs = total // 3600
    mins = (total % 3600) // 60
    secs = total % 60
    if hrs > 0:
        return f"{hrs}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"


def normalize_video_url(url: str) -> Tuple[str, str]:
    """
    Validates and normalizes Instagram, TikTok, or YouTube Shorts/video URLs.
    Returns (platform, clean_url).
    """
    raw = (url or "").strip()
    if not raw:
        raise ValueError("Please paste a video URL.")
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw

    parsed = urllib.parse.urlparse(raw)
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        raise ValueError("Please enter a valid video URL.")

    if host == "instagram.com" or host.endswith(".instagram.com"):
        return "instagram", normalize_ig_url(raw)

    if host == "tiktok.com" or host.endswith(".tiktok.com"):
        # Strip tracking query params on standard /@user/video/123 links; keep short links intact
        if host in ("vm.tiktok.com", "vt.tiktok.com"):
            return "tiktok", f"https://{host}{parsed.path}"
        return "tiktok", f"https://www.tiktok.com{parsed.path}"

    if host in ("youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"):
        vid = None
        if host == "youtu.be":
            vid = parsed.path.lstrip("/").split("/")[0]
        else:
            shorts_match = re.search(r"/shorts/([A-Za-z0-9_-]{6,20})", parsed.path)
            if shorts_match:
                vid = shorts_match.group(1)
            else:
                qs = urllib.parse.parse_qs(parsed.query)
                if "v" in qs and qs["v"]:
                    vid = qs["v"][0]
                else:
                    embed_match = re.search(r"/(embed|v)/([A-Za-z0-9_-]{6,20})", parsed.path)
                    if embed_match:
                        vid = embed_match.group(2)
        if not vid:
            raise ValueError("Could not find a YouTube Shorts or video ID in that link.")
        if "/shorts/" in parsed.path:
            return "youtube", f"https://www.youtube.com/shorts/{vid}"
        return "youtube", f"https://www.youtube.com/watch?v={vid}"

    raise ValueError("Please enter a valid Instagram Reel, TikTok, or YouTube Shorts link.")

def resolution_label(width: Optional[int], height: Optional[int]) -> str:
    """720x1280 -> '720p'. Uses the short side, which is the convention for vertical video."""
    if width and height:
        return f"{min(width, height)}p"
    return "HD"

def remember_extraction(key: str, result: Any) -> Any:
    now = time.time()
    if len(_EXTRACT_CACHE) >= _EXTRACT_CACHE_MAX:
        _EXTRACT_CACHE.clear()
    _EXTRACT_CACHE[key] = (now, result)
    return result

def cached_extraction(key: str) -> Optional[Any]:
    entry = _EXTRACT_CACHE.get(key)
    if not entry:
        return None
    created_at, result = entry
    if time.time() - created_at > _EXTRACT_CACHE_TTL:
        _EXTRACT_CACHE.pop(key, None)
        return None
    return result

def normalize_ig_url(url: str) -> str:
    """Standardizes input URL to clean Instagram format."""
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    parsed = urllib.parse.urlparse(url)
    if "instagram.com" not in parsed.netloc:
        raise ValueError("Please enter a valid Instagram URL.")

    match = re.search(r'/(reel|reels|p|tv)/([A-Za-z0-9_-]+)', parsed.path)
    if match:
        kind = "reel" if "reel" in match.group(1) else match.group(1)
        shortcode = match.group(2)
        return f"https://www.instagram.com/{kind}/{shortcode}/"
    
    clean_path = parsed.path.rstrip("/")
    return f"https://www.instagram.com{clean_path}/"

def _extract_media(url: str) -> Dict[str, Any]:
    """
    Core extraction function using native yt-dlp session.
    Routes through PROXY_URL if configured in environment variables.
    """
    ydl_opts: Dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": False,
        "socket_timeout": 25,
    }

    # Plug in proxy if configured (Residential / Rotating proxy for cloud deployment)
    if PROXY_URL:
        ydl_opts["proxy"] = PROXY_URL

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=False)

class MultiVideoMedia(BaseModel):
    id: str
    platform: str
    source_url: str
    title: str
    caption: Optional[str] = ""
    author: Optional[str] = ""
    author_name: Optional[str] = ""
    thumbnail: Optional[str] = ""
    thumbnail_proxy: Optional[str] = ""
    video_url: str
    download_url: str
    duration: Optional[int] = 0
    duration_str: Optional[str] = "0:00"
    width: Optional[int] = None
    height: Optional[int] = None
    quality: Optional[str] = "HD"
    needs_mux: bool = False
    is_carousel: bool = False
    items: Optional[List[Dict[str, Any]]] = None


def _build_thumb_proxy(thumb_url: Optional[str]) -> str:
    if not thumb_url:
        return ""
    if is_allowed_thumb_url(thumb_url):
        return "/api/thumbnail?url=" + urllib.parse.quote(thumb_url, safe="")
    return thumb_url


def _extract_video_sync(url: str, platform: str) -> Dict[str, Any]:
    ydl_opts: Dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": False,
        "socket_timeout": 25,
    }
    if PROXY_URL:
        ydl_opts["proxy"] = PROXY_URL
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=False)


def _mux_video_sync(url: str, out_dir: str) -> Tuple[str, str]:
    out_tpl = os.path.join(out_dir, "video.%(ext)s")
    ydl_opts: Dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "format": "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
        "merge_output_format": "mp4",
        "outtmpl": out_tpl,
        "max_filesize": 150 * 1024 * 1024,
        "socket_timeout": 25,
    }
    if PROXY_URL:
        ydl_opts["proxy"] = PROXY_URL
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        path = ydl.prepare_filename(info)
        mp4_path = os.path.splitext(path)[0] + ".mp4"
        final_path = mp4_path if os.path.exists(mp4_path) else path
        title = (info.get("title") or "droplabs_video").strip()
        return final_path, title


def _download_for_transcribe_sync(url: str, out_dir: str) -> Tuple[str, str, int]:
    out_tpl = os.path.join(out_dir, "source.%(ext)s")

    def _duration_filter(info_dict: Dict[str, Any], *, incomplete: bool = False):
        dur = info_dict.get("duration")
        if dur and dur > MAX_TRANSCRIBE_DURATION_SEC:
            return f"Video is longer than {MAX_TRANSCRIBE_DURATION_SEC // 60} minutes."
        return None

    ydl_opts: Dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "format": "ba[filesize<100M]/b[filesize<100M]/ba/b",
        "outtmpl": out_tpl,
        "max_filesize": 100 * 1024 * 1024,
        "match_filter": _duration_filter,
        "socket_timeout": 25,
    }
    if PROXY_URL:
        ydl_opts["proxy"] = PROXY_URL
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        path = ydl.prepare_filename(info)
        if not os.path.exists(path):
            candidates = [os.path.join(out_dir, f) for f in os.listdir(out_dir)]
            if not candidates:
                raise RuntimeError("Could not download audio stream.")
            path = candidates[0]
        title = (info.get("title") or info.get("description") or "Video transcript").split("\n")[0][:80]
        dur = int(info.get("duration") or 0)
        return path, title, dur


@app.post("/api/video/extract", response_model=MultiVideoMedia)
async def extract_multi_video(request: Request, payload: ExtractRequest):
    """
    Extracts MP4 stream + metadata for Instagram Reels, TikTok, or YouTube Shorts.
    """
    _check_rate_limit(request, "extract", limit=20, window_sec=600)
    try:
        platform, clean_url = normalize_video_url(payload.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    cache_key = f"multi:{platform}:{clean_url}"
    cached = cached_extraction(cache_key)
    if cached is not None:
        return cached

    try:
        loop = asyncio.get_running_loop()
        info = await loop.run_in_executor(None, _extract_video_sync, clean_url, platform)
    except yt_dlp.utils.DownloadError as e:
        err_msg = str(e).lower()
        if "not found" in err_msg or "404" in err_msg or "unavailable" in err_msg:
            raise HTTPException(
                status_code=404,
                detail="Video not found or private. Check the link and make sure the post is public.",
            )
        raise HTTPException(
            status_code=400,
            detail="Unable to extract this video right now. Verify the post is public and try again.",
        )
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Something went wrong while extracting this video. Please try again.",
        )

    if not info:
        raise HTTPException(status_code=404, detail="No playable video was found at that link.")

    entries = info.get("entries")
    if entries and len(entries) > 0:
        items = []
        for idx, entry in enumerate(entries):
            if not entry:
                continue
            v_url = entry.get("url")
            hdrs = entry.get("http_headers") or info.get("http_headers")
            if not v_url and entry.get("formats"):
                mp4s = [f for f in entry["formats"] if f.get("ext") == "mp4" and f.get("url")]
                if mp4s:
                    v_url = mp4s[-1]["url"]
                    hdrs = mp4s[-1].get("http_headers") or hdrs
            if v_url:
                _remember_media_headers(v_url, hdrs)
                thumb = entry.get("thumbnail")
                items.append({
                    "index": idx + 1,
                    "video_url": v_url,
                    "thumbnail": thumb,
                    "thumbnail_proxy": _build_thumb_proxy(thumb),
                    "width": entry.get("width"),
                    "height": entry.get("height"),
                })
        if items:
            first = items[0]
            desc = (info.get("description") or info.get("title") or "Creator Video").strip()
            title = desc.split("\n")[0][:80]
            safe_fn = sanitize_filename(title) + ".mp4"
            dl_url = (
                "/api/video/download?url="
                + urllib.parse.quote(first["video_url"], safe="")
                + "&filename="
                + urllib.parse.quote(safe_fn, safe="")
            )
            thumb_top = first.get("thumbnail") or info.get("thumbnail") or ""
            result = MultiVideoMedia(
                id=str(info.get("id") or "video_carousel"),
                platform=platform,
                source_url=clean_url,
                title=title,
                caption=desc,
                author=info.get("uploader") or info.get("channel") or platform,
                author_name=info.get("uploader_id") or "",
                thumbnail=thumb_top,
                thumbnail_proxy=_build_thumb_proxy(thumb_top),
                video_url=first["video_url"],
                download_url=dl_url,
                duration=int(info.get("duration") or 0),
                duration_str=format_duration(int(info.get("duration") or 0)),
                width=first.get("width"),
                height=first.get("height"),
                quality=resolution_label(first.get("width"), first.get("height")),
                needs_mux=False,
                is_carousel=True,
                items=items,
            )
            return remember_extraction(cache_key, result)

    formats = info.get("formats") or []
    progressive_mp4s = [
        f for f in formats
        if f.get("ext") == "mp4"
        and f.get("vcodec") != "none"
        and f.get("acodec") != "none"
        and f.get("url")
    ]
    progressive_mp4s.sort(key=lambda x: (x.get("height") or 0, x.get("tbr") or 0), reverse=True)

    # Check if YouTube has a separate HD MP4 video stream higher than progressive (e.g. 720p/1080p vs 360p)
    best_video_only = [
        f for f in formats
        if f.get("ext") == "mp4"
        and f.get("vcodec") != "none"
        and f.get("acodec") == "none"
        and f.get("url")
    ]
    best_video_only.sort(key=lambda x: (x.get("height") or 0, x.get("tbr") or 0), reverse=True)

    selected_format = None
    video_url = None
    if progressive_mp4s:
        selected_format = progressive_mp4s[0]
        video_url = selected_format["url"]
    elif info.get("url"):
        video_url = info.get("url")
    elif formats:
        mp4s = [f for f in formats if f.get("ext") == "mp4" and f.get("url")]
        if mp4s:
            selected_format = mp4s[-1]
            video_url = selected_format["url"]

    needs_mux = False
    if platform == "youtube" and best_video_only:
        prog_h = (selected_format.get("height") or 0) if selected_format else 0
        hd_h = best_video_only[0].get("height") or 0
        if not video_url or (hd_h >= 720 and prog_h < 720):
            needs_mux = True
            if not video_url:
                video_url = best_video_only[0]["url"]

    if not video_url and not needs_mux:
        raise HTTPException(status_code=422, detail="No playable video stream found for this link.")

    raw_desc = (info.get("description") or "").strip()
    raw_title = (info.get("title") or "").strip()
    if raw_title and platform in ("youtube", "tiktok"):
        display_title = raw_title.split("\n")[0][:80]
        display_caption = raw_desc or raw_title
    elif raw_desc:
        display_title = raw_desc.split("\n")[0][:80]
        display_caption = raw_desc
    else:
        display_title = raw_title[:80] if raw_title else "Creator Video"
        display_caption = raw_title

    width = selected_format.get("width") if selected_format else info.get("width")
    height = selected_format.get("height") if selected_format else info.get("height")
    if needs_mux and best_video_only:
        width = best_video_only[0].get("width") or width
        height = best_video_only[0].get("height") or height

    if video_url:
        fmt_hdrs = (selected_format.get("http_headers") if selected_format else None) or info.get("http_headers")
        _remember_media_headers(video_url, fmt_hdrs)

    safe_fn = sanitize_filename(display_title) + ".mp4"
    if needs_mux:
        download_url = (
            "/api/video/mux?url="
            + urllib.parse.quote(clean_url, safe="")
            + "&filename="
            + urllib.parse.quote(safe_fn, safe="")
        )
    else:
        download_url = (
            "/api/video/download?url="
            + urllib.parse.quote(video_url, safe="")
            + "&filename="
            + urllib.parse.quote(safe_fn, safe="")
        )

    thumb_url = info.get("thumbnail") or ""
    dur = int(info.get("duration") or 0)

    result = MultiVideoMedia(
        id=str(info.get("id") or "video_item"),
        platform=platform,
        source_url=clean_url,
        title=display_title,
        caption=display_caption,
        author=info.get("uploader") or info.get("channel") or platform,
        author_name=info.get("uploader_id") or info.get("channel_id") or "",
        thumbnail=thumb_url,
        thumbnail_proxy=_build_thumb_proxy(thumb_url),
        video_url=video_url or "",
        download_url=download_url,
        duration=dur,
        duration_str=format_duration(dur),
        width=width,
        height=height,
        quality=resolution_label(width, height),
        needs_mux=needs_mux,
        is_carousel=False,
    )
    return remember_extraction(cache_key, result)


@app.get("/api/video/download")
async def download_multi_video(
    request: Request,
    url: str = Query(..., description="Direct CDN video URL"),
    filename: Optional[str] = Query(None, description="Output filename"),
    range_header: Optional[str] = Header(None, alias="Range"),
):
    """Streams MP4 from allowed IG, TikTok, or YouTube CDNs with attachment headers."""
    _check_rate_limit(request, "download", limit=40, window_sec=600)
    if not is_allowed_video_cdn_url(url):
        raise HTTPException(status_code=400, detail="This media URL is not supported.")

    safe_base = sanitize_filename(filename or "droplabs_video")
    safe_name = safe_base if safe_base.lower().endswith(".mp4") else f"{safe_base}.mp4"

    upstream_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "*/*",
    }
    cached_hdrs = _cached_media_headers(url)
    if cached_hdrs:
        upstream_headers.update(cached_hdrs)
    elif "tiktok" in url or "byteoversea" in url or "muscdn" in url:
        upstream_headers["Referer"] = "https://www.tiktok.com/"
    elif "instagram" in url or "fbcdn" in url:
        upstream_headers["Referer"] = "https://www.instagram.com/"

    if range_header:
        upstream_headers["Range"] = range_header

    client_kwargs: Dict[str, Any] = {
        "timeout": httpx.Timeout(60.0, connect=15.0),
        "follow_redirects": True,
    }
    if PROXY_URL:
        client_kwargs["proxy"] = PROXY_URL

    client = httpx.AsyncClient(**client_kwargs)
    try:
        upstream = await client.send(
            client.build_request("GET", url, headers=upstream_headers),
            stream=True,
        )
    except httpx.HTTPError:
        await client.aclose()
        raise HTTPException(status_code=502, detail="Unable to reach the video source. Please extract the link again.")

    if upstream.status_code not in (200, 206):
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail="The video source rejected the request. Please extract the link again.")

    content_length = upstream.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_DOWNLOAD_BYTES:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(status_code=413, detail="This video is too large to download.")

    response_headers = {
        "Content-Disposition": build_content_disposition(safe_name),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
    }
    if content_length:
        response_headers["Content-Length"] = content_length
    if upstream.headers.get("content-range"):
        response_headers["Content-Range"] = upstream.headers["content-range"]

    async def stream_video():
        try:
            async for chunk in upstream.aiter_bytes(chunk_size=64 * 1024):
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_video(),
        status_code=upstream.status_code,
        headers=response_headers,
        media_type="video/mp4",
    )


@app.get("/api/video/mux")
async def mux_multi_video(
    request: Request,
    url: str = Query(..., description="Source post URL"),
    filename: Optional[str] = Query(None, description="Output filename"),
):
    """Downloads and muxes HD MP4 via yt-dlp + FFmpeg for split-stream Shorts."""
    _check_rate_limit(request, "mux", limit=15, window_sec=600)
    try:
        _, clean_url = normalize_video_url(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    tmp_dir = tempfile.mkdtemp(prefix="droplabs_mux_")
    try:
        loop = asyncio.get_running_loop()
        file_path, title = await loop.run_in_executor(None, _mux_video_sync, clean_url, tmp_dir)
    except Exception:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=502, detail="Could not mux HD video for this link. Try extracting again.")

    safe_base = sanitize_filename(filename or title or "droplabs_video")
    safe_name = safe_base if safe_base.lower().endswith(".mp4") else f"{safe_base}.mp4"
    return FileResponse(
        path=file_path,
        media_type="video/mp4",
        headers={
            "Content-Disposition": build_content_disposition(safe_name),
            "Cache-Control": "no-store",
        },
        background=BackgroundTask(shutil.rmtree, tmp_dir, True),
    )


@app.get("/api/thumbnail", include_in_schema=False)
async def proxy_thumbnail(request: Request, url: str = Query(...)):
    """Proxies allowed CDN thumbnails so IG/TikTok/YT previews never break from Referer rules."""
    _check_rate_limit(request, "thumbnail", limit=120, window_sec=600)
    if not is_allowed_thumb_url(url):
        raise HTTPException(status_code=400, detail="Unsupported thumbnail host.")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "image/*,*/*;q=0.8",
    }
    if "instagram" in url or "fbcdn" in url:
        headers["Referer"] = "https://www.instagram.com/"
    elif "tiktok" in url or "ibytedtos" in url or "muscdn" in url:
        headers["Referer"] = "https://www.tiktok.com/"

    client_kwargs: Dict[str, Any] = {"timeout": httpx.Timeout(12.0, connect=6.0), "follow_redirects": True}
    if PROXY_URL:
        client_kwargs["proxy"] = PROXY_URL

    async with httpx.AsyncClient(**client_kwargs) as client:
        try:
            resp = await client.get(url, headers=headers)
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="Thumbnail fetch failed.")
        if resp.status_code != 200 or len(resp.content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=502, detail="Thumbnail unavailable.")
        ctype = resp.headers.get("content-type", "image/jpeg")
        if not ctype.startswith("image/"):
            raise HTTPException(status_code=400, detail="Invalid thumbnail content type.")
        return Response(
            content=resp.content,
            media_type=ctype,
            headers={"Cache-Control": "public, max-age=3600"},
        )


@app.post("/api/transcribe")
async def transcribe_video(
    request: Request,
    url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    language: Optional[str] = Form(None),
):
    """
    Accepts an IG/TikTok/YouTube URL or uploaded short clip, strips audio via FFmpeg,
    and transcribes with Groq Whisper returning timestamped segments.
    """
    _check_rate_limit(request, "transcribe", limit=10, window_sec=600)

    clean_input_url = (url or "").strip()
    has_file = file is not None and bool(file.filename)
    if not clean_input_url and not has_file:
        raise HTTPException(status_code=400, detail="Paste a video URL or choose a short video/audio clip.")

    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Transcription engine is not configured yet (missing GROQ_API_KEY on the server).",
        )

    with tempfile.TemporaryDirectory(prefix="droplabs_tx_") as tmp_dir:
        source_title = "Uploaded clip"
        duration_hint = 0

        if has_file and file is not None:
            orig_name = file.filename or "clip.mp4"
            ext = os.path.splitext(orig_name)[1].lower()
            if ext and ext not in ALLOWED_MEDIA_EXTS:
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported file type. Upload MP4, MOV, WebM, MKV, MP3, WAV, or M4A.",
                )
            src_path = os.path.join(tmp_dir, f"upload{ext or '.mp4'}")
            total_bytes = 0
            try:
                with open(src_path, "wb") as f_out:
                    while True:
                        chunk = await file.read(256 * 1024)
                        if not chunk:
                            break
                        total_bytes += len(chunk)
                        if total_bytes > MAX_TRANSCRIBE_UPLOAD_BYTES:
                            raise HTTPException(
                                status_code=413,
                                detail="Clip is too large. Keep uploads under 50 MB.",
                            )
                        f_out.write(chunk)
            finally:
                await file.close()
            source_title = os.path.splitext(orig_name)[0][:80] or "Uploaded clip"
        else:
            try:
                _, normalized_url = normalize_video_url(clean_input_url)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            try:
                loop = asyncio.get_running_loop()
                src_path, source_title, duration_hint = await loop.run_in_executor(
                    None, _download_for_transcribe_sync, normalized_url, tmp_dir
                )
            except yt_dlp.utils.DownloadError as e:
                msg = str(e).lower()
                if "longer than" in msg:
                    raise HTTPException(status_code=400, detail="Video exceeds the 10-minute transcription limit.")
                raise HTTPException(
                    status_code=400,
                    detail="Could not fetch that video. Make sure the link is public and try again.",
                )
            except Exception:
                raise HTTPException(status_code=500, detail="Failed to download video audio for transcription.")

        # Strip audio to mono 16kHz MP3 using FFmpeg
        audio_path = os.path.join(tmp_dir, "audio.mp3")
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-y",
            "-i",
            src_path,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "48k",
            audio_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=60)
        except asyncio.TimeoutError:
            proc.kill()
            raise HTTPException(status_code=504, detail="Audio extraction timed out. Try a shorter clip.")

        if proc.returncode != 0 or not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
            err_tail = (stderr_bytes or b"").decode("utf-8", errors="ignore")[-300:]
            if "does not contain any stream" in err_tail or "output file does not contain" in err_tail:
                raise HTTPException(status_code=422, detail="This file has no audio track to transcribe.")
            raise HTTPException(status_code=422, detail="Could not extract audio from that clip.")

        if os.path.getsize(audio_path) > MAX_GROQ_AUDIO_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Extracted audio exceeds 24 MB. Please use a shorter clip.",
            )

        # Call Groq Whisper API
        form_data: Dict[str, Any] = {
            "model": GROQ_WHISPER_MODEL,
            "response_format": "verbose_json",
            "timestamp_granularities[]": "segment",
        }
        lang = (language or "").strip().lower()
        if lang and lang != "auto" and re.fullmatch(r"[a-z]{2,3}", lang):
            form_data["language"] = lang

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0)) as client:
                with open(audio_path, "rb") as audio_file:
                    groq_resp = await client.post(
                        "https://api.groq.com/openai/v1/audio/transcriptions",
                        headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                        data=form_data,
                        files={"file": ("audio.mp3", audio_file, "audio/mpeg")},
                    )
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="Could not reach Groq Whisper API. Please try again.")

        if groq_resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail="Transcription provider returned an error. Check GROQ_API_KEY or try again shortly.",
            )

        payload_json = groq_resp.json()
        raw_segments = payload_json.get("segments") or []
        segments = []
        for seg in raw_segments:
            txt = (seg.get("text") or "").strip()
            if not txt:
                continue
            start_s = float(seg.get("start") or 0.0)
            end_s = float(seg.get("end") or start_s)
            segments.append({
                "start": round(start_s, 2),
                "end": round(end_s, 2),
                "start_str": format_timestamp(start_s),
                "end_str": format_timestamp(end_s),
                "text": txt,
            })

        full_text = (payload_json.get("text") or "").strip()
        if not full_text and segments:
            full_text = " ".join(s["text"] for s in segments)

        final_duration = float(payload_json.get("duration") or duration_hint or 0)
        return {
            "source_title": source_title,
            "source_url": clean_input_url or None,
            "language": payload_json.get("language") or lang or "auto",
            "duration": round(final_duration, 1),
            "duration_str": format_timestamp(final_duration),
            "text": full_text,
            "segments": segments,
        }

@app.get("/api/health")
async def health():
    return {
        "status": "online",
        "version": "1.1.0",
        "proxy_active": bool(PROXY_URL),
        "groq_active": bool(GROQ_API_KEY),
    }

# Uptime monitors often probe with HEAD. FastAPI doesn't derive HEAD from GET,
# so without these a healthy service reports 405 and monitors mark it down.
@app.head("/api/health", include_in_schema=False)
async def health_head():
    return Response(status_code=200, headers={"Cache-Control": "no-store"})

@app.get("/health", include_in_schema=False)
async def health_alias():
    return await health()

@app.head("/health", include_in_schema=False)
async def health_alias_head():
    return Response(status_code=200, headers={"Cache-Control": "no-store"})

@app.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    return PlainTextResponse(
        "User-agent: *\nAllow: /\n\nSitemap: https://droplabs.site/sitemap.xml\n"
    )

@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml():
    entries = []
    for path, priority in landing_pages.sitemap_urls():
        entries.append(
            "  <url>\n"
            f"    <loc>https://droplabs.site{path}</loc>\n"
            f"    <lastmod>{SITE_UPDATED}</lastmod>\n"
            "    <changefreq>weekly</changefreq>\n"
            f"    <priority>{priority}</priority>\n"
            "  </url>\n"
        )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(entries)
        + "</urlset>\n"
    )
    return Response(content=xml, media_type="application/xml")

@app.get("/favicon.ico", include_in_schema=False)
async def favicon_ico():
    # A real multi-size ICO (16/32/48/64). This used to be a 32x32 PNG, which
    # is below Google's 48px favicon minimum and gave its crawler a stale,
    # undersized source to fall back to.
    return FileResponse(
        str(STATIC_DIR / "favicon.ico"),
        media_type="image/x-icon",
        headers={"Cache-Control": "public, max-age=86400"},
    )

# Web app manifest + service worker live at the root so their scope covers "/".
# A service worker served from /static/ could not control the page itself.
@app.get("/manifest.json", include_in_schema=False)
async def web_manifest():
    return FileResponse(
        str(STATIC_DIR / "manifest.json"),
        media_type="application/manifest+json",
        headers={"Cache-Control": "public, max-age=3600"},
    )

@app.get("/sw.js", include_in_schema=False)
async def service_worker():
    return FileResponse(
        str(STATIC_DIR / "sw.js"),
        media_type="application/javascript",
        headers={
            "Service-Worker-Allowed": "/",
            "Cache-Control": "no-cache",
        },
    )

# Mount static web UI
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ---- HTML pages ----------------------------------------------------------
# index.html stays the single source of truth for the app shell. A landing
# page is that same file with the format-specific parts swapped at request
# time, so the downloader, the ad deck and every script stay identical and
# only ever need fixing once.
_HTML_CACHE: Dict[str, Any] = {"mtime": None, "html": ""}

# Standalone tool pages are hand-written documents, not the app shell, so they
# get their own tiny mtime cache instead of going through landing_pages.
_TOOL_CACHE: Dict[str, Any] = {}


def _tool_html(name: str) -> str:
    path = STATIC_DIR / name
    mtime = path.stat().st_mtime
    entry = _TOOL_CACHE.get(name)
    if not entry or entry["mtime"] != mtime:
        entry = {"mtime": mtime, "html": path.read_text(encoding="utf-8")}
        _TOOL_CACHE[name] = entry
    return entry["html"]


def _base_html() -> str:
    path = STATIC_DIR / "index.html"
    mtime = path.stat().st_mtime
    if _HTML_CACHE["mtime"] != mtime:
        _HTML_CACHE["html"] = path.read_text(encoding="utf-8")
        _HTML_CACHE["mtime"] = mtime
    return _HTML_CACHE["html"]


def _head_extras() -> str:
    """Verification and analytics tags, only when a token is configured."""
    bits = []
    if GOOGLE_SITE_VERIFICATION:
        bits.append(
            '<meta name="google-site-verification" '
            f'content="{GOOGLE_SITE_VERIFICATION}" />'
        )
    if CF_ANALYTICS_TOKEN:
        bits.append(
            '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" '
            'data-cf-beacon=\'{"token": "' + CF_ANALYTICS_TOKEN + '"}\'></script>'
        )
    return "\n  ".join(bits)


def _page(slug: Optional[str]) -> HTMLResponse:
    base = _base_html()
    html = landing_pages.render(base, slug) if slug else landing_pages.strip_markers(base)
    extras = _head_extras()
    if extras:
        html = html.replace("</head>", "  " + extras + "\n</head>", 1)
    return HTMLResponse(content=html)


@app.get("/")
async def index():
    return _render_tool_page("home.html")

@app.head("/", include_in_schema=False)
async def index_head():
    return _render_tool_page("home.html")


def _render_tool_page(filename: str) -> HTMLResponse:
    html = _tool_html(filename)
    extras = _head_extras()
    if extras:
        html = html.replace("</head>", "  " + extras + "\n</head>", 1)
    return HTMLResponse(content=html)


@app.api_route("/tools/video-downloader", methods=["GET", "HEAD"], include_in_schema=False)
async def tool_video_downloader():
    return _page("tools/video-downloader")


@app.api_route("/tools/video-to-text", methods=["GET", "HEAD"], include_in_schema=False)
async def tool_video_to_text():
    return _render_tool_page("video-to-text.html")


@app.api_route("/tools/image-compressor", methods=["GET", "HEAD"], include_in_schema=False)
async def tool_image_compressor():
    return _render_tool_page("compress.html")


@app.api_route("/image-compressor", methods=["GET", "HEAD"], include_in_schema=False)
async def image_compressor():
    # The canonical tool URL is /tools/image-compressor; keep old links working
    # without serving duplicate content.
    return RedirectResponse(url="/tools/image-compressor", status_code=301)


@app.api_route("/workspace", methods=["GET", "HEAD"], include_in_schema=False)
async def creator_workspace():
    return _render_tool_page("workspace.html")


@app.api_route("/{slug}", methods=["GET", "HEAD"], include_in_schema=False)
async def landing_page(slug: str):
    if slug not in landing_pages.PAGES:
        raise HTTPException(status_code=404, detail="Not found")
    return _page(slug)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("app:app", host=host, port=port, reload=True)
