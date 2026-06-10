import { create } from 'zustand';

export type IndexingPhase = 'idle' | 'submitting' | 'indexing' | 'done' | 'error';

interface IndexingState {
  phase: IndexingPhase;
  videoId: string | null;
  title: string;
  sourceUrl: string;
  errorMessage: string | null;
}

interface IndexingActions {
  setPhase: (phase: IndexingPhase) => void;
  setVideoId: (id: string) => void;
  setTitle: (title: string) => void;
  setSourceUrl: (url: string) => void;
  setError: (msg: string) => void;
  reset: () => void;
}

const initial: IndexingState = {
  phase: 'idle',
  videoId: null,
  title: '',
  sourceUrl: '',
  errorMessage: null,
};

export const useIndexingStore = create<IndexingState & IndexingActions>()((set) => ({
  ...initial,
  setPhase: (phase) => set({ phase }),
  setVideoId: (videoId) => set({ videoId }),
  setTitle: (title) => set({ title }),
  setSourceUrl: (sourceUrl) => set({ sourceUrl }),
  setError: (errorMessage) => set({ phase: 'error', errorMessage }),
  reset: () => set(initial),
}));
