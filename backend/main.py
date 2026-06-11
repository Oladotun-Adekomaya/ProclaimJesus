import logging
import os
import stat
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Query, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from routers import transcription, export, ai

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("ProclaimJesus backend starting up")
    yield
    logger.info("ProclaimJesus backend shutting down")


app = FastAPI(
    title="ProclaimJesus Backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

app.include_router(transcription.router)
app.include_router(export.router)
app.include_router(ai.router)


MIME_MAP = {
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
}


@app.get("/file")
async def serve_local_file(request: Request, path: str = Query(...)):
    """Stream a local file with HTTP Range support (required for video seeking)."""
    file_path = Path(path)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    file_size = file_path.stat().st_size
    content_type = MIME_MAP.get(file_path.suffix.lower(), "application/octet-stream")

    range_header = request.headers.get("range")
    if range_header:
        range_spec = range_header.replace("bytes=", "")
        range_start_str, range_end_str = range_spec.split("-")
        range_start = int(range_start_str) if range_start_str else 0
        range_end = int(range_end_str) if range_end_str else file_size - 1
        range_end = min(range_end, file_size - 1)
        content_length = range_end - range_start + 1

        def iter_range():
            with open(file_path, "rb") as f:
                f.seek(range_start)
                remaining = content_length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            iter_range(),
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {range_start}-{range_end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
            },
        )

    def iter_file():
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        },
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/azure")
async def health_azure():
    from services.azure_vi_service import get_client
    try:
        result = get_client().check_health()
        return result
    except RuntimeError as e:
        return {"ok": False, "detail": str(e)}


@app.get("/health/ytdlp")
async def health_ytdlp():
    import subprocess
    proc = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True, timeout=10)
    if proc.returncode == 0:
        return {"ok": True, "version": proc.stdout.strip()}
    return {"ok": False, "detail": proc.stderr.strip()}
