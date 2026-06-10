import { create } from 'zustand';
import type { SermonClipSuggestion, Platform } from '../types/project';

interface ClipState {
  suggestions: SermonClipSuggestion[];
  platform: Platform;
  isGenerating: boolean;
  error: string | null;
}

interface ClipActions {
  setPlatform: (p: Platform) => void;
  setSuggestions: (clips: SermonClipSuggestion[]) => void;
  setGenerating: (v: boolean) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

const initial: ClipState = {
  suggestions: [],
  platform: 'shorts',
  isGenerating: false,
  error: null,
};

export const useClipStore = create<ClipState & ClipActions>()((set) => ({
  ...initial,
  setPlatform: (platform) => set({ platform }),
  setSuggestions: (suggestions) => set({ suggestions, error: null }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setError: (error) => set({ error, isGenerating: false }),
  reset: () => set(initial),
}));
