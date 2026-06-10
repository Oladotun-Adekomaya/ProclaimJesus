"""URL-based transcription via Azure AI Video Indexer."""

import logging
import os
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from services.azure_vi_service import get_client
from services.transcript_parser import parse_vi_index
from services.url_resolver import resolve_url, is_youtube, download_video

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/transcribe/azure", tags=["transcription"])

# ── In-memory YouTube download job store ──────────────────────────────────────
# Maps a temporary job_id → job state dict.
# YouTube videos must be downloaded locally before Azure VI can ingest them.
# The job is created immediately so the client can start polling; the actual
# yt-dlp download + Azure VI upload happen in a BackgroundTask.
_jobs: dict[str, dict] = {}


class URLSubmitRequest(BaseModel):
    url: str
    language: str = "auto"


@router.post("/url")
async def submit_url(req: URLSubmitRequest, background_tasks: BackgroundTasks):
    """
    Submit a video URL for transcription via Azure Video Indexer.

    For YouTube URLs this starts a background download job and returns a
    temporary job_id immediately.  Poll /status as normal — the state will
    progress: Downloading → Uploading → Processing → Processed.

    For all other URLs (direct MP4, Facebook, Vimeo) the video URL is
    resolved and submitted directly; a real Azure VI videoId is returned.
    """
    if is_youtube(req.url):
        job_id = f"pj_{uuid.uuid4().hex[:12]}"
        _jobs[job_id] = {
            "phase": "Downloading",
            "video_id": None,
            "title": "YouTube video",
            "error": None,
        }
        background_tasks.add_task(_youtube_download_and_submit, job_id, req.url, req.language)
        logger.info(f"YouTube download job created: {job_id}")
        return {"videoId": job_id, "title": "YouTube video", "duration": None}

    # Non-YouTube: resolve to direct stream URL and submit to Azure VI
    try:
        resolved = resolve_url(req.url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    try:
        client = get_client()
        video_id = client.submit_url(
            video_url=resolved["stream_url"],
            name=resolved["title"],
            language=req.language,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Azure VI submission failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Azure Video Indexer error: {e}")

    return {
        "videoId": video_id,
        "title": resolved["title"],
        "duration": resolved["duration"],
    }


async def _youtube_download_and_submit(job_id: str, url: str, language: str):
    """Background task: download YouTube video, upload to Azure VI."""
    job = _jobs[job_id]
    file_path: str | None = None
    try:
        # Step 1: Download
        logger.info(f"[{job_id}] Downloading YouTube video: {url}")
        result = download_video(url)
        file_path = result["file_path"]
        job["title"] = result["title"]

        # Step 2: Upload to Azure VI
        job["phase"] = "Uploading"
        logger.info(f"[{job_id}] Uploading to Azure VI: {file_path}")
        client = get_client()
        video_id = client.submit_file(file_path, name=result["title"], language=language)

        # Step 3: Hand off to Azure VI — normal polling takes over
        job["video_id"] = video_id
        job["phase"] = "Processing"
        logger.info(f"[{job_id}] Azure VI accepted upload → videoId={video_id}")

    except Exception as e:
        logger.error(f"[{job_id}] YouTube job failed: {e}", exc_info=True)
        job["phase"] = "Failed"
        job["error"] = str(e)
    finally:
        if file_path and os.path.exists(file_path):
            try:
                os.unlink(file_path)
                os.rmdir(os.path.dirname(file_path))
            except OSError:
                pass


@router.get("/{video_id}/status")
async def get_status(video_id: str):
    """Poll processing state. Handles both Azure VI video IDs and YouTube job IDs."""
    # YouTube download job
    if video_id in _jobs:
        job = _jobs[video_id]
        phase = job["phase"]
        if phase == "Failed":
            raise HTTPException(status_code=502, detail=job.get("error", "Download failed"))
        if phase in ("Downloading", "Uploading"):
            return {"videoId": video_id, "state": phase}
        # Phase == "Processing" (or later) — forward to the real Azure VI videoId
        real_id = job.get("video_id")
        if real_id:
            try:
                state = get_client().get_status(real_id)
                return {"videoId": video_id, "state": state}
            except Exception as e:
                raise HTTPException(status_code=502, detail=str(e))
        return {"videoId": video_id, "state": "Processing"}

    # Normal Azure VI video
    try:
        state = get_client().get_status(video_id)
        return {"videoId": video_id, "state": state}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Status check failed for {video_id}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{video_id}/result")
async def get_result(video_id: str):
    """
    Fetch the parsed transcript once state == 'Processed'.
    For YouTube job IDs, transparently forwards to the real Azure VI videoId.
    """
    # Resolve YouTube job → real Azure VI videoId
    real_id = video_id
    if video_id in _jobs:
        job = _jobs[video_id]
        if not job.get("video_id"):
            raise HTTPException(status_code=202, detail=f"Video is still {job['phase']}.")
        real_id = job["video_id"]

    try:
        client = get_client()
        index = client.get_index(real_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Index fetch failed for {real_id}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=str(e))

    state = index.get("state")
    if state != "Processed":
        raise HTTPException(
            status_code=202,
            detail=f"Video is still {state}. Retry when state is 'Processed'.",
        )

    result = parse_vi_index(index)

    # Extract Azure VI streaming URL for the video player
    videos = index.get("videos", [])
    video_stream_url = None
    if videos:
        v = videos[0]
        published_url = v.get("publishedUrl")
        view_token = v.get("viewToken")
        if published_url and view_token:
            video_stream_url = f"{published_url}?accessToken={view_token}"

    result["videoStreamUrl"] = video_stream_url
    return result


@router.delete("/{video_id}")
async def delete_video(video_id: str, background_tasks: BackgroundTasks):
    """Queue deletion of a video from Azure VI to preserve quota."""
    # Resolve YouTube job → real Azure VI videoId
    real_id = video_id
    if video_id in _jobs:
        real_id = _jobs[video_id].get("video_id") or video_id
        _jobs.pop(video_id, None)

    try:
        background_tasks.add_task(get_client().delete_video, real_id)
        return {"videoId": video_id, "status": "deletion queued"}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Deletion failed for {real_id}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=str(e))
