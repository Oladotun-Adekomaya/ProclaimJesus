import { create } from 'zustand';
import type { OverlayLayer } from '../types/project';

let nextId = 1;

interface OverlayState {
  layers: OverlayLayer[];
}

interface OverlayActions {
  addLayer: (layer: Omit<OverlayLayer, 'id'>) => string;
  updateLayer: (id: string, patch: Partial<OverlayLayer>) => void;
  removeLayer: (id: string) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;
  reset: () => void;
}

const initial: OverlayState = { layers: [] };

export const useOverlayStore = create<OverlayState & OverlayActions>()((set, get) => ({
  ...initial,

  addLayer: (layer) => {
    const id = `ol_${nextId++}`;
    set((s) => ({ layers: [...s.layers, { ...layer, id }] }));
    return id;
  },

  updateLayer: (id, patch) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })),

  removeLayer: (id) =>
    set((s) => ({ layers: s.layers.filter((l) => l.id !== id) })),

  moveLayerUp: (id) => {
    const { layers } = get();
    const i = layers.findIndex((l) => l.id === id);
    if (i <= 0) return;
    const next = [...layers];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    set({ layers: next });
  },

  moveLayerDown: (id) => {
    const { layers } = get();
    const i = layers.findIndex((l) => l.id === id);
    if (i < 0 || i >= layers.length - 1) return;
    const next = [...layers];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    set({ layers: next });
  },

  reset: () => set(initial),
}));
