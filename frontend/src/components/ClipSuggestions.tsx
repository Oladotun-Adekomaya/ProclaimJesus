import { useCallback } from 'react';
import { Sparkles, BookOpen, Heart, Clock, Loader2, ChevronRight } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { useClipStore } from '../store/clipStore';
import type { Platform, SermonClipSuggestion } from '../types/project';

const PLATFORMS: { value: Platform; label: string; seconds: string }[] = [
  { value: 'shorts', label: 'YouTube Shorts', seconds: '≤60s' },
  { value: 'reels', label: 'Instagram Reels', seconds: '≤90s' },
  { value: 'tiktok', label: 'TikTok', seconds: '30–60s' },
  { value: 'custom', label: 'Custom', seconds: 'any' },
];

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function ClipSuggestions() {
  const segments = useEditorStore((s) => s.segments);
  const topics = useEditorStore((s) => s.topics);
  const keywords = useEditorStore((s) => s.keywords);
  const backendUrl = useEditorStore((s) => s.backendUrl);
  const applyClipRange = useEditorStore((s) => s.applyClipRange);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);

  const { suggestions, platform, isGenerating, error, setPlatform, setSuggestions, setGenerating, setError } =
    useClipStore();

  const handleGenerate = useCallback(async () => {
    if (segments.length === 0) return;
    setGenerating(true);

    // Send phrase-level segments (not individual words — keeps prompt compact)
    const segPayload = segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    }));

    try {
      const res = await fetch(`${backendUrl}/ai/sermon-clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: segPayload, topics, keywords, platform }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || res.statusText);
      }
      const data = await res.json();
      setSuggestions(data.clips ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to generate clips.');
    } finally {
      setGenerating(false);
    }
  }, [segments, topics, keywords, platform, backendUrl, setGenerating, setSuggestions, setError]);

  const handleGoTo = useCallback(
    (clip: SermonClipSuggestion) => {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      if (video) video.currentTime = clip.startTime;
      setCurrentTime(clip.startTime);
    },
    [setCurrentTime],
  );

  const handleApply = useCallback(
    (clip: SermonClipSuggestion) => {
      if (window.confirm(`Apply clip "${clip.title}"?\n\nThis will mark everything outside ${formatTime(clip.startTime)}–${formatTime(clip.endTime)} as deleted. You can undo this.`)) {
        applyClipRange(clip.startTime, clip.endTime);
      }
    },
    [applyClipRange],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-editor-border">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-editor-accent" />
          <span className="text-sm font-medium">Sermon Clips</span>
        </div>

        {/* Platform selector */}
        <div className="grid grid-cols-2 gap-1 mb-3">
          {PLATFORMS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPlatform(p.value)}
              className={`px-2 py-1.5 rounded text-xs text-left transition-colors ${
                platform === p.value
                  ? 'bg-editor-accent text-white'
                  : 'bg-editor-surface text-editor-text-muted hover:text-editor-text'
              }`}
            >
              <div className="font-medium">{p.label}</div>
              <div className="opacity-70">{p.seconds}</div>
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || segments.length === 0}
          className="w-full flex items-center justify-center gap-2 py-2 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-40 rounded text-xs text-white font-medium transition-colors"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Analysing sermon...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              Find Clips
            </>
          )}
        </button>

        {error && (
          <p className="mt-2 text-xs text-editor-danger">{error}</p>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {suggestions.length === 0 && !isGenerating && (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <p className="text-xs text-editor-text-muted">
              Select a platform and click Find Clips to get AI-suggested sermon moments.
            </p>
          </div>
        )}

        {suggestions.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            onGoTo={handleGoTo}
            onApply={handleApply}
          />
        ))}
      </div>
    </div>
  );
}

function ClipCard({
  clip,
  onGoTo,
  onApply,
}: {
  clip: SermonClipSuggestion;
  onGoTo: (c: SermonClipSuggestion) => void;
  onApply: (c: SermonClipSuggestion) => void;
}) {
  const scorePct = Math.round(clip.score * 100);

  return (
    <div className="px-4 py-3 border-b border-editor-border hover:bg-editor-surface/50 transition-colors">
      {/* Title + score */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-xs font-medium text-editor-text leading-snug">{clip.title}</p>
        <span className="text-[10px] text-editor-text-muted shrink-0">{scorePct}%</span>
      </div>

      {/* Score bar */}
      <div className="h-0.5 bg-editor-border rounded-full mb-2">
        <div
          className="h-full bg-editor-accent rounded-full"
          style={{ width: `${scorePct}%` }}
        />
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mb-2">
        <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-editor-surface text-editor-text-muted border border-editor-border">
          <Clock className="w-2.5 h-2.5" />
          {formatTime(clip.startTime)}–{formatTime(clip.endTime)} ({clip.duration}s)
        </span>
        {clip.hasScripture && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-editor-accent/15 text-editor-accent border border-editor-accent/30">
            <BookOpen className="w-2.5 h-2.5" />
            Scripture
          </span>
        )}
        {clip.hasAltarCall && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-editor-success/15 text-editor-success border border-editor-success/30">
            <Heart className="w-2.5 h-2.5" />
            Altar call
          </span>
        )}
      </div>

      {/* Rationale */}
      <p className="text-[11px] text-editor-text-muted mb-2 leading-snug">{clip.rationale}</p>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onGoTo(clip)}
          className="flex-1 flex items-center justify-center gap-1 py-1 text-[11px] text-editor-text-muted hover:text-editor-text bg-editor-surface hover:bg-editor-border rounded transition-colors"
        >
          <ChevronRight className="w-3 h-3" />
          Go to
        </button>
        <button
          onClick={() => onApply(clip)}
          className="flex-1 py-1 text-[11px] bg-editor-accent/20 hover:bg-editor-accent/30 text-editor-accent rounded transition-colors font-medium"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
