"""URL-based transcription via Azure AI Video Indexer."""

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from services.azure_vi_service import get_client
from services.transcript_parser import parse_vi_index
from services.url_resolver import resolve_url

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/transcribe/azure", tags=["transcription"])


class URLSubmitRequest(BaseModel):
    url: str
    language: str = "auto"


@router.post("/url")
async def submit_url(req: URLSubmitRequest):
    """
    Resolve a YouTube/Facebook/Vimeo URL and submit it to Azure Video Indexer.
    Returns videoId immediately — poll /status until state == 'Processed'.
    """
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
        # Missing env vars
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Azure VI submission failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Azure Video Indexer error: {e}")

    return {
        "videoId": video_id,
        "title": resolved["title"],
        "duration": resolved["duration"],
    }


@router.get("/{video_id}/status")
async def get_status(video_id: str):
    """Poll Azure Video Indexer processing state for a submitted video."""
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
    Returns words, segments, speakers, topics, keywords, language.
    """
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

    # Best-effort: extract Azure VI streaming URL so the video player can play along
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
    """
    Queue deletion of a video from Azure VI storage.
    Call this after the clip has been exported to preserve free-tier quota.
    """
    try:
        client = get_client()
        background_tasks.add_task(client.delete_video, video_id)
        return {"videoId": video_id, "status": "deletion queued"}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Deletion failed for {video_id}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=str(e))
