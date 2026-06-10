import { useRef, useState, useCallback, useEffect } from 'react';
import { Type, Image, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import { useOverlayStore } from '../store/overlayStore';
import { useEditorStore } from '../store/editorStore';
import type { OverlayLayer } from '../types/project';

interface DragState {
  id: string;
  startMouseX: number;
  startMouseY: number;
  origX: number;
  origY: number;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export default function OverlayEditor() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const layers = useOverlayStore((s) => s.layers);
  const addLayer = useOverlayStore((s) => s.addLayer);
  const updateLayer = useOverlayStore((s) => s.updateLayer);
  const removeLayer = useOverlayStore((s) => s.removeLayer);
  const moveLayerUp = useOverlayStore((s) => s.moveLayerUp);
  const moveLayerDown = useOverlayStore((s) => s.moveLayerDown);

  const videoUrl = useEditorStore((s) => s.videoUrl);
  const getKeepSegments = useEditorStore((s) => s.getKeepSegments);
  const keepSegments = getKeepSegments();
  const clipDuration =
    keepSegments.length > 0
      ? Math.round(keepSegments[keepSegments.length - 1].end - keepSegments[0].start)
      : 60;

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleLayerMouseDown = useCallback(
    (e: React.MouseEvent, layer: OverlayLayer) => {
      e.stopPropagation();
      setSelectedId(layer.id);
      dragRef.current = {
        id: layer.id,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        origX: layer.position.x,
        origY: layer.position.y,
      };
    },
    [],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = ((e.clientX - d.startMouseX) / rect.width) * 100;
      const dy = ((e.clientY - d.startMouseY) / rect.height) * 100;
      updateLayer(d.id, {
        position: { x: clamp(d.origX + dx, 0, 95), y: clamp(d.origY + dy, 0, 95) },
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [updateLayer]);

  // ── Add handlers ───────────────────────────────────────────────────────────

  const handleAddText = useCallback(() => {
    const id = addLayer({
      type: 'text',
      content: 'New Text',
      fontSize: 16,
      fontColor: '#ffffff',
      fontFamily: 'sans-serif',
      backgroundColor: 'transparent',
      bold: false,
      startTime: 0,
      endTime: 'end',
      position: { x: 10, y: 10 },
      size: { width: 50, height: 10 },
    });
    setSelectedId(id);
  }, [addLayer]);

  const handleAddImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const id = addLayer({
          type: 'image',
          src: reader.result as string,
          opacity: 1,
          startTime: 0,
          endTime: 'end',
          position: { x: 5, y: 5 },
          size: { width: 25, height: 25 },
        });
        setSelectedId(id);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [addLayer]);

  const selected = layers.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-editor-border flex items-center gap-2 shrink-0">
        <Type className="w-4 h-4 text-editor-accent" />
        <span className="text-sm font-medium">Overlays</span>
      </div>

      {/* Canvas */}
      <div className="px-3 pt-3 shrink-0">
        <div
          ref={canvasRef}
          className="relative w-full bg-black rounded overflow-hidden select-none"
          style={{ aspectRatio: '16/9' }}
          onClick={() => setSelectedId(null)}
        >
          {/* Video frame behind overlays */}
          {videoUrl && (
            <video
              src={videoUrl}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              muted
            />
          )}

          {/* Overlay layers */}
          {layers.map((layer) => (
            <div
              key={layer.id}
              style={{
                position: 'absolute',
                left: `${layer.position.x}%`,
                top: `${layer.position.y}%`,
                width: `${layer.size.width}%`,
                cursor: 'move',
                outline: selectedId === layer.id ? '1.5px solid #6366f1' : 'none',
                outlineOffset: '2px',
              }}
              onMouseDown={(e) => handleLayerMouseDown(e, layer)}
            >
              {layer.type === 'text' ? (
                <span
                  style={{
                    fontSize: `${(layer.fontSize ?? 14) * 0.8}px`,
                    fontFamily: layer.fontFamily ?? 'sans-serif',
                    fontWeight: layer.bold ? 'bold' : 'normal',
                    color: layer.fontColor ?? '#ffffff',
                    background: layer.backgroundColor ?? 'transparent',
                    whiteSpace: 'nowrap',
                    display: 'block',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                    padding: '1px 3px',
                    userSelect: 'none',
                  }}
                >
                  {layer.content || ' '}
                </span>
              ) : (
                <img
                  src={layer.src}
                  alt=""
                  draggable={false}
                  style={{
                    width: '100%',
                    opacity: layer.opacity ?? 1,
                    display: 'block',
                    userSelect: 'none',
                  }}
                />
              )}
            </div>
          ))}

          {/* Empty hint */}
          {layers.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[10px] text-white/40 text-center px-2">
                Add text or image layers below
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add buttons */}
      <div className="flex gap-2 px-3 pt-2 shrink-0">
        <button
          onClick={handleAddText}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-editor-surface hover:bg-editor-border rounded transition-colors text-editor-text"
        >
          <Type className="w-3.5 h-3.5" />
          Add Text
        </button>
        <button
          onClick={handleAddImage}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-editor-surface hover:bg-editor-border rounded transition-colors text-editor-text"
        >
          <Image className="w-3.5 h-3.5" />
          Add Image
        </button>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 space-y-1">
        {layers.length === 0 && (
          <p className="text-[11px] text-editor-text-muted text-center py-4">No layers yet</p>
        )}
        {layers.map((layer, i) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            isFirst={i === 0}
            isLast={i === layers.length - 1}
            isSelected={selectedId === layer.id}
            clipDuration={clipDuration}
            onSelect={() => setSelectedId(layer.id)}
            onRemove={() => { removeLayer(layer.id); if (selectedId === layer.id) setSelectedId(null); }}
            onMoveUp={() => moveLayerUp(layer.id)}
            onMoveDown={() => moveLayerDown(layer.id)}
          />
        ))}
      </div>

      {/* Selected layer editor */}
      {selected && (
        <LayerEditor
          layer={selected}
          clipDuration={clipDuration}
          onChange={(patch) => updateLayer(selected.id, patch)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ── Layer row ──────────────────────────────────────────────────────────────

function LayerRow({
  layer,
  isFirst,
  isLast,
  isSelected,
  clipDuration,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  layer: OverlayLayer;
  isFirst: boolean;
  isLast: boolean;
  isSelected: boolean;
  clipDuration: number;
  onSelect: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const end = layer.endTime === 'end' ? clipDuration : layer.endTime;

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
        isSelected ? 'bg-editor-accent/15 border border-editor-accent/30' : 'bg-editor-surface hover:bg-editor-border border border-transparent'
      }`}
    >
      {layer.type === 'text' ? (
        <Type className="w-3.5 h-3.5 text-editor-accent shrink-0" />
      ) : (
        <Image className="w-3.5 h-3.5 text-editor-success shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-editor-text truncate">
          {layer.type === 'text' ? (layer.content || 'Empty text') : 'Image'}
        </p>
        <p className="text-[10px] text-editor-text-muted">
          {fmt(layer.startTime)} → {layer.endTime === 'end' ? 'end' : fmt(end as number)}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          disabled={isFirst}
          className="p-0.5 rounded text-editor-text-muted hover:text-editor-text disabled:opacity-30"
        >
          <ChevronUp className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          disabled={isLast}
          className="p-0.5 rounded text-editor-text-muted hover:text-editor-text disabled:opacity-30"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-0.5 rounded text-editor-text-muted hover:text-editor-danger"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Layer editor (bottom drawer) ───────────────────────────────────────────

function LayerEditor({
  layer,
  clipDuration,
  onChange,
  onClose,
}: {
  layer: OverlayLayer;
  clipDuration: number;
  onChange: (patch: Partial<OverlayLayer>) => void;
  onClose: () => void;
}) {
  return (
    <div className="border-t border-editor-border px-3 py-3 shrink-0 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-medium text-editor-text uppercase tracking-wider">
          {layer.type === 'text' ? 'Text layer' : 'Image layer'}
        </p>
        <button onClick={onClose} className="text-editor-text-muted hover:text-editor-text">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {layer.type === 'text' && (
        <>
          <textarea
            value={layer.content ?? ''}
            onChange={(e) => onChange({ content: e.target.value })}
            rows={2}
            placeholder="Enter text…"
            className="w-full px-2 py-1 text-xs rounded bg-editor-surface border border-editor-border text-editor-text resize-none focus:outline-none focus:border-editor-accent"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-editor-text-muted">Size</span>
              <input
                type="number"
                min={8}
                max={72}
                value={layer.fontSize ?? 16}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
                className="px-2 py-1 text-xs rounded bg-editor-surface border border-editor-border text-editor-text focus:outline-none focus:border-editor-accent"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-editor-text-muted">Color</span>
              <input
                type="color"
                value={layer.fontColor ?? '#ffffff'}
                onChange={(e) => onChange({ fontColor: e.target.value })}
                className="h-[28px] w-full rounded border border-editor-border bg-editor-surface cursor-pointer"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={layer.bold ?? false}
                onChange={(e) => onChange({ bold: e.target.checked })}
                className="accent-editor-accent"
              />
              <span className="text-[11px] text-editor-text">Bold</span>
            </label>
            <label className="flex flex-col gap-0.5 flex-1">
              <span className="text-[10px] text-editor-text-muted">Background</span>
              <input
                type="color"
                value={layer.backgroundColor === 'transparent' || !layer.backgroundColor ? '#000000' : layer.backgroundColor}
                onChange={(e) => onChange({ backgroundColor: e.target.value })}
                className="h-[22px] w-full rounded border border-editor-border bg-editor-surface cursor-pointer"
              />
            </label>
          </div>
        </>
      )}

      {layer.type === 'image' && (
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-editor-text-muted">Opacity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={layer.opacity ?? 1}
            onChange={(e) => onChange({ opacity: Number(e.target.value) })}
            className="accent-editor-accent"
          />
        </label>
      )}

      {/* Time range */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-editor-text-muted">Start (s)</span>
          <input
            type="number"
            min={0}
            max={clipDuration}
            step={0.5}
            value={layer.startTime}
            onChange={(e) => onChange({ startTime: Number(e.target.value) })}
            className="px-2 py-1 text-xs rounded bg-editor-surface border border-editor-border text-editor-text focus:outline-none focus:border-editor-accent"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-editor-text-muted">End (s / "end")</span>
          <div className="flex gap-1">
            <input
              type="number"
              min={0}
              max={clipDuration}
              step={0.5}
              value={layer.endTime === 'end' ? clipDuration : layer.endTime}
              disabled={layer.endTime === 'end'}
              onChange={(e) => onChange({ endTime: Number(e.target.value) })}
              className="flex-1 px-2 py-1 text-xs rounded bg-editor-surface border border-editor-border text-editor-text disabled:opacity-40 focus:outline-none focus:border-editor-accent"
            />
            <button
              title="Full clip"
              onClick={() => onChange({ endTime: layer.endTime === 'end' ? clipDuration : 'end' })}
              className={`px-1.5 py-1 text-[10px] rounded border transition-colors ${
                layer.endTime === 'end'
                  ? 'bg-editor-accent text-white border-editor-accent'
                  : 'bg-editor-surface text-editor-text-muted border-editor-border'
              }`}
            >
              end
            </button>
          </div>
        </label>
      </div>
    </div>
  );
}
