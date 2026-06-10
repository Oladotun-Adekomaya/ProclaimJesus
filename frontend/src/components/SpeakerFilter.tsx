import type { Speaker } from '../types/project';

// Consistent color per speaker slot (cycles if > 6 speakers)
const SPEAKER_COLORS = [
  'bg-editor-accent/20 text-editor-accent border-editor-accent/40',
  'bg-editor-success/20 text-editor-success border-editor-success/40',
  'bg-editor-warning/20 text-editor-warning border-editor-warning/40',
  'bg-editor-danger/20 text-editor-danger border-editor-danger/40',
  'bg-purple-500/20 text-purple-400 border-purple-500/40',
  'bg-pink-500/20 text-pink-400 border-pink-500/40',
];

const SPEAKER_COLORS_MUTED = [
  'bg-editor-surface text-editor-text-muted/40 border-editor-border line-through',
  'bg-editor-surface text-editor-text-muted/40 border-editor-border line-through',
  'bg-editor-surface text-editor-text-muted/40 border-editor-border line-through',
  'bg-editor-surface text-editor-text-muted/40 border-editor-border line-through',
  'bg-editor-surface text-editor-text-muted/40 border-editor-border line-through',
  'bg-editor-surface text-editor-text-muted/40 border-editor-border line-through',
];

interface Props {
  speakers: Speaker[];
  hiddenIds: Set<number>;
  onToggle: (id: number) => void;
}

export default function SpeakerFilter({ speakers, hiddenIds, onToggle }: Props) {
  if (speakers.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-[10px] text-editor-text-muted uppercase tracking-wider shrink-0">
        Speakers
      </span>
      {speakers.map((s, i) => {
        const hidden = hiddenIds.has(s.id);
        const colors = hidden
          ? SPEAKER_COLORS_MUTED[i % SPEAKER_COLORS_MUTED.length]
          : SPEAKER_COLORS[i % SPEAKER_COLORS.length];
        return (
          <button
            key={s.id}
            onClick={() => onToggle(s.id)}
            title={hidden ? `Show ${s.name}` : `Hide ${s.name}`}
            className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${colors}`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
