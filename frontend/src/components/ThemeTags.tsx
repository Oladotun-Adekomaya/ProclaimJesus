import { useEditorStore } from '../store/editorStore';
import { Tag } from 'lucide-react';

export default function ThemeTags() {
  const topics = useEditorStore((s) => s.topics);
  const keywords = useEditorStore((s) => s.keywords);

  if (topics.length === 0 && keywords.length === 0) return null;

  return (
    <div className="px-4 py-2 border-b border-editor-border shrink-0 space-y-1.5">
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <Tag className="w-3 h-3 text-editor-accent shrink-0" />
          {topics.map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 text-[11px] rounded-full bg-editor-accent/15 text-editor-accent border border-editor-accent/30"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <Tag className="w-3 h-3 text-editor-text-muted shrink-0" />
          {keywords.slice(0, 12).map((k) => (
            <span
              key={k}
              className="px-2 py-0.5 text-[11px] rounded-full bg-editor-surface text-editor-text-muted border border-editor-border"
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
