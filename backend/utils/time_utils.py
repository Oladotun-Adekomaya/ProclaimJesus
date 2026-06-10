"""Timestamp conversion utilities for Azure Video Indexer format."""


def ts_to_seconds(ts: str | None) -> float:
    """Convert 'HH:MM:SS.fffffff' (Azure VI format) to seconds."""
    if not ts:
        return 0.0
    parts = ts.split(":")
    hours = int(parts[0])
    minutes = int(parts[1])
    seconds = float(parts[2])
    return round(hours * 3600 + minutes * 60 + seconds, 3)
