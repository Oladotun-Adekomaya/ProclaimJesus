import { useCallback, useEffect, useState } from 'react';
import { useEditorStore } from './store/editorStore';
import { useIndexingStore } from './store/indexingStore';
import VideoPlayer from './components/VideoPlayer';
import TranscriptEditor from './components/TranscriptEditor';
import WaveformTimeline from './components/WaveformTimeline';
import AIPanel from './components/AIPanel';
import ExportDialog from './components/ExportDialog';
import SettingsPanel from './components/SettingsPanel';
import URLInput from './components/URLInput';
import IndexingProgress from './components/IndexingProgress';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Radio, FolderOpen, Settings, Sparkles, Download } from 'lucide-react';

const IS_ELECTRON = !!window.electronAPI;

type Panel = 'ai' | 'settings' | 'export' | null;

export default function App() {
  const {
    videoPath,
    words,
    isTranscribing,
    setBackendUrl,
    setTranscription,
    setTranscribing,
    setVideoSource,
    backendUrl,
    reset: resetEditor,
  } = useEditorStore();

  const {
    phase,
    videoId,
    title,
    errorMessage,
    setPhase,
    setVideoId,
    setTitle,
    setSourceUrl,
    setError,
    reset: resetIndexing,
  } = useIndexingStore();

  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useKeyboardShortcuts();

  useEffect(() => {
    if (IS_ELECTRON) {
      window.electronAPI!.getBackendUrl().then(setBackendUrl);
    }
  }, [setBackendUrl]);

  // ── URL submission ──────────────────────────────────────────────────────────

  const handleUrlSubmit = useCallback(
    async (url: string) => {
      setSubmitError(null);
      setPhase('submitting');
      setSourceUrl(url);

      try {
        const res = await fetch(`${backendUrl}/transcribe/azure/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail || res.statusText);
        }

        const data = await res.json();
        setVideoId(data.videoId);
        setTitle(data.title || 'Sermon');
        setVideoSource('', data.title || 'Sermon');  // set title in editor now
        setPhase('indexing');
      } catch (err: any) {
        setSubmitError(err.message || 'Submission failed. Check the URL and try again.');
        setPhase('idle');
      }
    },
    [backendUrl, setPhase, setSourceUrl, setVideoId, setTitle, setVideoSource],
  );

  // ── Result fetch (called by IndexingProgress when status → Processed) ──────

  const handleIndexingDone = useCallback(async () => {
    if (!videoId) return;
    setTranscribing(true, 95);
    try {
      const res = await fetch(`${backendUrl}/transcribe/azure/${videoId}/result`);
      if (!res.ok) throw new Error(`Failed to fetch transcript: ${res.statusText}`);
      const data = await res.json();
      setTranscription(data);
      setPhase('done');
    } catch (err: any) {
      setError(err.message || 'Failed to load transcript.');
    } finally {
      setTranscribing(false);
    }
  }, [videoId, backendUrl, setTranscription, setTranscribing, setPhase, setError]);

  const handleIndexingError = useCallback(
    (msg: string) => setError(msg),
    [setError],
  );

  // ── Reset back to URL input ─────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    resetEditor();
    resetIndexing();
    setSubmitError(null);
    setActivePanel(null);
  }, [resetEditor, resetIndexing]);

  const togglePanel = (panel: Panel) =>
    setActivePanel((prev) => (prev === panel ? null : panel));

  // ── Render: loading state after indexing done but before words arrive ───────
  if (isTranscribing) {
    return (
      <div className="h-screen flex items-center justify-center bg-editor-bg">
        <p className="text-sm text-editor-text-muted animate-pulse">Loading transcript...</p>
      </div>
    );
  }

  // ── Render: URL input landing ───────────────────────────────────────────────
  if (!videoPath && phase !== 'indexing') {
    return (
      <URLInput
        onSubmit={handleUrlSubmit}
        isSubmitting={phase === 'submitting'}
        error={submitError || (phase === 'error' ? errorMessage : null)}
      />
    );
  }

  // ── Render: Azure indexing progress ────────────────────────────────────────
  if (phase === 'indexing' && videoId) {
    return (
      <IndexingProgress
        videoId={videoId}
        title={title}
        backendUrl={backendUrl}
        onDone={handleIndexingDone}
        onError={handleIndexingError}
      />
    );
  }

  // ── Render: main editor ─────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-editor-bg overflow-hidden">
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-editor-border shrink-0">
        <div className="flex items-center gap-3">
          <Radio className="w-5 h-5 text-editor-accent" />
          <span className="text-sm font-medium truncate max-w-[300px]">
            {videoPath?.split(/[\\/]/).pop()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={<FolderOpen className="w-4 h-4" />}
            label="New"
            onClick={handleReset}
          />
          <ToolbarButton
            icon={<Sparkles className="w-4 h-4" />}
            label="AI"
            active={activePanel === 'ai'}
            onClick={() => togglePanel('ai')}
            disabled={words.length === 0}
          />
          <ToolbarButton
            icon={<Download className="w-4 h-4" />}
            label="Export"
            active={activePanel === 'export'}
            onClick={() => togglePanel('export')}
            disabled={words.length === 0}
          />
          <ToolbarButton
            icon={<Settings className="w-4 h-4" />}
            label="Settings"
            active={activePanel === 'settings'}
            onClick={() => togglePanel('settings')}
          />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: video + transcript */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex min-h-0">
            {/* Video player */}
            <div className="w-1/2 p-3 flex items-center justify-center bg-black/20">
              <VideoPlayer />
            </div>

            {/* Transcript */}
            <div className="w-1/2 border-l border-editor-border flex flex-col min-h-0">
              {words.length > 0 ? (
                <TranscriptEditor />
              ) : (
                <div className="flex-1 flex items-center justify-center text-editor-text-muted text-sm">
                  No transcript yet
                </div>
              )}
            </div>
          </div>

          {/* Waveform timeline */}
          <div className="h-32 border-t border-editor-border shrink-0">
            <WaveformTimeline />
          </div>
        </div>

        {/* Right panel */}
        {activePanel && (
          <div className="w-80 border-l border-editor-border overflow-y-auto shrink-0">
            {activePanel === 'ai' && <AIPanel />}
            {activePanel === 'export' && <ExportDialog />}
            {activePanel === 'settings' && <SettingsPanel />}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? 'bg-editor-accent text-white'
          : 'text-editor-text-muted hover:text-editor-text hover:bg-editor-surface'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {icon}
      {label}
    </button>
  );
}
