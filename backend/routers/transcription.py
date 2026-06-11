"""URL-based transcription via Azure AI Video Indexer."""

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from services.azure_vi_service import get_client
from services.transcript_parser import parse_vi_index
from services.url_resolver import resolve_url, is_youtube

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/transcribe/azure", tags=["transcription"])


class URLSubmitRequest(BaseModel):
    url: str
    language: str = "auto"


class FileSubmitRequest(BaseModel):
    file_path: str
    language: str = "auto"


@router.post("/url")
async def submit_url(req: URLSubmitRequest):
    """
    Submit a video URL for transcription via Azure Video Indexer.

    Extracts a direct stream URL (no download) and submits it to Azure VI
    for cloud-to-cloud ingestion.  Returns a real Azure VI videoId immediately.

    YouTube: yt-dlp extracts the googlevideo.com CDN URL using browser cookies
    on the user's machine (Electron only — must be called from localhost).
    Web requests for YouTube URLs should be rejected client-side before reaching
    this endpoint.
    """
    if is_youtube(req.url):
        # YouTube URL extraction requires browser cookies on user's machine.
        # If this endpoint is hit from a web client without Electron, the
        # extraction will likely fail with a bot-detection error.
        try:
            resolved = resolve_url(req.url)
        except ValueError as e:
            raise HTTPException(
                status_code=422,
                detail=(
                    "YouTube videos require the ProclaimJesus desktop app. "
                    "Download it to use YouTube URLs, or paste a direct .mp4 link. "
                    f"Technical detail: {e}"
                ),
            )
    else:
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


@router.post("/file")
async def submit_file(req: FileSubmitRequest):
    """
    Submit a local video file for transcription via Azure Video Indexer.
    The backend reads the file directly from the given path — this endpoint
    is only reachable from Electron (localhost), where the backend and the
    user's filesystem are on the same machine.
    """
    import os

    if not os.path.isfile(req.file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")

    name = os.path.basename(req.file_path)

    try:
        client = get_client()
        video_id = client.submit_file(req.file_path, name=name, language=req.language)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Azure VI file submission failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Azure Video Indexer error: {e}")

    return {"videoId": video_id, "title": name, "duration": None}


@router.get("/{video_id}/status")
async def get_status(video_id: str):
    """Poll Azure VI processing state."""
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
    """Fetch the parsed transcript once state == 'Processed'."""
    try:
        client = get_client()
        index = client.get_index(video_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Index fetch failed for {video_id}: {e}", exc_info=True)
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


@router.get("/{video_id}/stream-url")
async def get_stream_url(video_id: str):
    """
    Return a fresh Azure VI streaming URL for a previously processed video.
    Used when loading a saved project whose stored stream URL has expired.
    """
    try:
        client = get_client()
        index = client.get_index(video_id)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    videos = index.get("videos", [])
    video_stream_url = None
    if videos:
        v = videos[0]
        published_url = v.get("publishedUrl")
        view_token = v.get("viewToken")
        if published_url and view_token:
            video_stream_url = f"{published_url}?accessToken={view_token}"

    if not video_stream_url:
        raise HTTPException(status_code=404, detail="No streaming URL available for this video.")

    return {"videoStreamUrl": video_stream_url}


@router.delete("/{video_id}")
async def delete_video(video_id: str, background_tasks: BackgroundTasks):
    """Queue deletion of a video from Azure VI to preserve quota."""
    try:
        background_tasks.add_task(get_client().delete_video, video_id)
        return {"videoId": video_id, "status": "deletion queued"}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Deletion failed for {video_id}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=str(e))
