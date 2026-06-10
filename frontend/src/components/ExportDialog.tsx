import { useState, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useOverlayStore } from '../store/overlayStore';
import { Download, Loader2, Zap, Cog, Info, Layers } from 'lucide-react';
import type { ExportOptions } from '../types/project';

const IS_ELECTRON = !!window.electronAPI;

export default function ExportDialog() {
  const { videoPath, videoUrl, words, deletedRanges, isExporting, exportProgress, backendUrl, setExporting, getKeepSegments } =
    useEditorStore();

  // For Azure VI videos, videoPath is the title string, not a file path.
  // Use the actual stream URL as FFmpeg input in that case.
  const isLocalFile = !!videoPath && (videoPath.startsWith('/') || /^[A-Z]:\\/i.test(videoPath));
  const inputPath = isLocalFile ? videoPath : (videoUrl ?? videoPath);
  const overlayLayers = useOverlayStore((s) => s.layers);

  const hasCuts = deletedRanges.length > 0;
  const hasOverlays = overlayLayers.length > 0;

  const [options, setOptions] = useState<Omit<ExportOptions, 'outputPath'>>({
    mode: 'fast',
    resolution: '1080p',
    format: 'mp4',
    enhanceAudio: false,
    captions: 'none',
  });
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);

  // Overlays require re-encode; enforce it visually
  const effectiveMode = hasOverlays ? 'reencode' : options.mode;

  const handleExport = useCallback(async () => {
    if (!videoPath) return;
    setExportError(null);
    setExportDone(false);

    let outputPath: string | null = null;

    // Electron: prompt user for save path
    if (IS_ELECTRON) {
      outputPath = await window.electronAPI!.saveFile({
        defaultPath: videoPath.replace(/\.[^.]+$/, '_edited.' + options.format),
        filters: [
          { name: 'MP4', extensions: ['mp4'] },
          { name: 'MOV', extensions: ['mov'] },
          { name: 'WebM', extensions: ['webm'] },
        ],
      });
      if (!outputPath) return; // user cancelled
    }
    // Web: output_path omitted → backend creates temp file

    setExporting(true, 0);
    try {
      const keepSegments = getKeepSegments();

      const deletedSet = new Set<number>();
      for (const range of deletedRanges) {
        for (const idx of range.wordIndices) deletedSet.add(idx);
      }

      const body: Record<string, unknown> = {
        input_path: inputPath,
        keep_segments: keepSegments,
        words: options.captions !== 'none' ? words : undefined,
        deleted_indices: options.captions !== 'none' ? [...deletedSet] : undefined,
        mode: effectiveMode,
        resolution: options.resolution,
        format: options.format,
        enhanceAudio: options.enhanceAudio,
        captions: options.captions,
        overlays: hasOverlays ? overlayLayers : undefined,
      };
      if (outputPath) body.output_path = outputPath;

      const res = await fetch(`${backendUrl}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || res.statusText);
      }

      const data = await res.json();
      setExporting(false, 100);
      setExportDone(true);

      // Web mode: trigger browser download from the temp output path
      if (!IS_ELECTRON && data.output_path) {
        const basename = data.output_path.split(/[\\/]/).pop() || 'sermon_clip.' + options.format;
        const dlUrl = `${backendUrl}/export/download?path=${encodeURIComponent(data.output_path)}&filename=${encodeURIComponent(basename)}`;
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = basename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      setExportError(err.message || 'Export failed.');
      setExporting(false);
    }
  }, [
    videoPath, options, effectiveMode, overlayLayers, hasOverlays,
    backendUrl, setExporting, getKeepSegments, deletedRanges, words,
  ]);

  return (
    <div className="p-4 space-y-5">
      <h3 className="text-sm font-semibold">Export Video</h3>

      {/* Overlay badge */}
      {hasOverlays && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-editor-accent/10 border border-editor-accent/30 text-xs text-editor-accent">
          <Layers className="w-3.5 h-3.5 shrink-0" />
          <span>{overlayLayers.length} overlay layer{overlayLayers.length !== 1 ? 's' : ''} will be composited</span>
        </div>
      )}

      {/* Mode */}
      <fieldset className="space-y-2">
        <legend className="text-xs text-editor-text-muted font-medium">Export Mode</legend>
        <div className="grid grid-cols-2 gap-2">
          <ModeCard
            active={effectiveMode === 'fast'}
            onClick={() => !hasOverlays && setOptions((o) => ({ ...o, mode: 'fast' }))}
            disabled={hasOverlays}
            icon={<Zap className="w-4 h-4" />}
            title="Fast"
            desc="Stream copy, seconds"
          />
          <ModeCard
            active={effectiveMode === 'reencode'}
            onClick={() => setOptions((o) => ({ ...o, mode: 'reencode' }))}
            icon={<Cog className="w-4 h-4" />}
            title="Re-encode"
            desc="Custom quality, slower"
          />
        </div>
      </fieldset>

      {/* Resolution */}
      <SelectField
        label="Resolution"
        value={options.resolution}
        onChange={(v) => setOptions((o) => ({ ...o, resolution: v as ExportOptions['resolution'] }))}
        options={[
          { value: '720p', label: '720p (HD)' },
          { value: '1080p', label: '1080p (Full HD)' },
          { value: '4k', label: '4K (Ultra HD)' },
        ]}
      />

      {/* Format */}
      <SelectField
        label="Format"
        value={options.format}
        onChange={(v) => setOptions((o) => ({ ...o, format: v as ExportOptions['format'] }))}
        options={[
          { value: 'mp4', label: 'MP4 (H.264)' },
          { value: 'mov', label: 'MOV (QuickTime)' },
          { value: 'webm', label: 'WebM (VP9)' },
        ]}
      />

      {/* Audio enhancement */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={options.enhanceAudio}
          onChange={(e) => setOptions((o) => ({ ...o, enhanceAudio: e.target.checked }))}
          className="w-4 h-4 rounded bg-editor-surface border-editor-border accent-editor-accent"
        />
        <span className="text-xs">Enhance audio (Studio Sound)</span>
      </label>

      {/* Captions */}
      <SelectField
        label="Captions"
        value={options.captions}
        onChange={(v) => setOptions((o) => ({ ...o, captions: v as ExportOptions['captions'] }))}
        options={[
          { value: 'none', label: 'No captions' },
          { value: 'burn-in', label: 'Burn-in (permanent)' },
          { value: 'sidecar', label: 'Sidecar SRT file' },
        ]}
      />

      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={isExporting || !videoPath}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors text-white"
      >
        {isExporting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Exporting…
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            {IS_ELECTRON ? 'Export…' : 'Export & Download'}
          </>
        )}
      </button>

      {/* Feedback */}
      {exportDone && !isExporting && (
        <p className="text-xs text-editor-success text-center">Export complete!</p>
      )}
      {exportError && (
        <p className="text-xs text-editor-danger text-center">{exportError}</p>
      )}

      {/* Info hints */}
      {effectiveMode === 'fast' && !hasCuts && !hasOverlays && (
        <p className="text-[10px] text-editor-text-muted text-center">
          Fast mode uses stream copy — no quality loss, exports in seconds.
        </p>
      )}
      {effectiveMode === 'fast' && hasCuts && (
        <div className="flex items-start gap-1.5 p-2 bg-editor-accent/10 rounded text-[10px] text-editor-accent">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Word-level cuts use re-encode mode automatically for frame-accurate output.
          </span>
        </div>
      )}
      {hasOverlays && (
        <div className="flex items-start gap-1.5 p-2 bg-editor-accent/10 rounded text-[10px] text-editor-accent">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Overlay layers require re-encode. Fast mode is disabled.</span>
        </div>
      )}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  disabled,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors ${
        active
          ? 'border-editor-accent bg-editor-accent/10'
          : 'border-editor-border hover:border-editor-text-muted'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {icon}
      <span className="text-xs font-medium">{title}</span>
      <span className="text-[10px] text-editor-text-muted">{desc}</span>
    </button>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-editor-text-muted font-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-editor-surface border border-editor-border rounded-lg text-xs text-editor-text focus:outline-none focus:border-editor-accent"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
