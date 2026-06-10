"""Resolve video URLs for Azure Video Indexer ingestion.

Azure VI natively handles YouTube URLs, so we pass those through directly.
For Facebook, Vimeo, and other platforms we use yt-dlp to get a direct stream URL.
Direct .mp4/.webm/etc links are also passed through unchanged.
"""

import logging
import re

logger = logging.getLogger(__name__)

_DIRECT_VIDEO_RE = re.compile(
    r"^https?://.+\.(mp4|mov|webm|mkv|m4v)(\?.*)?$", re.IGNORECASE
)
_YOUTUBE_RE = re.compile(
    r"^https?://(www\.)?(youtube\.com/watch|youtu\.be/)", re.IGNORECASE
)


def resolve_url(url: str) -> dict:
    """
    Returns {"stream_url": str, "title": str, "duration": float | None}

    YouTube URLs and direct video file links are returned as-is — Azure VI
    handles both natively. Other platforms (Facebook, Vimeo, etc.) are resolved
    via yt-dlp to get a direct downloadable stream URL.
    """
    # Direct video file — pass through
    if _DIRECT_VIDEO_RE.match(url):
        title = url.split("/")[-1].split("?")[0]
        return {"stream_url": url, "title": title, "duration": None}

    # YouTube — Azure VI ingests these natively, no yt-dlp needed
    if _YOUTUBE_RE.match(url):
        logger.info(f"YouTube URL passed directly to Azure VI: {url}")
        return {"stream_url": url, "title": "YouTube video", "duration": None}

    # Facebook, Vimeo, and other platforms — resolve via yt-dlp
    return _resolve_via_ytdlp(url)


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
