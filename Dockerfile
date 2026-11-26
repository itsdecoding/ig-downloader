FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (ffmpeg for media format processing if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Run with a single worker: the rate limiter, extraction cache, and media
# header cache all live in process memory, so multiple workers would each
# enforce their own limits and multiply the effective quota.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
