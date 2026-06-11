export interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
  speakerId?: number;
  deleted?: boolean;
}

export interface Segment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: Word[];
  speaker?: string;
  speakerId?: number;
  globalStartIndex: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface DeletedRange extends TimeRange {
  id: string;
  wordIndices: number[];
}

export interface ProjectFile {
  version: 2;
  savedAt: string;
  title: string;

  // Video source
  videoPath: string | null;   // local file path, or display title for remote
  videoUrl: string | null;    // Azure VI stream URL (may expire)
  videoId: string | null;     // Azure VI videoId — used to refresh expired stream URL
  sourceUrl: string;          // original URL the user submitted

  // Transcription
  words: Word[];
  segments: Segment[];
  deletedRanges: DeletedRange[];
  language: string;
  speakers: Speaker[];
  topics: string[];
  keywords: string[];

  // AI-generated clip suggestions
  clipSuggestions: SermonClipSuggestion[];

  // Overlay layers
  overlayLayers: OverlayLayer[];
}

export interface Speaker {
  id: number;
  name: string;
  totalSeconds: number;
}

export interface TranscriptionResult {
  words: Word[];
  segments: Segment[];
  language: string;
  speakers?: Speaker[];
  topics?: string[];
  keywords?: string[];
  videoStreamUrl?: string | null;
}

export interface ExportOptions {
  outputPath: string;
  mode: 'fast' | 'reencode';
  resolution: '720p' | '1080p' | '4k';
  format: 'mp4' | 'mov' | 'webm';
  enhanceAudio: boolean;
  captions: 'none' | 'burn-in' | 'sidecar';
  captionStyle?: CaptionStyle;
  aspectRatio: '16:9' | '9:16' | '1:1';
}

export interface CaptionStyle {
  fontName: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  position: 'bottom' | 'top' | 'center';
  bold: boolean;
}

export type AIProvider = 'ollama' | 'openai' | 'claude';

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

export interface FillerWordResult {
  wordIndices: number[];
  fillerWords: Array<{ index: number; word: string; reason: string }>;
}

export interface ClipSuggestion {
  title: string;
  startWordIndex: number;
  endWordIndex: number;
  startTime: number;
  endTime: number;
  reason: string;
}

export type Platform = 'shorts' | 'reels' | 'tiktok' | 'custom';

export interface SermonClipSuggestion {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  platform: Platform;
  score: number;
  rationale: string;
  themes: string[];
  hasScripture: boolean;
  hasAltarCall: boolean;
}

export interface OverlayLayer {
  id: string;
  type: 'image' | 'text';
  startTime: number;
  endTime: number | 'end';
  position: { x: number; y: number };   // 0–100 (% of canvas)
  size: { width: number; height: number }; // 0–100 (% of canvas width)

  // Image-only
  src?: string;     // base64 data URL
  opacity?: number; // 0–1

  // Text-only
  content?: string;
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
  backgroundColor?: string;
  bold?: boolean;
}
