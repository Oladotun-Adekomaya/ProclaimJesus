# Proclaim Jesus — Project Planning Document

## What We're Building

An AI-powered sermon clipper that lets church media teams paste a YouTube or Facebook
URL and automatically get a word-level transcript, speaker breakdown, and AI-suggested
short-form clips (Reels, Shorts, TikTok). No file uploads — the entire pipeline is
cloud-based, making it viable in low-bandwidth environments like Nigeria.

**Kairos is a fork of CutScript** (https://github.com/DataAnts-AI/CutScript), an
open-source MIT-licensed text-based video editor. Rather than building from scratch,
we fork CutScript and modify it — keeping all of its working infrastructure (transcript
editor, video player, FFmpeg export, Electron shell, undo/redo, captions, waveform,
project save/load) and replacing or extending only what's specific to sermon clipping.

Core changes from CutScript:
- WhisperX (local GPU transcription) → Azure AI Video Indexer (cloud)
- File upload UI → YouTube/Facebook/Vimeo URL input
- Generic AI clip prompts → Sermon-aware prompts (scripture, altar call, diarization)
- No overlay editor → Full image + text overlay editor with FFmpeg compositing
- No speaker filter → Speaker diarization panel (pastor vs congregation)

---

## Why Fork CutScript Instead of Building from Scratch

CutScript already ships working, tested implementations of:
- Word-level transcript editor with click-to-seek video sync
- Undo/redo system
- Waveform timeline
- FFmpeg export (stream copy + re-encode up to 4K)
- Caption generation and burn-in (SRT/VTT/ASS)
- Electron shell + Python FastAPI child process management
- Encrypted API key storage
- Project save/load (.cutscript format)
- Keyboard shortcuts (J/K/L scrubbing)
- Full React + Vite + Zustand + FastAPI boilerplate

That is months of infrastructure work. Forking means Kairos inherits all of it on day
one. Our changes are mostly subtractions and targeted swaps — not rewrites.

| CutScript | Kairos |
|---|---|
| File upload UI | URL input UI |
| `transcription_service.py` (WhisperX) | `azure_vi_service.py` |
| Generic AI clip prompts | Sermon-aware Claude prompts |
| No overlay editor | Image + text overlay editor |
| No speaker filter | Speaker diarization panel |
| Transcript editor, video player, FFmpeg, Electron | Unchanged — inherited from fork |

Additional benefits of forking:
- Upstream bug fixes can be merged back in
- MIT license allows full commercialisation of Kairos
- Opportunity to contribute overlay editor back to CutScript as a general feature

### Getting Started
```bash
# Fork on GitHub first, then:
git clone https://github.com/YOUR_USERNAME/Kairos.git
cd Kairos
git remote add upstream https://github.com/DataAnts-AI/CutScript.git

# To pull future CutScript fixes:
git fetch upstream
git merge upstream/main
```

---

## Key Design Decisions

### 1. URL-First, No Uploads
Users paste a YouTube or Facebook URL. The backend uses **yt-dlp** to resolve it into
a direct stream URL, then passes that to Azure Video Indexer. Azure fetches the video
cloud-to-cloud. The user's internet connection is only used to submit a short POST
request — critical for Nigerian church teams on slow connections.

Supported URL sources:
- YouTube (most large Nigerian churches: RCCG, Winners Chapel, Daystar, etc.)
- Facebook VOD (popular for mid-size churches post-stream)
- Vimeo
- Direct MP4 links (self-hosted / Cloudflare Stream)

### 2. Azure AI Video Indexer for Transcription
Replaces WhisperX entirely. Benefits for sermons:
- Word-level + phrase-level timestamps in JSON
- Speaker diarization (pastor vs choir vs congregation)
- Keyword/topic extraction (grace, faith, repentance, etc.)
- 50+ language support (Yoruba, Igbo, Pidgin support via custom language models)
- No GPU required on the server
- Free tier: 2,400 minutes/month

### 3. Dual Distribution: Web App + Electron Desktop
Same React + FastAPI codebase ships as both:
- **Web app**: FastAPI on a VPS/Railway, React on Vercel — shareable link, any device
- **Electron desktop**: Electron wraps React, spawns FastAPI locally (like CutScript)

This means a church's media team can use it from a browser on any machine, or install
the desktop app if they prefer.

### 4. Async Indexing Flow
Unlike CutScript's synchronous WhisperX call, Azure VI is async:
1. POST URL → get `videoId` back immediately
2. Frontend polls `/transcribe/azure/{videoId}/status` every 5 seconds
3. When status = `Processed`, fetch the full index
4. Parse word-level timestamps and render the transcript editor

---

## Tech Stack

### Frontend
- React + Vite + TypeScript
- Tailwind CSS
- Zustand (state management)
- Same component structure as CutScript

### Backend
- Python 3.10+
- FastAPI
- yt-dlp (URL resolution)
- Azure AI Video Indexer REST API (transcription + insights)
- FFmpeg (clip export)
- Claude / OpenAI (sermon clip suggestions)

### Desktop Shell
- Electron (wraps the web UI, spawns FastAPI as child process)

---

## Project Structure

```
sermon-clipper/
├── electron/
│   ├── main.js               # App entry, spawns Python backend
│   ├── preload.js            # IPC bridge (file save, API key storage)
│   └── python-bridge.js
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── URLInput.tsx          # YouTube/Facebook URL paste field
│       │   ├── IndexingProgress.tsx  # Polling progress indicator
│       │   ├── TranscriptEditor.tsx  # Word-level edit (from CutScript)
│       │   ├── SpeakerFilter.tsx     # Show/hide by speaker
│       │   ├── ThemeTags.tsx         # Azure VI topic chips
│       │   ├── ClipSuggestions.tsx   # AI-ranked sermon moments
│       │   ├── VideoPlayer.tsx       # Synced video playback
│       │   ├── ClipPreview.tsx       # Clean text + video preview before export
│       │   ├── OverlayEditor.tsx     # Canvas drag-and-drop overlay editor
│       │   ├── ImageLayer.tsx        # Draggable/resizable image overlay
│       │   ├── TextLayer.tsx         # Draggable text with style controls
│       │   ├── LayerPanel.tsx        # Layer list with time range controls
│       │   └── ExportPanel.tsx       # Platform presets (Shorts/Reels/TikTok)
│       ├── store/
│       │   ├── editorStore.ts        # Transcript edit state
│       │   ├── indexingStore.ts      # Azure VI job status
│       │   ├── clipStore.ts          # AI clip suggestions
│       │   └── overlayStore.ts       # Overlay layer state
│       └── types/
│           └── sermon.ts             # Shared TypeScript interfaces
├── backend/
│   ├── main.py
│   ├── routers/
│   │   ├── transcription.py          # URL intake + Azure VI job management
│   │   ├── export.py                 # FFmpeg clip export (from CutScript)
│   │   └── ai.py                     # Sermon clip suggestions
│   ├── services/
│   │   ├── url_resolver.py           # yt-dlp URL resolution
│   │   ├── azure_vi_service.py       # Azure Video Indexer API client
│   │   ├── transcript_parser.py      # Parse Azure VI JSON → word array
│   │   ├── sermon_ai_service.py      # Claude/OpenAI sermon-aware prompts
│   │   ├── ffmpeg_filter_builder.py  # Assembles FFmpeg filter chain from layers
│   │   └── export_service.py         # FFmpeg logic (from CutScript)
│   ├── utils/
│   │   └── time_utils.py             # HH:MM:SS.f → seconds conversion
│   └── requirements.txt
└── shared/
    └── schema.ts                     # Project save/load schema
```

---

## API Endpoints

### Transcription (new)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/transcribe/url` | Submit YouTube/Facebook URL, returns `videoId` |
| GET | `/transcribe/{videoId}/status` | Poll Azure VI indexing status |
| GET | `/transcribe/{videoId}/result` | Fetch parsed word-level transcript + insights |
| DELETE | `/transcribe/{videoId}` | Clean up Azure VI video after export |

### AI (extended from CutScript)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ai/sermon-clips` | AI-suggested clips with sermon context |
| POST | `/ai/filler-removal` | Detect filler words (from CutScript) |
| GET | `/ai/ollama-models` | List local Ollama models (from CutScript) |

### Export (from CutScript, unchanged)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/export` | Export edited clip via FFmpeg |
| POST | `/captions` | Generate SRT/VTT captions |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/health/azure` | Verify Azure VI credentials |
| GET | `/health/ytdlp` | Verify yt-dlp is available |

---

## Azure Video Indexer Integration

### Auth Flow
```python
# 1. Get ARM access token (preferred for production)
# POST https://login.microsoftonline.com/{tenantId}/oauth2/token

# 2. Get Video Indexer access token
# GET https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/
#     providers/Microsoft.VideoIndexer/accounts/{account}/generateAccessToken

# 3. Upload by URL
# POST https://api.videoindexer.ai/{location}/Accounts/{accountId}/Videos
#     ?videoUrl={resolvedUrl}&name={title}&language=auto
```

### Transcript JSON Structure (Azure VI output)
```json
{
  "insights": {
    "transcript": [
      {
        "id": 1,
        "text": "Grace and peace be unto you",
        "confidence": 0.95,
        "speakerId": 1,
        "instances": [{"start": "00:01:23.4", "end": "00:01:26.1"}],
        "words": [
          {"text": "Grace", "start": "00:01:23.4", "end": "00:01:23.9"},
          {"text": "and",   "start": "00:01:23.9", "end": "00:01:24.1"},
          {"text": "peace", "start": "00:01:24.1", "end": "00:01:24.6"}
        ]
      }
    ],
    "speakers": [
      {"id": 1, "name": "Speaker 1", "instances": [...]}
    ],
    "topics": [
      {"name": "Grace", "referenceUrl": "...", "confidence": 0.9}
    ],
    "keywords": [
      {"text": "salvation", "confidence": 0.87, "instances": [...]}
    ]
  }
}
```

### Parsed Word Array (what frontend receives)
```typescript
interface TranscriptWord {
  id: string;
  text: string;
  start: number;      // seconds
  end: number;        // seconds
  speakerId: number;
  confidence: number;
  deleted: boolean;   // for text-based editing
}
```

---

## Sermon AI Clip Suggestions

### Prompt Strategy
When calling Claude/OpenAI for clip suggestions, pass:
1. Full transcript text with timestamps
2. Extracted topics/keywords from Azure VI
3. Target platform (Shorts = 60s, Reels = 90s, TikTok = 30–60s)

System prompt emphasis:
- Prefer **complete thoughts** — no mid-sentence cuts
- Prioritize **scripture references** as clip anchors
- Flag **altar call / call-to-action** moments (always high value)
- Avoid cutting during **worship/music** segments
- Score clips by: completeness, emotional resonance, standalone clarity

### Clip Suggestion Schema
```typescript
interface ClipSuggestion {
  id: string;
  title: string;           // e.g. "The God Who Restores"
  startTime: number;       // seconds
  endTime: number;         // seconds
  duration: number;        // seconds
  platform: 'shorts' | 'reels' | 'tiktok' | 'custom';
  score: number;           // 0–1 confidence
  rationale: string;       // why this clip was selected
  themes: string[];        // from Azure VI topics
  hasScripture: boolean;
  hasAltarCall: boolean;
}
```

---

## Environment Variables

```env
# Azure Video Indexer
AZURE_VI_ACCOUNT_ID=
AZURE_VI_LOCATION=trial          # or eastus, westeurope, etc.
AZURE_VI_SUBSCRIPTION_ID=        # for ARM-based auth
AZURE_VI_RESOURCE_GROUP=
AZURE_VI_TENANT_ID=
AZURE_VI_CLIENT_ID=
AZURE_VI_CLIENT_SECRET=

# AI (for clip suggestions)
ANTHROPIC_API_KEY=               # Claude
OPENAI_API_KEY=                  # optional fallback

# App
BACKEND_PORT=8642
FRONTEND_PORT=5173
```

---

## Sermon-Specific Features (Beyond CutScript)

| Feature | Status | Notes |
|---------|--------|-------|
| URL-based ingestion (YouTube/Facebook) | To Build | yt-dlp + Azure VI |
| Azure AI Video Indexer transcription | To Build | Replaces WhisperX |
| Speaker diarization display | To Build | Pastor vs congregation |
| Sermon topic/theme tags | To Build | From Azure VI insights |
| Scripture reference detection | To Build | In AI prompt |
| Altar call detection | To Build | In AI prompt |
| Platform export presets | To Build | Shorts/Reels/TikTok |
| Overlay editor (images + text layers) | To Build | See section below |
| Word-level transcript editing | Port from CutScript | |
| FFmpeg clip export | Port from CutScript | |
| Undo/redo | Port from CutScript | |
| Captions (SRT/VTT) | Port from CutScript | |
| Waveform timeline | Port from CutScript | |
| Project save/load | Port from CutScript | |

---

## Overlay Editor

A canvas-style drag-and-drop editor shown after clip selection, before export.
The user sees the first frame of their clip and places layers on top of it.
All layers are composited by FFmpeg in a single export pass — no quality loss.

### Layer Types

**Image Layer (e.g. church banner/logo)**
- Upload PNG (transparent background recommended)
- Drag to any position on the frame
- Resize via corner handles
- Set opacity (0–100%) — for subtle watermark vs bold logo
- Set time range: full clip, first N seconds, last N seconds, or custom range

**Text Layer (e.g. sermon title, scripture, pastor name)**
- Type any content freely — not tied to the transcript
- Position: drag to exact location or snap to top/center/bottom
- Styling: font, size, color, background/outline toggle
- Set time range: e.g. title card for first 5 seconds, scripture reference at a
  specific moment, church name for the full clip duration
- Multiple text layers supported simultaneously

### Overlay Editor UI Layout

```
┌──────────────────────────────────────────────────┐
│  OVERLAY EDITOR                                  │
│──────────────────────────────────────────────────│
│  ┌────────────────────────────────┐              │
│  │                                │              │
│  │   "THE GOD WHO RESTORES"       │  Video       │
│  │                                │  Preview     │
│  │              [LOGO]            │  Frame       │
│  └────────────────────────────────┘              │
│                                                  │
│  Layers:                                         │
│  📝 Title text        0s → 5s    [Edit] [Delete] │
│  🖼 Church logo       0s → end   [Edit] [Delete] │
│  📝 Scripture ref    14s → 20s   [Edit] [Delete] │
│                                                  │
│  [+ Add Text]  [+ Add Image]                     │
│                                                  │
│  [← Back to Transcript]        [Preview] [Export]│
└──────────────────────────────────────────────────┘
```

### Overlay Layer Schema (TypeScript)

```typescript
interface OverlayLayer {
  id: string;
  type: 'image' | 'text';
  startTime: number;        // seconds, 0 = clip start
  endTime: number | 'end';  // seconds or full clip
  position: { x: number; y: number };   // percentage of frame (0–100)
  size: { width: number; height: number }; // percentage of frame width

  // Image layer only
  src?: string;             // base64 or local path
  opacity?: number;         // 0–1

  // Text layer only
  content?: string;
  fontSize?: number;
  fontColor?: string;       // hex
  fontFamily?: string;
  backgroundColor?: string; // hex or 'transparent'
  outlineColor?: string;
  bold?: boolean;
}
```

### FFmpeg Filter Chain (Backend)

Each layer becomes part of a filter chain assembled in `export_service.py`:

```python
# Example filter chain for 2 layers (logo + title text):
# [0:v] trim, setpts
# → overlay=church_logo at x=20:y=20, enable='between(t,0,end)'
# → drawtext=text='THE GOD WHO RESTORES':x=50:y=30:enable='between(t,0,5)'
# → encode output
```

The filter builder iterates over all `OverlayLayer` objects and assembles the
full `-vf` argument dynamically. All compositing happens in one FFmpeg pass.

### Frontend Components Needed

- `OverlayEditor.tsx` — main canvas component with drag-and-drop
- `ImageLayer.tsx` — draggable/resizable image overlay
- `TextLayer.tsx` — draggable text with inline style controls
- `LayerPanel.tsx` — list of all layers with time range controls
- `useOverlayStore.ts` — Zustand store for layer state

### Backend Changes Needed

- `overlay_schema.py` — Pydantic models matching the TypeScript schema
- `ffmpeg_filter_builder.py` — assembles FFmpeg filter chain from layer array
- Update `export_service.py` — accepts overlay layers alongside clip range
- Update `POST /export` — accepts `overlays: OverlayLayer[]` in request body

---

## Build Order (Recommended)

1. **Backend first** — `url_resolver.py` + `azure_vi_service.py` + `transcript_parser.py`
2. **Test transcript pipeline** — paste a YouTube URL, get back a word array
3. **Port CutScript frontend** — swap WhisperX file upload for URL input + polling UI
4. **Wire up transcript editor** — render Azure VI word array in CutScript's editor
5. **Add sermon AI features** — clip suggestions, topic tags, speaker filter
6. **Clip preview** — clean text panel + video playback preview before export
7. **Overlay editor** — canvas drag-and-drop for image/text layers
8. **FFmpeg filter builder** — translate overlay layers into FFmpeg filter chain
9. **Export pipeline** — port CutScript's FFmpeg export, extend with overlay support
10. **Electron wrapper** — drop the working web app into the Electron shell
11. **Web deployment** — deploy FastAPI + React for browser access

---

## Reference Links

- CutScript source: https://github.com/DataAnts-AI/CutScript
- Azure Video Indexer API portal: https://api-portal.videoindexer.ai/
- Azure VI Python samples: https://github.com/Azure-Samples/media-services-video-indexer
- yt-dlp: https://github.com/yt-dlp/yt-dlp
- Azure VI pricing: https://azure.microsoft.com/en-us/pricing/details/video-indexer/