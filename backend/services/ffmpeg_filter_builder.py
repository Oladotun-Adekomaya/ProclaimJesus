"""
Translate OverlayLayer objects into FFmpeg filter_complex additions.

Each image layer needs an extra -i input. Each text layer uses drawtext.
Positions and sizes are stored as 0–100 (% of frame); this module
converts them to absolute pixels based on the output resolution.
"""

import base64
import os
import tempfile
from typing import Optional

from .overlay_schema import OverlayLayer

_RES_MAP = {
    "720p": (1280, 720),
    "1080p": (1920, 1080),
    "4k": (3840, 2160),
}


def build_overlay_filters(
    layers: list[OverlayLayer],
    clip_duration: float,
    resolution: str = "1080p",
    in_label: str = "outv",
    first_input_index: int = 1,
) -> tuple[list[str], list[str], str]:
    """
    Build the FFmpeg filter_complex additions for overlay layers.

    Returns:
        temp_files   — paths of temp image files to clean up after export
        filter_parts — list of filter strings (no trailing ';') to append
        out_label    — the final video label after all overlays are applied
    """
    vid_w, vid_h = _RES_MAP.get(resolution, (1920, 1080))
    temp_files: list[str] = []
    filter_parts: list[str] = []
    img_input_idx = first_input_index
    current = in_label

    for i, layer in enumerate(layers):
        next_label = f"ov{i}"
        end_t = clip_duration if layer.endTime == "end" else float(layer.endTime)
        # Clamp to valid range
        start_t = max(0.0, float(layer.startTime))
        end_t = min(clip_duration, end_t)
        if end_t <= start_t:
            end_t = clip_duration
        enable = f"between(t\\,{start_t:.3f}\\,{end_t:.3f})"

        if layer.type == "image" and layer.src:
            tmp_path = _decode_image(layer.src)
            if tmp_path is None:
                continue
            temp_files.append(tmp_path)

            # Scale image to target pixel width; keep aspect ratio
            target_w = max(1, int(vid_w * layer.size.width / 100))
            x_px = int(vid_w * layer.position.x / 100)
            y_px = int(vid_h * layer.position.y / 100)
            opacity = max(0.0, min(1.0, layer.opacity if layer.opacity is not None else 1.0))

            img_label = f"img{i}"
            filter_parts.append(
                f"[{img_input_idx}:v]scale={target_w}:-1,format=rgba,"
                f"colorchannelmixer=aa={opacity:.2f}[{img_label}]"
            )
            filter_parts.append(
                f"[{current}][{img_label}]overlay={x_px}:{y_px}:enable='{enable}'[{next_label}]"
            )
            img_input_idx += 1

        elif layer.type == "text" and layer.content:
            x_px = int(vid_w * layer.position.x / 100)
            y_px = int(vid_h * layer.position.y / 100)
            font_size = layer.fontSize if layer.fontSize else 24
            font_color = (layer.fontColor or "#ffffff").lstrip("#")
            bold_int = 1 if layer.bold else 0
            text = _escape_drawtext(layer.content)

            opts = [
                f"text='{text}'",
                f"x={x_px}",
                f"y={y_px}",
                f"fontsize={font_size}",
                f"fontcolor={font_color}",
                f"bold={bold_int}",
                f"enable='{enable}'",
            ]

            bg = (layer.backgroundColor or "").strip()
            if bg and bg != "transparent":
                bg_hex = bg.lstrip("#")
                opts.append(f"box=1:boxcolor={bg_hex}@0.6:boxborderw=6")

            filter_parts.append(
                f"[{current}]drawtext={':'.join(opts)}[{next_label}]"
            )

        else:
            # Empty / unsupported layer — skip and don't advance label
            continue

        current = next_label

    return temp_files, filter_parts, current


def _decode_image(src: str) -> Optional[str]:
    """Write a base64 data-URL image to a temp file. Returns path or None on error."""
    try:
        if "," in src:
            _, data = src.split(",", 1)
        else:
            data = src
        img_bytes = base64.b64decode(data)
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        tmp.write(img_bytes)
        tmp.close()
        return tmp.name
    except Exception:
        return None


def _escape_drawtext(text: str) -> str:
    """Escape text for use inside FFmpeg drawtext filter."""
    return (
        text.replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace(":", "\\:")
            .replace("[", "\\[")
            .replace("]", "\\]")
            .replace(",", "\\,")
            .replace(";", "\\;")
            .replace("\n", " ")
    )
