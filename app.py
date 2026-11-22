import os
import re
import time
import asyncio
import urllib.parse
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.responses import FileResponse, StreamingResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import httpx
import yt_dlp

# Load environment variables from .env if present
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

# Optional Proxy Configuration
PROXY_URL = os.getenv("PROXY_URL") or os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY")

# Only allow proxying media from Instagram's public CDN hosts.
ALLOWED_MEDIA_SUFFIXES = ("cdninstagram.com", "fbcdn.net")

# Refuse to proxy absurdly large files (safety valve, not a product limit).
MAX_DOWNLOAD_BYTES = 300 * 1024 * 1024

# Short-lived extraction cache: repeat requests for the same post reuse the
# resolved stream instead of hitting Instagram again.
_EXTRACT_CACHE: Dict[str, Tuple[float, "VideoMedia"]] = {}
_EXTRACT_CACHE_TTL = 600
_EXTRACT_CACHE_MAX = 500

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

class ExtractRequest(BaseModel):
    url: str

class VideoMedia(BaseModel):
    id: str
    title: str
    caption: Optional[str] = ""
    author: Optional[str] = "instagram_creator"
    author_name: Optional[str] = ""
    thumbnail: Optional[str] = ""
    video_url: str
    duration: Optional[int] = 0
    duration_str: Optional[str] = "0:00"
    width: Optional[int] = None
    height: Optional[int] = None
    quality: Optional[str] = "1080p HD"
    is_carousel: bool = False
    items: Optional[List[Dict[str, Any]]] = None

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

def is_allowed_media_url(url: str) -> bool:
    """Only Instagram's public media CDNs may be proxied by /api/download."""
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in ALLOWED_MEDIA_SUFFIXES)

def resolution_label(width: Optional[int], height: Optional[int]) -> str:
    """720x1280 -> '720p'. Uses the short side, which is the convention for vertical video."""
    if width and height:
        return f"{min(width, height)}p"
    return "HD"

def remember_extraction(key: str, result: "VideoMedia") -> "VideoMedia":
    now = time.time()
    if len(_EXTRACT_CACHE) >= _EXTRACT_CACHE_MAX:
        _EXTRACT_CACHE.clear()
    _EXTRACT_CACHE[key] = (now, result)
    return result

def cached_extraction(key: str) -> Optional["VideoMedia"]:
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

@app.post("/api/extract", response_model=VideoMedia)
async def extract_video(payload: ExtractRequest):
    """
    Extracts high-resolution MP4 direct streams and metadata for any public Instagram video/reel.
    """
    try:
        clean_url = normalize_ig_url(payload.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    cached = cached_extraction(clean_url)
    if cached is not None:
        return cached

    try:
        loop = asyncio.get_running_loop()
        info = await loop.run_in_executor(None, _extract_media, clean_url)
    except yt_dlp.utils.DownloadError as e:
        err_msg = str(e)
        if "not found" in err_msg.lower() or "404" in err_msg:
            raise HTTPException(status_code=404, detail="Video not found. Please ensure the link is correct and the post is public.")
        else:
            raise HTTPException(status_code=400, detail="Unable to retrieve this video. Please verify the post is public and still available on Instagram.")
    except Exception:
        raise HTTPException(status_code=500, detail="Something went wrong while processing the video. Please try again.")

    if not info:
        raise HTTPException(status_code=404, detail="No video media could be found for this post.")

    # Check for carousel / multi-video post
    entries = info.get("entries")
    if entries and len(entries) > 0:
        items = []
        for idx, entry in enumerate(entries):
            if entry:
                v_url = entry.get("url")
                if not v_url and entry.get("formats"):
                    mp4s = [f for f in entry["formats"] if f.get("ext") == "mp4" and f.get("url")]
                    if mp4s:
                        v_url = mp4s[-1]["url"]
                if v_url:
                    items.append({
                        "index": idx + 1,
                        "video_url": v_url,
                        "thumbnail": entry.get("thumbnail"),
                        "width": entry.get("width"),
                        "height": entry.get("height"),
                    })
        
        if items:
            first = items[0]
            desc = info.get("description") or info.get("title") or "Instagram Reel"
            title = desc.split("\n")[0][:70]
            result = VideoMedia(
                id=info.get("id") or "ig_carousel",
                title=title,
                caption=desc,
                author=info.get("uploader") or "instagram_creator",
                author_name=info.get("uploader_id") or "",
                thumbnail=first.get("thumbnail") or info.get("thumbnail"),
                video_url=first["video_url"],
                duration=int(info.get("duration") or 0),
                duration_str=format_duration(int(info.get("duration") or 0)),
                width=first.get("width"),
                height=first.get("height"),
                quality=resolution_label(first.get("width"), first.get("height")),
                is_carousel=True,
                items=items,
            )
            return remember_extraction(clean_url, result)

    # Single video extraction
    formats = info.get("formats", [])
    
    # 1. Prefer progressive MP4 formats (both video + audio muxed together)
    progressive_mp4s = [
        f for f in formats
        if f.get("ext") == "mp4" and f.get("vcodec") != "none" and f.get("acodec") != "none" and f.get("url")
    ]
    # Sort progressive by resolution / bitrate descending
    progressive_mp4s.sort(key=lambda x: (x.get("height") or 0, x.get("tbr") or 0), reverse=True)

    video_url = None
    selected_format = None
    if progressive_mp4s:
        selected_format = progressive_mp4s[0]
        video_url = selected_format["url"]
    elif info.get("url"):
        video_url = info.get("url")
    elif formats:
        # Fallback to any valid MP4 stream
        mp4_formats = [f for f in formats if f.get("ext") == "mp4" and f.get("url")]
        if mp4_formats:
            selected_format = mp4_formats[-1]
            video_url = selected_format["url"]

    if not video_url:
        raise HTTPException(status_code=422, detail="No playable video stream found in this post (it might be a photo post).")

    # Smart title and caption display
    raw_desc = (info.get("description") or "").strip()
    raw_title = (info.get("title") or "").strip()
    
    if raw_desc:
        display_title = raw_desc.split("\n")[0][:80]
        display_caption = raw_desc
    else:
        display_title = raw_title[:80] if raw_title else "Instagram Video"
        display_caption = raw_title

    height = None
    width = None
    if selected_format:
        height = selected_format.get("height")
        width = selected_format.get("width")

    # Only report a resolution we actually know. yt-dlp lists Instagram's
    # progressive streams with unknown dimensions, so the browser's video
    # metadata is the source of truth for the final label.
    quality_label = resolution_label(width, height)

    result = VideoMedia(
        id=info.get("id") or "ig_video",
        title=display_title,
        caption=display_caption,
        author=info.get("uploader") or "instagram_creator",
        author_name=info.get("uploader_id") or "",
        thumbnail=info.get("thumbnail"),
        video_url=video_url,
        duration=int(info.get("duration") or 0),
        duration_str=format_duration(int(info.get("duration") or 0)),
        width=width,
        height=height,
        quality=quality_label,
        is_carousel=False,
    )
    return remember_extraction(clean_url, result)

@app.get("/api/download")
async def download_video(
    url: str = Query(..., description="Direct CDN video URL"),
    filename: Optional[str] = Query(None, description="Output filename"),
    range_header: Optional[str] = Header(None, alias="Range"),
):
    """
    Streams the video with Content-Disposition: attachment so mobile and desktop browsers
    immediately download the file instead of opening it in a media player tab.

    Only Instagram CDN hosts are proxied, upstream errors are reported before the
    response starts, and Range requests are forwarded so downloads can resume.
    """
    if not is_allowed_media_url(url):
        raise HTTPException(status_code=400, detail="This media URL is not supported.")

    safe_base = sanitize_filename(filename or "instagram_video")
    safe_name = safe_base if safe_base.lower().endswith(".mp4") else f"{safe_base}.mp4"

    upstream_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.instagram.com/",
        "Accept": "*/*",
    }
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

@app.get("/api/health")
async def health():
    return {
        "status": "online",
        "version": "1.0.0",
        "proxy_active": bool(PROXY_URL)
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
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        '  <url>\n'
        '    <loc>https://droplabs.site/</loc>\n'
        '    <changefreq>weekly</changefreq>\n'
        '    <priority>1.0</priority>\n'
        '  </url>\n'
        '</urlset>\n'
    )
    return Response(content=xml, media_type="application/xml")

@app.get("/favicon.ico", include_in_schema=False)
async def favicon_ico():
    return FileResponse(str(STATIC_DIR / "favicon-32.png"), media_type="image/png")

# Mount static web UI
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
async def index():
    return FileResponse(str(STATIC_DIR / "index.html"))

@app.head("/", include_in_schema=False)
async def index_head():
    return FileResponse(str(STATIC_DIR / "index.html"))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("app:app", host=host, port=port, reload=True)
