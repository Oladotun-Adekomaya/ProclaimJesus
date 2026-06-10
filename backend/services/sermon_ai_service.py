"""Sermon-aware clip suggestions powered by Claude."""

import json
import logging
import os
from typing import Optional

import anthropic

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are an expert sermon editor for a church media team.
Your job is to identify the most powerful short-form clips from sermon transcripts.

Priorities (highest to lowest):
1. Scripture references — moments where a Bible verse is quoted or expounded
2. Altar calls / calls to action — direct invitations to respond, pray, or commit
3. Complete teaching moments — illustrations, stories, revelations with clear arc
4. Emotional peaks — powerful declarations, testimonies, breakthrough moments

Rules:
- Never cut mid-sentence or mid-thought — clips must open and close cleanly
- Avoid clips that start or end during worship, music, or announcements
- Each clip must make sense to a viewer with no prior context
- Score 0.0–1.0 on: standalone clarity × emotional impact × completeness

Return ONLY valid JSON. No preamble, no explanation."""

_PLATFORM_SECONDS = {"shorts": 60, "reels": 90, "tiktok": 45, "custom": 120}


def suggest_sermon_clips(
    segments: list[dict],
    topics: list[str],
    keywords: list[str],
    platform: str = "shorts",
    api_key: Optional[str] = None,
) -> list[dict]:
    """
    Call Claude to suggest the best sermon clips.

    segments: phrase-level dicts with {start, end, text}
    Returns a list of ClipSuggestion dicts sorted by score descending.
    """
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Add it to your .env file."
        )

    target_seconds = _PLATFORM_SECONDS.get(platform, 60)

    # Build compact phrase-level transcript
    lines = []
    for seg in segments:
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        lines.append(f"[{seg.get('start', 0):.1f}s–{seg.get('end', 0):.1f}s] {text}")
    transcript_text = "\n".join(lines)

    topics_str = ", ".join(topics[:10]) if topics else "none"
    keywords_str = ", ".join(keywords[:15]) if keywords else "none"

    user_prompt = f"""Sermon transcript:
Topics: {topics_str}
Keywords: {keywords_str}
Target platform: {platform} (~{target_seconds}s per clip)

---
{transcript_text}
---

Find 3–5 clips of approximately {target_seconds}s each. Return JSON:
{{
  "clips": [
    {{
      "title": "short memorable title",
      "startTime": <float seconds>,
      "endTime": <float seconds>,
      "score": <float 0–1>,
      "rationale": "one sentence explaining why this clip works",
      "themes": ["theme1", "theme2"],
      "hasScripture": <bool>,
      "hasAltarCall": <bool>
    }}
  ]
}}"""

    client = anthropic.Anthropic(api_key=key)
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        temperature=0.4,
        system=[
            {
                "type": "text",
                "text": _SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw = response.content[0].text.strip()
    logger.info(
        f"Sermon clips response: {response.usage.input_tokens} in / "
        f"{response.usage.output_tokens} out tokens"
    )

    start_idx = raw.find("{")
    end_idx = raw.rfind("}") + 1
    if start_idx < 0 or end_idx <= start_idx:
        logger.error(f"No JSON in Claude response: {raw[:300]}")
        return []

    data = json.loads(raw[start_idx:end_idx])
    clips = data.get("clips", [])

    result = []
    for i, clip in enumerate(clips):
        start_t = float(clip.get("startTime", 0))
        end_t = float(clip.get("endTime", 0))
        result.append({
            "id": f"clip_{i}",
            "title": clip.get("title", f"Clip {i + 1}"),
            "startTime": round(start_t, 2),
            "endTime": round(end_t, 2),
            "duration": round(end_t - start_t, 1),
            "platform": platform,
            "score": round(float(clip.get("score", 0.5)), 2),
            "rationale": clip.get("rationale", ""),
            "themes": clip.get("themes", []),
            "hasScripture": bool(clip.get("hasScripture", False)),
            "hasAltarCall": bool(clip.get("hasAltarCall", False)),
        })

    return sorted(result, key=lambda c: c["score"], reverse=True)
