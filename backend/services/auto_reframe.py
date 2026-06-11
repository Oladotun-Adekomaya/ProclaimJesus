"""
Auto-reframe helper: detect the dominant face center in a video and
produce FFmpeg crop+scale filter strings for 9:16 / 1:1 output.

Approach mirrors SmartClipper2: sample a handful of frames with MediaPipe
FaceDetection, average the X position, generate a static crop filter.
Falls back to center crop when no face is found.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def detect_face_x_ratio(video_path: str, num_samples: int = 7) -> Optional[float]:
    """
    Sample `num_samples` evenly-spaced frames from `video_path`, run MediaPipe
    FaceDetection on each, and return the average face-center X as a fraction
    of frame width (0.0 … 1.0).  Returns None if no face is detected.

    Works on local files and HTTP(S) URLs (OpenCV can open both).
    """
    try:
        import cv2
        import mediapipe as mp
    except ImportError:
        logger.warning("mediapipe / opencv not installed — falling back to center crop")
        return None

    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.warning(f"Could not open video for face detection: {video_path[:80]}")
            return None

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            total_frames = 300  # safe fallback for streams without frame count

        detector = mp.solutions.face_detection.FaceDetection(
            model_selection=1,        # full-range model (better for distant faces)
            min_detection_confidence=0.5,
        )

        x_ratios: list[float] = []
        for i in range(num_samples):
            frame_idx = int(total_frames * i / num_samples)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ok, frame = cap.read()
            if not ok:
                continue
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = detector.process(rgb)
            if result.detections:
                bb = result.detections[0].location_data.relative_bounding_box
                x_ratios.append(bb.xmin + bb.width / 2.0)

        cap.release()
        detector.close()

        if not x_ratios:
            logger.info("No face detected in sampled frames — using center crop")
            return None

        avg = sum(x_ratios) / len(x_ratios)
        logger.info(f"Face center X ratio: {avg:.4f} (from {len(x_ratios)} detections)")
        return avg

    except Exception as e:
        logger.warning(f"Face detection failed ({e}) — using center crop")
        return None


def build_reframe_filter(
    face_x_ratio: Optional[float],
    aspect_ratio: str,
    resolution: str,
) -> str:
    """
    Return an FFmpeg video filter string for the requested aspect ratio.

    aspect_ratio: "9:16" | "1:1"  (caller must not pass "16:9")
    resolution:   "720p" | "1080p" | "4k"
    face_x_ratio: 0.0–1.0 face center X, or None → center
    """
    cx = face_x_ratio if face_x_ratio is not None else 0.5

    if aspect_ratio == "9:16":
        heights = {"720p": 1280, "1080p": 1920, "4k": 3840}
        out_h = heights.get(resolution, 1920)
        out_w = out_h * 9 // 16
        # Clamp so crop window never exceeds frame boundaries
        x_expr = f"max(0,min(iw-{out_w},trunc(iw*{cx:.6f}-{out_w}/2)))"
        return f"crop={out_w}:ih:{x_expr}:0,scale={out_w}:{out_h}"

    elif aspect_ratio == "1:1":
        sizes = {"720p": 720, "1080p": 1080, "4k": 2160}
        s = sizes.get(resolution, 1080)
        # Square crop centered on face X, full height crop centered vertically
        x_expr = f"max(0,min(iw-ih,trunc(iw*{cx:.6f}-ih/2)))"
        return f"crop=ih:ih:{x_expr}:0,scale={s}:{s}"

    # Fallback — should not be called for 16:9
    heights = {"720p": 720, "1080p": 1080, "4k": 2160}
    h = heights.get(resolution, 1080)
    return f"scale=-2:{h}"
