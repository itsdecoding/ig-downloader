@echo off
title InstaFetch - Instagram Video Downloader
echo ========================================================
echo    InstaFetch: Starting Instagram Video Downloader
echo ========================================================
echo.
cd /d "%~dp0"
echo Starting FastAPI server at http://localhost:8000 ...
start http://localhost:8000
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
pause
