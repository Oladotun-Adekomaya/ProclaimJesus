import { useState } from 'react';
import { Link, Loader2, Radio } from 'lucide-react';

interface Props {
  onSubmit: (url: string) => void;
  isSubmitting: boolean;
  error: string | null;
}

export default function URLInput({ onSubmit, isSubmitting, error }: Props) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center gap-8 bg-editor-bg px-6">
      <div className="flex flex-col items-center gap-3">
        <Radio className="w-14 h-14 text-editor-accent opacity-80" />
        <h1 className="text-3xl font-semibold tracking-tight">ProclaimJesus</h1>
        <p className="text-editor-text-muted text-sm max-w-sm text-center">
          Paste a sermon URL to generate a transcript, speaker breakdown, and AI-suggested clips.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-3">
        <div className="relative">
          <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-editor-text-muted pointer-events-none" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=... or direct .mp4 link"
            className="w-full pl-9 pr-3 py-3 bg-editor-surface border border-editor-border rounded-lg text-sm text-editor-text placeholder:text-editor-text-muted/40 focus:outline-none focus:border-editor-accent"
            autoFocus
            disabled={isSubmitting}
          />
        </div>

        {error && (
          <p className="text-xs text-editor-danger px-1">{error}</p>
        )}

        <button
          type="submit"
          disabled={!url.trim() || isSubmitting}
          className="w-full flex items-center justify-center gap-2 py-3 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-40 rounded-lg text-sm text-white font-medium transition-colors"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            'Transcribe Sermon'
          )}
        </button>

        <p className="text-[11px] text-editor-text-muted text-center">
          Supports YouTube · Facebook · Vimeo · direct MP4 links
        </p>
      </form>
    </div>
  );
}
