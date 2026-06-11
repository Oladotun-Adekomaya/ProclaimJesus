import { useState } from 'react';
import { Link, Loader2, Radio, FolderOpen, AlertCircle, FolderArchive } from 'lucide-react';

const IS_ELECTRON = !!window.electronAPI;
const YOUTUBE_RE = /youtube\.com|youtu\.be/i;

interface Props {
  onSubmit: (url: string) => void;
  onLocalFile?: (path: string) => void;
  onLoadProject?: () => void;
  isSubmitting: boolean;
  error: string | null;
}

export default function URLInput({ onSubmit, onLocalFile, onLoadProject, isSubmitting, error }: Props) {
  const [url, setUrl] = useState('');

  const isYouTubeUrl = YOUTUBE_RE.test(url.trim());
  const showYouTubeWarning = !IS_ELECTRON && isYouTubeUrl && url.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed && !showYouTubeWarning) onSubmit(trimmed);
  };

  const handleOpenFile = async () => {
    if (!window.electronAPI) return;
    const filePath = await window.electronAPI.openFile({
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'] }],
    });
    if (filePath && onLocalFile) onLocalFile(filePath);
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

        {showYouTubeWarning && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300 leading-relaxed">
              YouTube requires the <strong>ProclaimJesus desktop app</strong> — it uses your
              browser's YouTube login to fetch the video. Paste a direct <code>.mp4</code> link
              to use the web app, or{' '}
              <a
                href="https://github.com/proclaim-jesus/app/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                download the desktop app
              </a>
              .
            </p>
          </div>
        )}

        {error && !showYouTubeWarning && (
          <p className="text-xs text-editor-danger px-1">{error}</p>
        )}

        <button
          type="submit"
          disabled={!url.trim() || isSubmitting || showYouTubeWarning}
          className="w-full flex items-center justify-center gap-2 py-3 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-40 rounded-lg text-sm text-white font-medium transition-colors"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting…
            </>
          ) : (
            'Transcribe Sermon'
          )}
        </button>

        {IS_ELECTRON && (
          <>
            <div className="flex items-center gap-3 py-1">
              <hr className="flex-1 border-editor-border" />
              <span className="text-[11px] text-editor-text-muted">or</span>
              <hr className="flex-1 border-editor-border" />
            </div>
            <button
              type="button"
              onClick={handleOpenFile}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 bg-editor-surface hover:bg-editor-border disabled:opacity-40 rounded-lg text-sm text-editor-text font-medium transition-colors border border-editor-border"
            >
              <FolderOpen className="w-4 h-4" />
              Open Local Video File
            </button>
          </>
        )}

        <p className="text-[11px] text-editor-text-muted text-center">
          {IS_ELECTRON
            ? 'Supports YouTube · Facebook · Vimeo · direct MP4 links'
            : 'Supports Facebook · Vimeo · direct MP4 links · YouTube requires desktop app'}
        </p>

        {onLoadProject && (
          <>
            <div className="flex items-center gap-3 py-1">
              <hr className="flex-1 border-editor-border" />
              <span className="text-[11px] text-editor-text-muted">or</span>
              <hr className="flex-1 border-editor-border" />
            </div>
            <button
              type="button"
              onClick={onLoadProject}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 bg-editor-surface hover:bg-editor-border disabled:opacity-40 rounded-lg text-sm text-editor-text font-medium transition-colors border border-editor-border"
            >
              <FolderArchive className="w-4 h-4" />
              Load Saved Project (.pj)
            </button>
          </>
        )}
      </form>
    </div>
  );
}
