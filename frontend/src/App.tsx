import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from './store/editorStore';
import { useIndexingStore } from './store/indexingStore';
import { useClipStore } from './store/clipStore';
import { useOverlayStore } from './store/overlayStore';
import VideoPlayer from './components/VideoPlayer';
import TranscriptEditor from './components/TranscriptEditor';
import WaveformTimeline from './components/WaveformTimeline';
import AIPanel from './components/AIPanel';
import ExportDialog from './components/ExportDialog';
import SettingsPanel from './components/SettingsPanel';
import URLInput from './components/URLInput';
import IndexingProgress from './components/IndexingProgress';
import ThemeTags from './components/ThemeTags';
import ClipSuggestions from './components/ClipSuggestions';
import ClipPreview from './components/ClipPreview';
import OverlayEditor from './components/OverlayEditor';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Radio, FolderOpen, Settings, Sparkles, Download, Scissors, Eye, Layers, Save, Loader2 } from 'lucide-react';
import type { ProjectFile } from './types/project';

const IS_ELECTRON = !!window.electronAPI;

type Panel = 'clips' | 'ai' | 'preview' | 'overlay' | 'settings' | 'export' | null;

export default function App() {
  const {
    videoPath,
    videoUrl,
    words,
    segments,
    deletedRanges,
    language,
    speakers,
    topics,
    keywords,
    isTranscribing,
    setBackendUrl,
    setTranscription,
    setTranscribing,
    setVideoSource,
    setVideoUrl,
    loadVideo,
    loadProject: loadProjectToStore,
    backendUrl,
    reset: resetEditor,
  } = useEditorStore();

  const {
    phase,
    videoId,
    title,
    sourceUrl,
    errorMessage,
    setPhase,
    setVideoId,
    setTitle,
    setSourceUrl,
    setError,
    reset: resetIndexing,
  } = useIndexingStore();

  const { suggestions: clipSuggestions, setSuggestions, reset: resetClips } = useClipStore();
  const { layers: overlayLayers, addLayer, reset: resetOverlays } = useOverlayStore();

  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLocalFile =
    !!videoPath && (videoPath.startsWith('/') || /^[A-Z]:\\/i.test(videoPath));

  // ── Save project ────────────────────────────────────────────────────────────

  const handleSaveProject = useCallback(async () => {
    if (!videoPath || words.length === 0) return;

    const projectData: ProjectFile = {
      version: 2,
      savedAt: new Date().toISOString(),
      title: videoPath.split(/[\\/]/).pop() || videoPath,
      videoPath,
      videoUrl: videoUrl ?? null,
      videoId: videoId ?? null,
      sourceUrl,
      words,
      segments,
      deletedRanges,
      language,
      speakers,
      topics,
      keywords,
      clipSuggestions,
      overlayLayers,
    };

    const json = JSON.stringify(projectData, null, 2);
    const defaultName = `${projectData.title.replace(/\.[^.]+$/, '')}.pj`;

    try {
      if (IS_ELECTRON) {
        const savePath = await window.electronAPI!.saveProject(defaultName);
        if (savePath) await window.electronAPI!.writeFile(savePath, json);
      } else {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to save project:', err);
    }
  }, [
    videoPath, videoUrl, videoId, sourceUrl,
    words, segments, deletedRanges, language, speakers, topics, keywords,
    clipSuggestions, overlayLayers,
  ]);

  // ── Load project ────────────────────────────────────────────────────────────

  const restoreProject = useCallback(
    async (data: ProjectFile) => {
      resetEditor();
      resetIndexing();
      resetClips();
      resetOverlays();
      setSubmitError(null);
      setActivePanel(null);

      // Restore transcript + video source
      loadProjectToStore(data);

      // Restore indexing store so the app knows we're in 'done' state
      setPhase('done');
      setSourceUrl(data.sourceUrl || '');
      setTitle(data.title || '');
      if (data.videoId) setVideoId(data.videoId);

      // Restore clips
      if (data.clipSuggestions?.length) setSuggestions(data.clipSuggestions);

      // Restore overlay layers
      for (const layer of data.overlayLayers ?? []) {
        const { id: _id, ...rest } = layer;
        addLayer(rest);
      }

      // Try to refresh Azure VI stream URL if stored one may be expired
      if (data.videoId && !data.videoPath?.startsWith('/') && !/^[A-Z]:\\/i.test(data.videoPath ?? '')) {
        try {
          const res = await fetch(`${backendUrl}/transcribe/azure/${data.videoId}/stream-url`);
          if (res.ok) {
            const { videoStreamUrl } = await res.json();
            if (videoStreamUrl) setVideoUrl(videoStreamUrl);
          }
        } catch {
          // Non-fatal — stored URL may still work for a while
        }
      }
    },
    [
      resetEditor, resetIndexing, resetClips, resetOverlays,
      loadProjectToStore, setPhase, setSourceUrl, setTitle, setVideoId,
      setSuggestions, addLayer, setVideoUrl, backendUrl,
    ],
  );

  const handleLoadProjectElectron = useCallback(async () => {
    if (!IS_ELECTRON) return;
    try {
      const filePath = await window.electronAPI!.openProject();
      if (!filePath) return;
      const content = await window.electronAPI!.readFile(filePath);
      const data = JSON.parse(content) as ProjectFile;
      await restoreProject(data);
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  }, [restoreProject]);

  const handleLoadProjectWeb = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string) as ProjectFile;
          await restoreProject(data);
        } catch (err) {
          console.error('Failed to parse project file:', err);
        }
      };
      reader.readAsText(file);
      // Reset so the same file can be re-loaded
      e.target.value = '';
    },
    [restoreProject],
  );

  const triggerLoadProject = useCallback(() => {
    if (IS_ELECTRON) {
      handleLoadProjectElectron();
    } else {
      fileInputRef.current?.click();
    }
  }, [handleLoadProjectElectron]);

  useKeyboardShortcuts({ onSave: handleSaveProject });

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
        setVideoSource('', data.title || 'Sermon');
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

  // ── Local file (Electron only) ──────────────────────────────────────────────

  const handleLocalFile = useCallback(
    (filePath: string) => {
      resetIndexing();
      setSubmitError(null);
      loadVideo(filePath);
    },
    [loadVideo, resetIndexing],
  );

  // ── Reset back to URL input ─────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    resetEditor();
    resetIndexing();
    resetClips();
    resetOverlays();
    setSubmitError(null);
    setActivePanel(null);
  }, [resetEditor, resetIndexing, resetClips, resetOverlays]);

  // ── Local file transcription (Electron only) ───────────────────────────────

  const handleLocalFileTranscribe = useCallback(async () => {
    if (!videoPath) return;
    const name = videoPath.split(/[\\/]/).pop() || 'Sermon';
    setPhase('submitting');
    setTitle(name);
    setSourceUrl('');
    try {
      const res = await fetch(`${backendUrl}/transcribe/azure/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: videoPath }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || res.statusText);
      }
      const data = await res.json();
      setVideoId(data.videoId);
      setTitle(data.title || name);
      setPhase('indexing');
    } catch (err: any) {
      setError(err.message || 'Failed to submit file for transcription.');
      setPhase('idle');
    }
  }, [videoPath, backendUrl, setPhase, setTitle, setSourceUrl, setVideoId, setError]);

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
      <>
        {/* Hidden file input for web project load */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pj"
          className="hidden"
          onChange={handleLoadProjectWeb}
        />
        <URLInput
          onSubmit={handleUrlSubmit}
          onLocalFile={handleLocalFile}
          onLoadProject={triggerLoadProject}
          isSubmitting={phase === 'submitting'}
          error={submitError || (phase === 'error' ? errorMessage : null)}
        />
      </>
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
    <>
      {/* Hidden file input for web project load (accessible from toolbar) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pj"
        className="hidden"
        onChange={handleLoadProjectWeb}
      />

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
              icon={<Save className="w-4 h-4" />}
              label="Save"
              onClick={handleSaveProject}
              disabled={words.length === 0}
              title="Save project (Ctrl+S)"
            />
            <ToolbarButton
              icon={<Scissors className="w-4 h-4" />}
              label="Clips"
              active={activePanel === 'clips'}
              onClick={() => togglePanel('clips')}
              disabled={words.length === 0}
            />
            <ToolbarButton
              icon={<Eye className="w-4 h-4" />}
              label="Preview"
              active={activePanel === 'preview'}
              onClick={() => togglePanel('preview')}
              disabled={words.length === 0}
            />
            <ToolbarButton
              icon={<Layers className="w-4 h-4" />}
              label="Overlays"
              active={activePanel === 'overlay'}
              onClick={() => togglePanel('overlay')}
              disabled={words.length === 0}
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
                  <>
                    <ThemeTags />
                    <TranscriptEditor />
                  </>
                ) : isLocalFile ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
                    <p className="text-editor-text-muted text-sm text-center">
                      Video loaded. Ready to transcribe.
                    </p>
                    <button
                      onClick={handleLocalFileTranscribe}
                      disabled={phase === 'submitting'}
                      className="flex items-center gap-2 px-4 py-2.5 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {phase === 'submitting' ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                      ) : (
                        <><Sparkles className="w-4 h-4" /> Transcribe with Azure AI</>
                      )}
                    </button>
                    {phase === 'error' && errorMessage && (
                      <p className="text-xs text-editor-danger text-center max-w-[220px]">{errorMessage}</p>
                    )}
                    <p className="text-[11px] text-editor-text-muted text-center max-w-[200px]">
                      Uploads to Azure AI · ~2–5 min per hour of video
                    </p>
                  </div>
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
              {activePanel === 'clips' && <ClipSuggestions />}
              {activePanel === 'preview' && <ClipPreview onExport={() => setActivePanel('export')} />}
              {activePanel === 'overlay' && <OverlayEditor />}
              {activePanel === 'ai' && <AIPanel />}
              {activePanel === 'export' && <ExportDialog />}
              {activePanel === 'settings' && <SettingsPanel />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ToolbarButton({
  icon,
  label,
  active,
  onClick,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
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
