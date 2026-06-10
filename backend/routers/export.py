"""Export endpoint for video cutting and rendering."""

import logging
import tempfile
import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services.video_editor import export_stream_copy, export_reencode, export_reencode_with_subs, export_with_overlays
from services.audio_cleaner import clean_audio
from services.caption_generator import generate_srt, generate_ass, save_captions
from services.overlay_schema import OverlayLayer

logger = logging.getLogger(__name__)
router = APIRouter()


class SegmentModel(BaseModel):
    start: float
    end: float


class ExportWordModel(BaseModel):
    word: str
    start: float
    end: float
    confidence: float = 0.0


class ExportRequest(BaseModel):
    input_path: str
    output_path: Optional[str] = None   # if omitted, a temp file is created
    keep_segments: List[SegmentModel]
    mode: str = "fast"
    resolution: str = "1080p"
    format: str = "mp4"
    enhanceAudio: bool = False
    captions: str = "none"
    words: Optional[List[ExportWordModel]] = None
    deleted_indices: Optional[List[int]] = None
    overlays: Optional[List[OverlayLayer]] = None


def _mux_audio(video_path: str, audio_path: str, output_path: str) -> str:
    """Replace video's audio track with cleaned audio using FFmpeg."""
    import subprocess
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "copy",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Audio mux failed: {result.stderr[-300:]}")
    return output_path


@router.post("/export")
async def export_video(req: ExportRequest):
    try:
        segments = [{"start": s.start, "end": s.end} for s in req.keep_segments]

        if not segments:
            raise HTTPException(status_code=400, detail="No segments to export")

        # Generate a temp output path when the client doesn't specify one (web mode)
        fmt = req.format or "mp4"
        temp_output = req.output_path is None
        output_path = req.output_path or tempfile.mktemp(suffix=f".{fmt}", prefix="pj_export_")

        has_overlays = bool(req.overlays)
        use_stream_copy = req.mode == "fast" and len(segments) == 1 and not has_overlays
        needs_reencode_for_subs = req.captions == "burn-in"

        # Burn-in captions or overlays require re-encode
        if needs_reencode_for_subs or has_overlays:
            use_stream_copy = False

        words_dicts = [w.model_dump() for w in req.words] if req.words else []
        deleted_set = set(req.deleted_indices or [])

        # Generate ASS file for burn-in
        ass_path = None
        if req.captions == "burn-in" and words_dicts:
            ass_content = generate_ass(words_dicts, deleted_set)
            tmp = tempfile.NamedTemporaryFile(suffix=".ass", delete=False, mode="w", encoding="utf-8")
            tmp.write(ass_content)
            tmp.close()
            ass_path = tmp.name

        clip_duration = sum(s.end - s.start for s in req.keep_segments)

        try:
            if use_stream_copy:
                output = export_stream_copy(req.input_path, output_path, segments)
            elif has_overlays:
                output = export_with_overlays(
                    req.input_path,
                    output_path,
                    segments,
                    req.overlays or [],
                    clip_duration,
                    resolution=req.resolution,
                    format_hint=req.format,
                    subtitle_path=ass_path,
                )
            elif ass_path:
                output = export_reencode_with_subs(
                    req.input_path,
                    output_path,
                    segments,
                    ass_path,
                    resolution=req.resolution,
                    format_hint=req.format,
                )
            else:
                output = export_reencode(
                    req.input_path,
                    output_path,
                    segments,
                    resolution=req.resolution,
                    format_hint=req.format,
                )
        finally:
            if ass_path and os.path.exists(ass_path):
                os.unlink(ass_path)

        # Audio enhancement: clean, then mux back into the exported video
        if req.enhanceAudio:
            try:
                tmp_dir = tempfile.mkdtemp(prefix="cutscript_audio_")
                cleaned_audio = os.path.join(tmp_dir, "cleaned.wav")
                clean_audio(output, cleaned_audio)

                muxed_path = output + ".muxed.mp4"
                _mux_audio(output, cleaned_audio, muxed_path)

                os.replace(muxed_path, output)
                logger.info(f"Audio enhanced and muxed into {output}")

                # Cleanup
                try:
                    os.remove(cleaned_audio)
                    os.rmdir(tmp_dir)
                except OSError:
                    pass
            except Exception as e:
                logger.warning(f"Audio enhancement failed (non-fatal): {e}")

        # Sidecar SRT: generate and save alongside video
        srt_path = None
        if req.captions == "sidecar" and words_dicts:
            srt_content = generate_srt(words_dicts, deleted_set)
            srt_path = output.rsplit(".", 1)[0] + ".srt"
            save_captions(srt_content, srt_path)
            logger.info(f"Sidecar SRT saved to {srt_path}")

        result: dict = {"status": "ok", "output_path": output, "temp": temp_output}
        if srt_path:
            result["srt_path"] = srt_path
        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.error(f"Export failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Export error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/download")
async def download_export(path: str = Query(...), filename: str = Query("sermon_clip.mp4")):
    """
    Serve an exported file as a browser download attachment.
    Used by web clients after POST /export returns a temp output_path.
    """
    from pathlib import Path as P
    file_path = P(path)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Export file not found")
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
