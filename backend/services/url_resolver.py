"""Resolve video URLs for Azure Video Indexer ingestion.

For all supported platforms (YouTube, Facebook, Vimeo, direct MP4 links) we
extract a direct stream URL via yt-dlp and let Azure VI fetch it cloud-to-cloud.
No video data is downloaded to the server — only metadata (~1 KB).

YouTube specifics: yt-dlp URL extraction on server datacenter IPs is blocked
by YouTube bot detection.  This function MUST be called from an Electron
backend (user's local machine, residential IP + browser cookies).  Web users
should be shown a "use desktop app" message instead.
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

# Browsers to try for cookie extraction, in preference order
_BROWSERS = ["chrome", "firefox", "edge", "chromium", "safari", "opera"]


def is_youtube(url: str) -> bool:
    return bool(_YOUTUBE_RE.match(url))


def resolve_url(url: str) -> dict:
    """
    Extract a direct stream URL without downloading any video content.
    Returns {"stream_url": str, "title": str, "duration": float | None}

    Direct video files (.mp4, .mov, etc.) are passed through unchanged.
    All other URLs (YouTube, Facebook, Vimeo) are resolved via yt-dlp
    URL-only extraction (download=False).

    For YouTube: tries browser cookie sources in order to bypass bot detection.
    Raises ValueError if extraction fails.
    """
    if _DIRECT_VIDEO_RE.match(url):
        title = url.split("/")[-1].split("?")[0]
        return {"stream_url": url, "title": title, "duration": None}

    if is_youtube(url):
        return _resolve_youtube_via_cookies(url)

    return _resolve_via_ytdlp(url, cookie_browser=None)


def _resolve_youtube_via_cookies(url: str) -> dict:
    """
    Extract YouTube CDN URL using browser cookies (no download).
    Tries without cookies first, then each browser in order.
    The extracted googlevideo.com URL is submitted to Azure VI for
    cloud-to-cloud download — zero bytes transferred over user's connection.
    """
    last_error: Exception | None = None

    # Try without cookies (sometimes works for public videos on local IPs)
    try:
        return _resolve_via_ytdlp(url, cookie_browser=None)
    except Exception as e:
        last_error = e
        logger.info(f"yt-dlp no-cookie YouTube attempt failed: {e}")

    # Try each browser's cookie store
    for browser in _BROWSERS:
        try:
            return _resolve_via_ytdlp(url, cookie_browser=browser)
        except Exception as e:
            last_error = e
            logger.info(f"yt-dlp {browser} cookie attempt failed: {e}")

    raise ValueError(
        f"Could not extract YouTube URL. Make sure you are signed in to YouTube "
        f"in Chrome or Firefox on this computer. Last error: {last_error}"
    )


def _resolve_via_ytdlp(url: str, cookie_browser: str | None) -> dict:
    import yt_dlp

    ydl_opts: dict = {
        "format": "best[ext=mp4][height<=1080]/best[ext=mp4]/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }
    if cookie_browser:
        ydl_opts["cookiesfrombrowser"] = (cookie_browser,)

    logger.info(f"Resolving via yt-dlp (cookies={cookie_browser}): {url}")
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as e:
        raise ValueError(f"Could not resolve video URL: {e}")

    stream_url = info.get("url")
    if not stream_url:
        # Some formats nest the URL under "formats"
        formats = info.get("formats") or []
        for fmt in reversed(formats):
            if fmt.get("url"):
                stream_url = fmt["url"]
                break

    if not stream_url:
        raise ValueError("yt-dlp returned no stream URL for this video.")

    title = info.get("title") or info.get("id") or "sermon"
    duration = info.get("duration")

    logger.info(f"Resolved '{title}' ({duration}s) — CDN URL obtained, no download")
    return {"stream_url": stream_url, "title": title, "duration": duration}
