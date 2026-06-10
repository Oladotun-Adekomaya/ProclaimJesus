"""Resolve video URLs for Azure Video Indexer ingestion.

For non-YouTube platforms (Facebook, Vimeo, direct MP4 links) we extract a
direct stream URL via yt-dlp and let Azure VI fetch it cloud-to-cloud.

YouTube is different: Azure VI cannot ingest YouTube page URLs, and yt-dlp
URL-only extraction is blocked by bot detection on server IPs.  The solution
is to download the YouTube video locally and upload the file directly to
Azure VI.  Call `is_youtube(url)` first, then `download_video(url)`.
"""

import logging
import os
import re
import tempfile

logger = logging.getLogger(__name__)

_DIRECT_VIDEO_RE = re.compile(
    r"^https?://.+\.(mp4|mov|webm|mkv|m4v)(\?.*)?$", re.IGNORECASE
)
_YOUTUBE_RE = re.compile(
    r"^https?://(www\.)?(youtube\.com/watch|youtu\.be/)", re.IGNORECASE
)

# Browsers to try for cookie extraction, in preference order
_BROWSERS = ["chrome", "firefox", "edge", "chromium", "safari", "opera"]


def is_youtube(url: str) -> bool:
    return bool(_YOUTUBE_RE.match(url))


def resolve_url(url: str) -> dict:
    """
    Returns {"stream_url": str, "title": str, "duration": float | None}

    Direct video files are passed through unchanged.
    Other platforms (Facebook, Vimeo, etc.) are resolved to a direct stream URL.

    YouTube URLs raise ValueError — callers should use download_video() instead.
    """
    if _DIRECT_VIDEO_RE.match(url):
        title = url.split("/")[-1].split("?")[0]
        return {"stream_url": url, "title": title, "duration": None}

    if is_youtube(url):
        raise ValueError(
            "YouTube URLs must be downloaded locally before submission. "
            "Use download_video() instead of resolve_url() for YouTube."
        )

    return _resolve_via_ytdlp(url)


def download_video(url: str) -> dict:
    """
    Download a video to a local temp file using yt-dlp.
    Returns {"file_path": str, "title": str, "duration": float | None}

    The caller is responsible for deleting file_path after use.

    Tries without cookies first (works for most public YouTube videos).
    If that fails, tries extracting cookies from each installed browser.
    """
    import yt_dlp

    temp_dir = tempfile.mkdtemp(prefix="pj_dl_")
    output_template = os.path.join(temp_dir, "%(id)s.%(ext)s")

    base_opts = {
        "format": "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "merge_output_format": "mp4",
    }

    last_error: Exception | None = None

    # 1. Try without cookies (works for most public videos)
    try:
        return _do_download(url, base_opts)
    except Exception as e:
        last_error = e
        logger.info(f"yt-dlp no-cookie attempt failed: {e}")

    # 2. Try with cookies from each installed browser
    for browser in _BROWSERS:
        try:
            opts = {**base_opts, "cookiesfrombrowser": (browser,)}
            return _do_download(url, opts)
        except Exception as e:
            last_error = e
            logger.info(f"yt-dlp {browser} cookie attempt failed: {e}")

    raise ValueError(
        f"Could not download YouTube video. "
        f"This usually means YouTube is rate-limiting the server. "
        f"Try pasting a direct .mp4 URL instead, or use the desktop app "
        f"(it uses your own YouTube account). Last error: {last_error}"
    )


def _do_download(url: str, opts: dict) -> dict:
    import yt_dlp

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)

    title = info.get("title") or info.get("id") or "sermon"
    duration = info.get("duration")
    file_path = ydl.prepare_filename(info)

    # yt-dlp may change the extension after merging; find the actual file
    if not os.path.exists(file_path):
        for ext in ["mp4", "mkv", "webm"]:
            candidate = os.path.splitext(file_path)[0] + f".{ext}"
            if os.path.exists(candidate):
                file_path = candidate
                break

    if not os.path.exists(file_path):
        raise RuntimeError(f"Downloaded file not found at {file_path}")

    logger.info(f"Downloaded '{title}' ({duration}s) → {file_path}")
    return {"file_path": file_path, "title": title, "duration": duration}


def _resolve_via_ytdlp(url: str) -> dict:
    import yt_dlp

    ydl_opts = {
        "format": "best[ext=mp4][height<=1080]/best[ext=mp4]/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }

    logger.info(f"Resolving via yt-dlp: {url}")
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as e:
        raise ValueError(f"Could not resolve video URL: {e}")

    stream_url = info.get("url")
    if not stream_url:
        raise ValueError("yt-dlp returned no stream URL for this video.")

    title = info.get("title") or info.get("id") or "sermon"
    duration = info.get("duration")

    logger.info(f"Resolved '{title}' ({duration}s)")
    return {"stream_url": stream_url, "title": title, "duration": duration}
