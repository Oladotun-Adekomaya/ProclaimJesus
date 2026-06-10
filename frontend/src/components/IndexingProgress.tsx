import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

const STEPS = [
  'Downloading sermon video...',
  'Transcribing audio...',
  'Detecting speakers...',
  'Extracting topics and scripture references...',
  'Finalising transcript...',
];

interface Props {
  videoId: string;
  title: string;
  backendUrl: string;
  onDone: () => void;
  onError: (msg: string) => void;
}

export default function IndexingProgress({ videoId, title, backendUrl, onDone, onError }: Props) {
  const [progress, setProgress] = useState(30);
  const [stepIdx, setStepIdx] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    // Slowly creep progress bar from 30 → 88 while waiting
    const progressTimer = setInterval(() => {
      setProgress((p) => (p < 88 ? +(p + 0.4).toFixed(1) : p));
    }, 1000);

    // Cycle through status messages
    const stepTimer = setInterval(() => {
      setStepIdx((i) => (i < STEPS.length - 1 ? i + 1 : i));
    }, 18000);

    // Poll /status every 5 seconds
    const poll = async () => {
      while (!cancelledRef.current) {
        await new Promise((r) => setTimeout(r, 5000));
        if (cancelledRef.current) break;
        try {
          const res = await fetch(`${backendUrl}/transcribe/azure/${videoId}/status`);
          if (!res.ok) continue;
          const { state } = await res.json();
          if (state === 'Processed') {
            clearInterval(progressTimer);
            clearInterval(stepTimer);
            setProgress(100);
            setStepIdx(STEPS.length - 1);
            setTimeout(onDone, 600);
            return;
          }
          if (state === 'Failed') {
            onError('Azure Video Indexer failed to process this video. Please try again.');
            return;
          }
        } catch {
          // transient network error — keep polling
        }
      }
    };
    poll();

    return () => {
      cancelledRef.current = true;
      clearInterval(progressTimer);
      clearInterval(stepTimer);
    };
  }, [videoId, backendUrl, onDone, onError]);

  return (
    <div className="h-screen flex flex-col items-center justify-center gap-8 bg-editor-bg px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="w-12 h-12 text-editor-accent animate-spin" />
        <h2 className="text-xl font-semibold max-w-sm truncate">{title}</h2>
        <p className="text-editor-text-muted text-sm">{STEPS[stepIdx]}</p>
      </div>

      <div className="w-full max-w-sm space-y-2">
        <div className="h-1.5 bg-editor-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-editor-accent rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[11px] text-editor-text-muted text-center">
          Usually 2–5 min per hour of video · powered by Azure AI Video Indexer
        </p>
      </div>
    </div>
  );
}
