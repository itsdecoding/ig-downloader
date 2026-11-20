import os
import re
import asyncio
import urllib.parse
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
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

app = FastAPI(
    title="InstaFetch API",
    description="High-speed public Instagram video extraction and streaming engine.",
    version="1.0.0"
)

# Enable CORS for cross-origin deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
    cleaned = re.sub(r'[\\/*?:"<>|]', "", name)
    cleaned = cleaned.strip().replace(" ", "_")
    return cleaned[:50] if cleaned else "instagram_video"

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
            return VideoMedia(
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
                quality="HD 1080p",
                is_carousel=True,
                items=items,
            )

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
    if not height:
        height = info.get("height")
        width = info.get("width")

    quality_label = f"{height}p HD" if height else "HD High Quality"

    return VideoMedia(
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

@app.get("/api/download")
async def download_video(
    url: str = Query(..., description="Direct CDN video URL"),
    filename: Optional[str] = Query(None, description="Output filename")
):
    """
    Streams the video with Content-Disposition: attachment so mobile and desktop browsers
    immediately download the file instead of opening it in a media player tab.
    """
    safe_name = sanitize_filename(filename or "instagram_video") + ".mp4"

    async def stream_video():
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://www.instagram.com/",
        }
        client_kwargs: Dict[str, Any] = {
            "timeout": 60.0,
            "follow_redirects": True,
        }
        if PROXY_URL:
            client_kwargs["proxy"] = PROXY_URL

        async with httpx.AsyncClient(**client_kwargs) as client:
            async with client.stream("GET", url, headers=headers) as resp:
                if resp.status_code != 200:
                    raise HTTPException(status_code=resp.status_code, detail="Unable to fetch video stream from CDN.")
                async for chunk in resp.aiter_bytes(chunk_size=64 * 1024):
                    yield chunk

    response_headers = {
        "Content-Disposition": f'attachment; filename="{safe_name}"',
        "Content-Type": "video/mp4",
    }
    return StreamingResponse(stream_video(), headers=response_headers)

@app.get("/api/health")
async def health():
    return {
        "status": "online",
        "version": "1.0.0",
        "proxy_active": bool(PROXY_URL)
    }

# Mount static web UI
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
async def index():
    return FileResponse(str(STATIC_DIR / "index.html"))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("app:app", host=host, port=port, reload=True)
