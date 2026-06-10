"""AI feature endpoints: filler word detection, clip creation, Ollama model listing."""

import logging
import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.ai_provider import AIProvider, detect_filler_words, create_clip_suggestion
from services.sermon_ai_service import suggest_sermon_clips

logger = logging.getLogger(__name__)
router = APIRouter()


class WordInfo(BaseModel):
    index: int
    word: str
    start: Optional[float] = None
    end: Optional[float] = None


class FillerRequest(BaseModel):
    transcript: str
    words: List[WordInfo]
    provider: str = "ollama"
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    custom_filler_words: Optional[str] = None


class ClipRequest(BaseModel):
    transcript: str
    words: List[WordInfo]
    provider: str = "ollama"
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    target_duration: int = 60


@router.post("/ai/filler-removal")
async def filler_removal(req: FillerRequest):
    try:
        words_dicts = [w.model_dump() for w in req.words]
        result = detect_filler_words(
            transcript=req.transcript,
            words=words_dicts,
            provider=req.provider,
            model=req.model,
            api_key=req.api_key,
            base_url=req.base_url,
            custom_filler_words=req.custom_filler_words,
        )
        return result
    except Exception as e:
        logger.error(f"Filler detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/create-clip")
async def create_clip(req: ClipRequest):
    try:
        words_dicts = [w.model_dump() for w in req.words]
        result = create_clip_suggestion(
            transcript=req.transcript,
            words=words_dicts,
            target_duration=req.target_duration,
            provider=req.provider,
            model=req.model,
            api_key=req.api_key,
            base_url=req.base_url,
        )
        return result
    except Exception as e:
        logger.error(f"Clip creation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class SermonClipRequest(BaseModel):
    segments: List[dict]
    topics: List[str] = []
    keywords: List[str] = []
    platform: str = "shorts"
    api_key: Optional[str] = None


@router.post("/ai/sermon-clips")
async def sermon_clips(req: SermonClipRequest):
    try:
        key = req.api_key or os.environ.get("ANTHROPIC_API_KEY")
        clips = suggest_sermon_clips(
            segments=req.segments,
            topics=req.topics,
            keywords=req.keywords,
            platform=req.platform,
            api_key=key,
        )
        return {"clips": clips}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Sermon clip suggestion failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ai/ollama-models")
async def ollama_models(base_url: str = "http://localhost:11434"):
    models = AIProvider.list_ollama_models(base_url)
    return {"models": models}
