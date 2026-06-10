FROM python:3.12-slim

# FFmpeg for video cutting and overlay compositing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps before copying source (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8642

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8642/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8642"]
