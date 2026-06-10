"""Parse Azure Video Indexer JSON into the ProclaimJesus word/segment format."""

import logging

from utils.time_utils import ts_to_seconds

logger = logging.getLogger(__name__)


def parse_vi_index(index: dict) -> dict:
    """
    Convert the raw Azure VI index JSON into the frontend-ready structure.

    Returns:
        {
            "words":    list of TranscriptWord dicts,
            "segments": list of segment dicts (CutScript-compatible),
            "speakers": list of speaker dicts,
            "topics":   list of topic name strings,
            "keywords": list of keyword strings,
            "language": detected language code,
        }
    """
    # Azure VI nests insights under videos[0], not at the top level
    videos = index.get("videos", [])
    if not videos:
        return _empty_result()

    video = videos[0]
    insights: dict = video.get("insights", {})

    speakers = _parse_speakers(insights.get("speakers", []))
    words, segments = _parse_transcript(insights.get("transcript", []))
    topics = [t["name"] for t in insights.get("topics", []) if t.get("name")]
    keywords = [k["text"] for k in insights.get("keywords", []) if k.get("text")]
    language = (
        insights.get("sourceLanguage")
        or insights.get("language")
        or video.get("sourceLanguage")
        or "en"
    )

    logger.info(
        f"Parsed {len(words)} words, {len(segments)} segments, "
        f"{len(speakers)} speakers from Azure VI index"
    )

    return {
        "words": words,
        "segments": segments,
        "speakers": speakers,
        "topics": topics,
        "keywords": keywords,
        "language": language,
    }


def _parse_transcript(transcript: list[dict]) -> tuple[list, list]:
    """
    Return (words, segments) from the Azure VI transcript array.

    Azure VI returns phrase-level entries. Each phrase may optionally contain
    a 'words' sub-array with individual word timestamps; if absent we synthesize
    evenly-distributed word timestamps from the phrase duration.
    """
    words: list[dict] = []
    segments: list[dict] = []
    word_counter = 0

    for phrase in transcript:
        phrase_id = phrase.get("id", 0)
        speaker_id = phrase.get("speakerId") or 0
        phrase_confidence = round(float(phrase.get("confidence", 0)), 3)
        phrase_text = phrase.get("text", "").strip()

        # Prefer adjustedStart/adjustedEnd (Azure's time-corrected values)
        instances = phrase.get("instances", [{}])
        inst = instances[0] if instances else {}
        phrase_start = ts_to_seconds(inst.get("adjustedStart") or inst.get("start"))
        phrase_end = ts_to_seconds(inst.get("adjustedEnd") or inst.get("end"))

        phrase_words: list[dict] = []

        # Use word-level data if Azure VI returned it
        for w in phrase.get("words", []):
            word_text = w.get("text", "").strip()
            if not word_text:
                continue
            w_inst = (w.get("instances") or [{}])[0]
            word = {
                "id": f"w{word_counter}",
                "text": word_text,
                "start": ts_to_seconds(w_inst.get("adjustedStart") or w_inst.get("start")),
                "end": ts_to_seconds(w_inst.get("adjustedEnd") or w_inst.get("end")),
                "speakerId": speaker_id,
                "confidence": phrase_confidence,
                "deleted": False,
            }
            words.append(word)
            phrase_words.append(word)
            word_counter += 1

        # Synthesize word timestamps when Azure VI only gives phrase-level data
        if not phrase_words and phrase_text:
            word_texts = phrase_text.split()
            duration = max(phrase_end - phrase_start, 0)
            count = len(word_texts)
            for i, wt in enumerate(word_texts):
                w_start = phrase_start + (i / max(count, 1)) * duration
                w_end = phrase_start + ((i + 1) / max(count, 1)) * duration
                word = {
                    "id": f"w{word_counter}",
                    "text": wt,
                    "start": round(w_start, 3),
                    "end": round(w_end, 3),
                    "speakerId": speaker_id,
                    "confidence": phrase_confidence,
                    "deleted": False,
                }
                words.append(word)
                phrase_words.append(word)
                word_counter += 1

        segments.append({
            "id": phrase_id,
            "start": phrase_start,
            "end": phrase_end,
            "text": phrase_text,
            "speakerId": speaker_id,
            "words": phrase_words,
        })

    return words, segments


def _parse_speakers(speakers_raw: list[dict]) -> list[dict]:
    result = []
    for s in speakers_raw:
        instances = s.get("instances", [])
        total_seconds = sum(
            ts_to_seconds(i.get("adjustedEnd") or i.get("end", "0:0:0"))
            - ts_to_seconds(i.get("adjustedStart") or i.get("start", "0:0:0"))
            for i in instances
        )
        result.append({
            "id": s.get("id", 0),
            "name": s.get("name") or f"Speaker {s.get('id', '?')}",
            "totalSeconds": round(total_seconds, 1),
        })
    return result


def _empty_result() -> dict:
    return {
        "words": [],
        "segments": [],
        "speakers": [],
        "topics": [],
        "keywords": [],
        "language": "en",
    }
