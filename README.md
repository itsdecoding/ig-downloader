# InstaFetch 🚀
### Production-Ready Public Instagram Video Downloader

A lightweight, high-performance web app and REST API to extract and download Instagram Reels, Feed Videos, and Carousels in original 1080p/1920p Full HD without watermarks.

Built with **FastAPI** + **yt-dlp** + **Tailwind CSS**.

---

## ✨ Features
- **Zero Login / Zero Cookies Required**: Extracts public reels and videos directly without asking users for logins or cookie files.
- **Full HD Progressive Streams**: Automatically selects high-bitrate progressive MP4 streams (video + audio muxed together) up to 1080p/1920p.
- **Direct 1-Click File Download**: Streams via `/api/download` with `Content-Disposition: attachment` so files automatically save to the user's Downloads folder instead of just playing in a tab.
- **Built-in Video Player Preview**: Lets users watch the reel right in the browser before saving.
- **Carousel & Album Detection**: Automatically detects multi-clip carousels and allows downloading individual parts.
- **Modern Ready-to-Sell UI**: Sleek dark interface with one-click clipboard paste and responsive mobile support.

---

## ⚡ Quick Start

### 1. Requirements
Python 3.10+ installed.

### 2. Run the App
**On Windows:**
Double-click `run.bat` or run:
```bash
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

---

## 📡 REST API Documentation

### 1. Extract Video Metadata
```http
POST /api/extract
Content-Type: application/json

{
  "url": "https://www.instagram.com/reel/DfHxCPwTzrp/"
}
```
**Response (200 OK):**
```json
{
  "id": "DfHxCPwTzrp",
  "title": "Trauma Bonding, Explained in 88 Seconds",
  "caption": "Full description text...",
  "author": "Unkind Truth | Dark Psychology",
  "thumbnail": "https://scontent.cdninstagram.com/...",
  "video_url": "https://instagram.fpnq...mp4",
  "duration": 88,
  "duration_str": "1:28",
  "quality": "1920p HD",
  "is_carousel": false,
  "items": null
}
```

### 2. Stream / Force Save File
```http
GET /api/download?url=<ENCODED_CDN_URL>&filename=Trauma_Bonding
```
Returns chunked stream with `Content-Disposition: attachment; filename="Trauma_Bonding.mp4"`.

### 3. Health Check
```http
GET /api/health
```

---

## 🐳 Docker Deployment
To deploy on Railway, Render, Fly.io, or VPS:
```bash
docker build -t instafetch .
docker run -d -p 8000:8000 instafetch
```
