import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Word, Segment, DeletedRange, TranscriptionResult } from '../types/project';

interface EditorState {
  videoPath: string | null;
  videoUrl: string | null;
  words: Word[];
  segments: Segment[];
  deletedRanges: DeletedRange[];
  language: string;

  currentTime: number;
  duration: number;
  isPlaying: boolean;

  selectedWordIndices: number[];
  hoveredWordIndex: number | null;

  isTranscribing: boolean;
  transcriptionProgress: number;
  isExporting: boolean;
  exportProgress: number;

  backendUrl: string;
}

interface EditorActions {
  setBackendUrl: (url: string) => void;
  loadVideo: (path: string) => void;
  setVideoSource: (url: string, title: string) => void;
  setTranscription: (result: TranscriptionResult) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSelectedWordIndices: (indices: number[]) => void;
  setHoveredWordIndex: (index: number | null) => void;
  deleteSelectedWords: () => void;
  deleteWordRange: (startIndex: number, endIndex: number) => void;
  restoreRange: (rangeId: string) => void;
  setTranscribing: (active: boolean, progress?: number) => void;
  setExporting: (active: boolean, progress?: number) => void;
  getKeepSegments: () => Array<{ start: number; end: number }>;
  getWordAtTime: (time: number) => number;
  loadProject: (projectData: any) => void;
  reset: () => void;
}

const initialState: EditorState = {
  videoPath: null,
  videoUrl: null,
  words: [],
  segments: [],
  deletedRanges: [],
  language: '',
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  selectedWordIndices: [],
  hoveredWordIndex: null,
  isTranscribing: false,
  transcriptionProgress: 0,
  isExporting: false,
  exportProgress: 0,
  backendUrl: 'http://localhost:8642',
};

let nextRangeId = 1;

export const useEditorStore = create<EditorState & EditorActions>()(
  temporal(
    (set, get) => ({
      ...initialState,

      setBackendUrl: (url) => set({ backendUrl: url }),

      loadVideo: (path) => {
        const backend = get().backendUrl;
        const url = `${backend}/file?path=${encodeURIComponent(path)}`;
        set({
          ...initialState,
          backendUrl: backend,
          videoPath: path,
          videoUrl: url,
        });
      },

      // For Azure VI: set a remote video URL without a local file path
      setVideoSource: (url, title) => {
        const backend = get().backendUrl;
        set({
          ...initialState,
          backendUrl: backend,
          videoPath: title,
          videoUrl: url || null,
        });
      },

      setTranscription: (result) => {
        // Normalise Azure VI word format (text/speakerId) → CutScript format (word/speaker)
        const normaliseWord = (w: any) => ({
          ...w,
          word: w.word ?? w.text ?? '',
          speaker: w.speaker ?? (w.speakerId != null ? `Speaker ${w.speakerId}` : undefined),
        });

        const normalisedWords = result.words.map(normaliseWord);

        let globalIdx = 0;
        const annotatedSegments = result.segments.map((seg) => {
          const normWords = seg.words.map(normaliseWord);
          const annotated = { ...seg, words: normWords, globalStartIndex: globalIdx };
          globalIdx += normWords.length;
          return annotated;
        });

        // If the result carries a stream URL (Azure VI), update the video source
        if (result.videoStreamUrl) {
          const backend = get().backendUrl;
          set({ videoUrl: result.videoStreamUrl, backendUrl: backend });
        }

        set({
          words: normalisedWords,
          segments: annotatedSegments,
          language: result.language,
          deletedRanges: [],
          selectedWordIndices: [],
        });
      },

      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setSelectedWordIndices: (indices) => set({ selectedWordIndices: indices }),
      setHoveredWordIndex: (index) => set({ hoveredWordIndex: index }),

      deleteSelectedWords: () => {
        const { selectedWordIndices, words, deletedRanges } = get();
        if (selectedWordIndices.length === 0) return;

        const sorted = [...selectedWordIndices].sort((a, b) => a - b);
        const startWord = words[sorted[0]];
        const endWord = words[sorted[sorted.length - 1]];

        const newRange: DeletedRange = {
          id: `dr_${nextRangeId++}`,
          start: startWord.start,
          end: endWord.end,
          wordIndices: sorted,
        };

        set({
          deletedRanges: [...deletedRanges, newRange],
          selectedWordIndices: [],
        });
      },

      deleteWordRange: (startIndex, endIndex) => {
        const { words, deletedRanges } = get();
        const indices = [];
        for (let i = startIndex; i <= endIndex; i++) indices.push(i);

        const newRange: DeletedRange = {
          id: `dr_${nextRangeId++}`,
          start: words[startIndex].start,
          end: words[endIndex].end,
          wordIndices: indices,
        };

        set({ deletedRanges: [...deletedRanges, newRange] });
      },

      restoreRange: (rangeId) => {
        const { deletedRanges } = get();
        set({ deletedRanges: deletedRanges.filter((r) => r.id !== rangeId) });
      },

      setTranscribing: (active, progress) =>
        set({
          isTranscribing: active,
          transcriptionProgress: progress ?? (active ? 0 : 100),
        }),

      setExporting: (active, progress) =>
        set({
          isExporting: active,
          exportProgress: progress ?? (active ? 0 : 100),
        }),

      getKeepSegments: () => {
        const { words, deletedRanges, duration } = get();
        if (words.length === 0) return [{ start: 0, end: duration }];

        const deletedSet = new Set<number>();
        for (const range of deletedRanges) {
          for (const idx of range.wordIndices) deletedSet.add(idx);
        }

        const segments: Array<{ start: number; end: number }> = [];
        let segStart: number | null = null;

        for (let i = 0; i < words.length; i++) {
          if (!deletedSet.has(i)) {
            if (segStart === null) segStart = words[i].start;
          } else {
            if (segStart !== null) {
              segments.push({ start: segStart, end: words[i - 1].end });
              segStart = null;
            }
          }
        }

        if (segStart !== null) {
          segments.push({ start: segStart, end: words[words.length - 1].end });
        }

        return segments;
      },

      getWordAtTime: (time) => {
        const { words } = get();
        let lo = 0;
        let hi = words.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          if (words[mid].end < time) lo = mid + 1;
          else if (words[mid].start > time) hi = mid - 1;
          else return mid;
        }
        return lo < words.length ? lo : words.length - 1;
      },

      loadProject: (data) => {
        const backend = get().backendUrl;
        const url = `${backend}/file?path=${encodeURIComponent(data.videoPath)}`;

        let globalIdx = 0;
        const annotatedSegments = (data.segments || []).map((seg: Segment) => {
          const annotated = { ...seg, globalStartIndex: globalIdx };
          globalIdx += seg.words.length;
          return annotated;
        });

        set({
          ...initialState,
          backendUrl: backend,
          videoPath: data.videoPath,
          videoUrl: url,
          words: data.words || [],
          segments: annotatedSegments,
          deletedRanges: data.deletedRanges || [],
          language: data.language || '',
        });
      },

      reset: () => set(initialState),
    }),
    { limit: 100 },
  ),
);
