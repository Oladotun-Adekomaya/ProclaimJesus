import { useMemo, useCallback } from 'react';
import { Play, Clock, AlignLeft, Download } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { useClipStore } from '../store/clipStore';

interface Props {
  onExport: () => void;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function ClipPreview({ onExport }: Props) {
  const words = useEditorStore((s) => s.words);
  const segments = useEditorStore((s) => s.segments);
  const deletedRanges = useEditorStore((s) => s.deletedRanges);
  const getKeepSegments = useEditorStore((s) => s.getKeepSegments);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const lastClip = useClipStore((s) => s.suggestions[0] ?? null);

  // Build a fast lookup: word global index → deleted?
  const deletedSet = useMemo(() => {
    const s = new Set<number>();
    for (const r of deletedRanges) for (const i of r.wordIndices) s.add(i);
    return s;
  }, [deletedRanges]);

  // Compute clip bounds from keep segments
  const keepSegments = useMemo(() => getKeepSegments(), [getKeepSegments, deletedRanges]);
  const clipStart = keepSegments[0]?.start ?? 0;
  const clipEnd = keepSegments[keepSegments.length - 1]?.end ?? 0;
  const clipDuration = Math.round(clipEnd - clipStart);
  const keptWordCount = useMemo(
    () => words.filter((_, i) => !deletedSet.has(i)).length,
    [words, deletedSet],
  );

  // Build clean segment list (only segments with ≥1 kept word)
  const cleanSegments = useMemo(() => {
    return segments
      .map((seg) => {
        const keptWords = seg.words.filter((_, localIdx) => {
          const globalIdx = (seg.globalStartIndex ?? 0) + localIdx;
          return !deletedSet.has(globalIdx);
        });
        return { ...seg, keptWords };
      })
      .filter((seg) => seg.keptWords.length > 0);
  }, [segments, deletedSet]);

  const handlePlayFromStart = useCallback(() => {
    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (video) {
      video.currentTime = clipStart;
      video.play().catch(() => {});
    }
    setCurrentTime(clipStart);
  }, [clipStart, setCurrentTime]);

  if (deletedRanges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 px-4 text-center">
        <AlignLeft className="w-6 h-6 text-editor-text-muted/40 mb-2" />
        <p className="text-xs text-editor-text-muted">
          Apply a clip from the Clips panel to preview it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Stats header */}
      <div className="px-4 py-3 border-b border-editor-border space-y-3 shrink-0">
        {lastClip && (
          <p className="text-xs font-medium text-editor-text truncate">{lastClip.title}</p>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Start" value={fmt(clipStart)} />
          <Stat label="End" value={fmt(clipEnd)} />
          <Stat label="Duration" value={`${clipDuration}s`} />
        </div>

        <div className="flex items-center gap-1 text-[11px] text-editor-text-muted">
          <Clock className="w-3 h-3" />
          <span>{keptWordCount} words kept</span>
          {lastClip && (
            <span className="ml-auto px-1.5 py-0.5 rounded bg-editor-surface border border-editor-border capitalize">
              {lastClip.platform}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handlePlayFromStart}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs bg-editor-surface hover:bg-editor-border rounded transition-colors text-editor-text"
          >
            <Play className="w-3.5 h-3.5" />
            Play from start
          </button>
          <button
            onClick={onExport}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs bg-editor-accent hover:bg-editor-accent-hover rounded transition-colors text-white font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Clean transcript text */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <p className="text-[10px] text-editor-text-muted uppercase tracking-wider">
          Clean transcript
        </p>
        {cleanSegments.map((seg, i) => (
          <div key={i}>
            {seg.speaker && (
              <p className="text-[10px] text-editor-accent font-medium mb-0.5">{seg.speaker}</p>
            )}
            <p className="text-sm text-editor-text leading-relaxed">
              {seg.keptWords.map((w) => w.word).join(' ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center py-1.5 bg-editor-surface rounded border border-editor-border">
      <span className="text-[10px] text-editor-text-muted">{label}</span>
      <span className="text-xs font-medium text-editor-text">{value}</span>
    </div>
  );
}
