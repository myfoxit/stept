import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Loader2,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiClient';
import { CursorOverlay } from './CursorOverlay';

/* ── Types ── */

interface PublicStep {
  step_number: number;
  step_type: string | null;
  description: string | null;
  content: string | null;
  window_title: string | null;
  text_typed: string | null;
  key_pressed: string | null;
  generated_title: string | null;
  generated_description: string | null;
  screenshot_relative_position: { x: number; y: number } | null;
  screenshot_size: { width: number; height: number } | null;
  window_size: { width: number; height: number } | null;
}

interface MoviePlayerProps {
  steps: PublicStep[];
  files: Record<string, string>;
  token: string;
  compact?: boolean;
}

type AnimState =
  | 'idle'
  | 'zooming-in'
  | 'cursor-moving'
  | 'clicking'
  | 'speaking'
  | 'waiting'
  | 'zooming-out'
  | 'transitioning';

/* ── Helpers ── */

function isEnglish(text: string): boolean {
  const ascii = text.replace(/[^a-zA-Z]/g, '');
  const nonWhitespace = text.replace(/\s/g, '');
  if (nonWhitespace.length === 0) return false;
  return ascii.length / nonWhitespace.length > 0.8;
}

function getClickPercent(step: PublicStep): { x: number; y: number } | null {
  const rel = step.screenshot_relative_position;
  const size = step.screenshot_size ?? step.window_size;
  if (!rel || !size) return null;
  return {
    x: (rel.x / size.width) * 100,
    y: (rel.y / size.height) * 100,
  };
}

function getStepText(step: PublicStep): string {
  // Use explicit description/content first
  const explicit = step.description || step.generated_description || step.generated_title || step.content;
  if (explicit) return explicit;

  // Generate generic narration for action steps
  const sType = step.step_type || 'screenshot';

  if (step.text_typed) {
    return `Type "${step.text_typed}"`;
  }

  if (step.key_pressed) {
    return `Press ${step.key_pressed}`;
  }

  if (sType === 'copy') {
    return 'Copy the selected content';
  }

  if (sType === 'paste') {
    return 'Paste the content';
  }

  if (sType === 'done' || sType === 'complete') {
    return "And that's it — you're done!";
  }

  if (sType === 'navigate' || sType === 'navigation') {
    const target = step.window_title;
    return target ? `Navigate to ${target}` : 'Navigate to the next page';
  }

  if (sType === 'scroll') {
    return 'Scroll down the page';
  }

  // Fallback to window title or generic
  if (step.window_title) return step.window_title;

  return '';
}

/**
 * Fetch a single TTS blob from the API. No retries — caller handles failures.
 */
async function fetchTtsBlob(
  url: string,
  text: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!r.ok) throw new Error(`TTS ${r.status}`);
  return await r.blob();
}

/**
 * Preload TTS audio for all steps. Uses simple sequential-batched approach:
 * process `concurrency` steps at a time, wait for batch to complete, next batch.
 * Every step that succeeds is cached; failures are logged but don't block.
 */
async function preloadAllTts(
  baseUrl: string,
  steps: PublicStep[],
  signal: AbortSignal,
): Promise<Map<number, Blob>> {
  const url = `${baseUrl.replace('/api/v1', '')}/api/v1/tts/speak`;
  const cache = new Map<number, Blob>();

  // Collect steps that need TTS
  const tasks: { idx: number; text: string }[] = [];
  for (let i = 0; i < steps.length; i++) {
    const text = getStepText(steps[i]);
    if (text?.trim()) {
      tasks.push({ idx: i, text });
    }
  }

  if (tasks.length === 0) return cache;

  // Process in batches of 3
  const batchSize = 3;
  for (let i = 0; i < tasks.length; i += batchSize) {
    if (signal.aborted) break;
    const batch = tasks.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((task) => fetchTtsBlob(url, task.text, signal).then((blob) => ({ idx: task.idx, blob }))),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        cache.set(result.value.idx, result.value.blob);
      }
      // Failures: step will be fetched live at speak-time
    }
  }

  return cache;
}

/* ── Component ── */

interface TtsConfig {
  provider: 'openai' | 'browser';
  available: boolean;
}

export function MoviePlayer({ steps, files, token, compact }: MoviePlayerProps) {
  const baseUrl = getApiBaseUrl();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [animState, setAnimState] = useState<AnimState>('idle');
  const [showTooltip, setShowTooltip] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 50, y: 50 });
  const [cursorVisible, setCursorVisible] = useState(false);
  const [clicking, setClicking] = useState(false);
  const [zoomTransform, setZoomTransform] = useState('scale(1) translate(0%, 0%)');
  const [imageOpacity, setImageOpacity] = useState(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [ttsConfig, setTtsConfig] = useState<TtsConfig | null>(null);
  const [imgLayout, setImgLayout] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [ttsPreloading, setTtsPreloading] = useState(false);
  const [ttsReady, setTtsReady] = useState(false);

  const imgElRef = useRef<HTMLImageElement | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const mutedRef = useRef(muted);
  const currentIndexRef = useRef(currentIndex);
  const ttsCacheRef = useRef<Map<number, Blob>>(new Map());
  const preloadAbortRef = useRef<AbortController | null>(null);
  const pendingPlayRef = useRef(false);

  playingRef.current = playing;
  speedRef.current = speed;
  mutedRef.current = muted;
  currentIndexRef.current = currentIndex;

  const step = steps[currentIndex];
  const total = steps.length;
  const stepType = step?.step_type || 'screenshot';
  const hasImage = step ? String(step.step_number) in files : false;

  /* ── Compute rendered image rect within the object-contain container ── */

  const computeImgLayout = useCallback(() => {
    const img = imgElRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const container = img.parentElement;
    if (!container) return;

    const cW = img.clientWidth;   // CSS width (includes padding area used by object-fit)
    const cH = img.clientHeight;  // CSS height
    const nW = img.naturalWidth;
    const nH = img.naturalHeight;

    // object-fit: contain — image scales to fit within cW×cH
    const scale = Math.min(cW / nW, cH / nH);
    const renderedW = nW * scale;
    const renderedH = nH * scale;

    // object-position: center — offset from the CSS box
    const offsetX = (cW - renderedW) / 2;
    const offsetY = (cH - renderedH) / 2;

    // img is inside a container with p-4 (16px padding).
    // The img element's offset from the container starts at the padding.
    // We position the overlay absolutely within the same container (relative),
    // so we need offsets relative to the container:
    const imgLeft = img.offsetLeft + offsetX;
    const imgTop = img.offsetTop + offsetY;

    setImgLayout({ left: imgLeft, top: imgTop, width: renderedW, height: renderedH });
  }, []);

  const handleImageLoad = useCallback(() => {
    computeImgLayout();
  }, [computeImgLayout]);

  // Recompute on resize
  useEffect(() => {
    const onResize = () => computeImgLayout();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [computeImgLayout]);

  // Reset layout on step change
  useEffect(() => {
    setImgLayout(null);
  }, [currentIndex]);

  /* ── Fetch TTS config on mount ── */

  useEffect(() => {
    const url = `${baseUrl.replace('/api/v1', '')}/api/v1/tts/config`;
    fetch(url)
      .then((r) => r.json())
      .then((cfg: TtsConfig) => setTtsConfig(cfg))
      .catch(() => setTtsConfig({ provider: 'browser', available: false }));
  }, [baseUrl]);

  /* ── Preload TTS audio when config is ready ── */

  const startPreload = useCallback(() => {
    if (!ttsConfig || ttsConfig.provider !== 'openai' || !ttsConfig.available) {
      setTtsReady(true);
      return;
    }

    // Already preloaded or in progress
    if (ttsReady || ttsPreloading) return;

    setTtsPreloading(true);
    const controller = new AbortController();
    preloadAbortRef.current = controller;

    preloadAllTts(baseUrl, steps, controller.signal)
      .then((cache) => {
        ttsCacheRef.current = cache;
        setTtsReady(true);
      })
      .catch(() => {
        // If aborted, don't update state
        if (!controller.signal.aborted) {
          setTtsReady(true); // proceed anyway — will fall back per-step
        }
      })
      .finally(() => {
        setTtsPreloading(false);
      });
  }, [baseUrl, steps, ttsConfig, ttsReady, ttsPreloading]);

  // Compute a fingerprint of step texts to detect language changes
  const stepsTextKey = React.useMemo(
    () => steps.map((s) => getStepText(s)).join('|'),
    [steps],
  );

  // Invalidate TTS cache and reset playback when steps content changes (e.g. language switch)
  const prevStepsKeyRef = useRef(stepsTextKey);
  useEffect(() => {
    if (stepsTextKey === prevStepsKeyRef.current) return;
    prevStepsKeyRef.current = stepsTextKey;

    // Stop playback
    setPlaying(false);
    clearAllTimeouts();
    cancelSpeech();
    setCurrentIndex(0);
    setAnimState('idle');
    setZoomTransform('scale(1) translate(0%, 0%)');
    setImageOpacity(1);

    // Invalidate TTS cache
    preloadAbortRef.current?.abort();
    ttsCacheRef.current = new Map();
    setTtsReady(false);
    setTtsPreloading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsTextKey]);

  // Start preloading as soon as ttsConfig arrives (or after cache invalidation)
  useEffect(() => {
    if (ttsConfig && !ttsReady && !ttsPreloading) {
      startPreload();
    }
  }, [ttsConfig, ttsReady, ttsPreloading, startPreload]);

  /* ── Cleanup ── */

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const cancelSpeech = useCallback(() => {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimeouts();
      cancelSpeech();
      // Cancel any in-flight preload requests
      preloadAbortRef.current?.abort();
      // Revoke any cached object URLs (blobs don't need revoking, only objectURLs do)
    };
  }, [clearAllTimeouts, cancelSpeech]);

  /* ── TTS ── */

  /** Play an audio blob and call onEnd when done. */
  const playBlob = useCallback((blob: Blob, onEnd: () => void) => {
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    audio.playbackRate = speedRef.current;
    audioRef.current = audio;
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      audioRef.current = null;
    };
    audio.onended = () => { cleanup(); onEnd(); };
    audio.onerror = () => { cleanup(); onEnd(); };
    audio.play().catch(() => { cleanup(); onEnd(); });
  }, []);

  /** Speak using OpenAI TTS: try cache first, fetch live on miss. */
  const speakOpenAI = useCallback((stepIdx: number, text: string, onEnd: () => void) => {
    const cached = ttsCacheRef.current.get(stepIdx);
    if (cached) {
      playBlob(cached, onEnd);
      return;
    }

    // Cache miss — fetch live (don't fall back to browser speech)
    const ttsUrl = `${baseUrl.replace('/api/v1', '')}/api/v1/tts/speak`;
    fetchTtsBlob(ttsUrl, text)
      .then((blob) => {
        // Store in cache for potential replay
        ttsCacheRef.current.set(stepIdx, blob);
        playBlob(blob, onEnd);
      })
      .catch(() => {
        // OpenAI completely failed — skip narration, don't use browser voice
        onEnd();
      });
  }, [baseUrl, playBlob]);

  /** Speak using browser Web Speech API (only when OpenAI is not configured). */
  const speakBrowser = useCallback((text: string, onEnd: () => void) => {
    if (typeof speechSynthesis === 'undefined' || !isEnglish(text)) {
      onEnd();
      return;
    }

    cancelSpeech();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9 * speedRef.current;
    utterance.pitch = 1.0;

    const voices = speechSynthesis.getVoices();
    const femaleVoice = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Samantha'))
    ) || voices.find((v) => v.lang.startsWith('en'));
    if (femaleVoice) utterance.voice = femaleVoice;

    utterance.onend = onEnd;
    utterance.onerror = onEnd;
    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, [cancelSpeech]);

  /**
   * Main speak function. Routes to the correct TTS backend:
   * - OpenAI configured → always use OpenAI (cache or live fetch)
   * - Browser fallback → only when OpenAI is NOT configured at all
   * Never mix the two.
   */
  const speak = useCallback((stepIdx: number, text: string, onEnd: () => void) => {
    if (mutedRef.current || !text.trim()) {
      onEnd();
      return;
    }

    cancelSpeech();

    if (ttsConfig?.provider === 'openai' && ttsConfig.available) {
      speakOpenAI(stepIdx, text, onEnd);
    } else {
      speakBrowser(text, onEnd);
    }
  }, [cancelSpeech, ttsConfig, speakOpenAI, speakBrowser]);

  /* ── Schedule with timeout ── */

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms / speedRef.current);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  /* ── Animation sequence for one step ── */

  const runStepAnimation = useCallback((idx: number) => {
    const s = steps[idx];
    if (!s) return;

    const sType = s.step_type || 'screenshot';
    const sHasImage = String(s.step_number) in files;
    const clickPos = getClickPercent(s);
    const text = getStepText(s);

    // For non-screenshot steps or steps without images: speak text then advance
    if (sType !== 'screenshot' || !sHasImage) {
      setShowTooltip(true);
      setCursorVisible(false);
      setZoomTransform('scale(1) translate(0%, 0%)');

      if (text) {
        setAnimState('speaking');
        speak(idx, text, () => {
          if (!playingRef.current) return;
          schedule(() => advanceStep(idx), 800);
        });
      } else {
        schedule(() => {
          if (!playingRef.current) return;
          advanceStep(idx);
        }, 2000);
      }
      return;
    }

    // Phase 1: Show image, start zoom
    setAnimState('zooming-in');
    setShowTooltip(false);
    setCursorVisible(false);
    setImageOpacity(1);

    if (clickPos) {
      // Zoom into click target, clamped so edges don't go out of view
      const scale = 1.8;
      const maxPan = ((scale - 1) / (2 * scale)) * 100; // ~22.2% for 1.8x
      const rawTx = -(clickPos.x - 50) * 0.6;
      const rawTy = -(clickPos.y - 50) * 0.6;
      const tx = Math.max(-maxPan, Math.min(maxPan, rawTx));
      const ty = Math.max(-maxPan, Math.min(maxPan, rawTy));
      schedule(() => {
        setZoomTransform(`scale(${scale}) translate(${tx}%, ${ty}%)`);
      }, 50);
    }

    // Phase 2: Move cursor
    schedule(() => {
      if (!playingRef.current) return;
      setAnimState('cursor-moving');
      setCursorVisible(true);
      if (clickPos) {
        setCursorPos({ x: clickPos.x, y: clickPos.y });
      }
    }, 1000);

    // Phase 3: Click animation
    schedule(() => {
      if (!playingRef.current) return;
      setAnimState('clicking');
      setClicking(true);
    }, 2200);

    schedule(() => {
      setClicking(false);
    }, 2500);

    // Phase 4: Show tooltip and speak
    schedule(() => {
      if (!playingRef.current) return;
      setAnimState('speaking');
      setShowTooltip(true);

      if (text) {
        speak(idx, text, () => {
          if (!playingRef.current) return;
          // Phase 5: Wait — let the user absorb
          setAnimState('waiting');
          schedule(() => {
            if (!playingRef.current) return;
            // Phase 6: Zoom out
            setAnimState('zooming-out');
            setZoomTransform('scale(1) translate(0%, 0%)');

            schedule(() => {
              if (!playingRef.current) return;
              // Phase 7: Transition
              setAnimState('transitioning');
              setShowTooltip(false);
              setImageOpacity(0);

              schedule(() => {
                advanceStep(idx);
              }, 400);
            }, 600);
          }, 2000);
        });
      } else {
        schedule(() => {
          if (!playingRef.current) return;
          setAnimState('zooming-out');
          setZoomTransform('scale(1) translate(0%, 0%)');
          schedule(() => {
            if (!playingRef.current) return;
            setAnimState('transitioning');
            setShowTooltip(false);
            setImageOpacity(0);
            schedule(() => advanceStep(idx), 400);
          }, 600);
        }, 3000);
      }
    }, 2800);
  }, [steps, files, speak, schedule]);

  /* ── Advance ── */

  const advanceStep = useCallback((fromIdx: number) => {
    const nextIdx = fromIdx + 1;
    if (nextIdx >= steps.length) {
      setPlaying(false);
      setAnimState('idle');
      setShowTooltip(false);
      setZoomTransform('scale(1) translate(0%, 0%)');
      setImageOpacity(1);
      return;
    }
    setCurrentIndex(nextIdx);
    setImageOpacity(1);
    setZoomTransform('scale(1) translate(0%, 0%)');
    setAnimState('idle');

    // Kick off next step animation after brief pause for image load
    schedule(() => {
      if (playingRef.current) {
        runStepAnimation(nextIdx);
      }
    }, 200);
  }, [steps.length, schedule, runStepAnimation]);

  /* ── Play/Pause ── */

  // When user presses play but TTS isn't ready yet, defer playback
  useEffect(() => {
    if (playing && !ttsReady && ttsConfig?.provider === 'openai' && ttsConfig.available) {
      pendingPlayRef.current = true;
      return;
    }

    if (playing) {
      pendingPlayRef.current = false;
      clearAllTimeouts();
      cancelSpeech();
      // Small delay to let state settle
      const id = setTimeout(() => {
        runStepAnimation(currentIndexRef.current);
      }, 100);
      timeoutsRef.current.push(id);
    } else {
      pendingPlayRef.current = false;
      clearAllTimeouts();
      cancelSpeech();
      setAnimState('idle');
    }
  }, [playing, ttsReady, ttsConfig, clearAllTimeouts, cancelSpeech, runStepAnimation]);

  // When preload finishes and a play was pending, start playback
  useEffect(() => {
    if (ttsReady && pendingPlayRef.current && playingRef.current) {
      pendingPlayRef.current = false;
      clearAllTimeouts();
      cancelSpeech();
      const id = setTimeout(() => {
        runStepAnimation(currentIndexRef.current);
      }, 100);
      timeoutsRef.current.push(id);
    }
  }, [ttsReady, clearAllTimeouts, cancelSpeech, runStepAnimation]);

  /* ── Manual nav ── */

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= total) return;
    clearAllTimeouts();
    cancelSpeech();
    setCurrentIndex(idx);
    setZoomTransform('scale(1) translate(0%, 0%)');
    setImageOpacity(1);
    setShowTooltip(false);
    setCursorVisible(false);
    setAnimState('idle');

    if (playingRef.current) {
      schedule(() => runStepAnimation(idx), 300);
    }
  }, [total, clearAllTimeouts, cancelSpeech, schedule, runStepAnimation]);

  const goNext = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);
  const goPrev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  // Load voices (Chrome needs this)
  useEffect(() => {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.getVoices();
      speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices());
    }
  }, []);

  if (!step) return null;

  const text = getStepText(step);
  const clickPos = getClickPercent(step);
  const progress = total > 1 ? (currentIndex / (total - 1)) * 100 : 100;

  // Show preloading state
  const showPreloadingOverlay = ttsPreloading && !ttsReady && playing;

  return (
    <div className="flex flex-col">
      {/* Viewport — fixed aspect ratio to prevent layout jumps */}
      <div
        className="relative bg-black rounded-lg overflow-hidden"
        style={{ aspectRatio: '16 / 10' }}
      >
        {/* Preloading overlay */}
        {showPreloadingOverlay && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70">
            <div className="flex items-center gap-3 text-white text-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Preparing audio…</span>
            </div>
          </div>
        )}

        {stepType === 'screenshot' && hasImage ? (
          <div
            className="absolute inset-0"
            style={{
              transform: zoomTransform,
              transition: 'transform 900ms cubic-bezier(0.25, 0.1, 0.25, 1)',
              transformOrigin: 'center center',
              willChange: 'transform',
            }}
          >
            {/*
              Use a full-size container with the image set to object-contain.
              The cursor overlay wrapper uses identical sizing so percentage
              positions map correctly to the visible image area.
            */}
            <div className="w-full h-full p-4 relative" style={{ opacity: imageOpacity, transition: 'opacity 300ms ease' }}>
              <img
                src={`${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}/image/${step.step_number}`}
                alt={`Step ${currentIndex + 1}`}
                className="w-full h-full rounded-lg"
                style={{ objectFit: 'contain', objectPosition: 'center' }}
                onLoad={handleImageLoad}
                ref={imgElRef}
              />
              {/* Cursor overlay — positioned over the actual rendered image area */}
              {imgLayout && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: imgLayout.left,
                    top: imgLayout.top,
                    width: imgLayout.width,
                    height: imgLayout.height,
                  }}
                >
                  <CursorOverlay
                    x={cursorPos.x}
                    y={cursorPos.y}
                    visible={cursorVisible}
                    clicking={clicking}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Non-screenshot steps as text cards */
          <div className="flex items-center justify-center h-full px-8">
            {stepType === 'header' && (
              <h2 className="text-2xl font-bold text-white text-center">{step.content || step.description || 'Header'}</h2>
            )}
            {stepType === 'tip' && (
              <div className="bg-green-900/60 border-l-4 border-green-400 p-6 rounded-r-lg max-w-lg text-green-100">
                <strong>Tip:</strong> {step.content || step.description}
              </div>
            )}
            {stepType === 'alert' && (
              <div className="bg-amber-900/60 border-l-4 border-amber-400 p-6 rounded-r-lg max-w-lg text-amber-100">
                <strong>Alert:</strong> {step.content || step.description}
              </div>
            )}
          </div>
        )}

        {/* Tooltip */}
        {showTooltip && text && (
          <div
            className="absolute z-30 animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              maxWidth: '80%',
            }}
          >
            <div className="bg-gray-900/90 backdrop-blur text-white text-sm px-4 py-2 rounded-full shadow-lg whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
              {text}
            </div>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className={`flex items-center gap-2 ${compact ? 'mt-2 px-1' : 'mt-3 px-1'}`}>
        {/* Play/Pause */}
        <button
          onClick={() => setPlaying((p) => !p)}
          className="inline-flex items-center justify-center rounded-md w-8 h-8 hover:bg-muted transition-colors"
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>

        {/* Back */}
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="inline-flex items-center justify-center rounded-md w-8 h-8 hover:bg-muted transition-colors disabled:opacity-40"
          title="Previous step"
        >
          <SkipBack className="h-4 w-4" />
        </button>

        {/* Progress bar */}
        <div
          className="flex-1 h-1.5 bg-muted rounded-full cursor-pointer relative group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            const idx = Math.round(pct * (total - 1));
            goTo(Math.max(0, Math.min(idx, total - 1)));
          }}
        >
          <div
            className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
          <div className="absolute inset-y-0 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="h-full bg-primary/10 rounded-full" />
          </div>
        </div>

        {/* Forward */}
        <button
          onClick={goNext}
          disabled={currentIndex === total - 1}
          className="inline-flex items-center justify-center rounded-md w-8 h-8 hover:bg-muted transition-colors disabled:opacity-40"
          title="Next step"
        >
          <SkipForward className="h-4 w-4" />
        </button>

        {/* Step counter */}
        <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[4rem] text-center">
          {currentIndex + 1} / {total}
        </span>

        {/* Speed */}
        <div className="relative">
          <button
            onClick={() => setSpeedMenuOpen((o) => !o)}
            className="inline-flex items-center justify-center rounded-md px-1.5 h-8 text-xs font-medium hover:bg-muted transition-colors min-w-[2.5rem]"
          >
            {speed}x
          </button>
          {speedMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSpeedMenuOpen(false)} />
              <div className="absolute bottom-full right-0 mb-1 bg-popover border rounded-md shadow-md py-1 z-50 min-w-[3rem]">
                {[0.5, 1, 1.5, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSpeed(s); setSpeedMenuOpen(false); }}
                    className={`block w-full text-left px-3 py-1 text-xs hover:bg-muted ${speed === s ? 'font-bold text-primary' : ''}`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Mute */}
        <button
          onClick={() => {
            setMuted((m) => !m);
            if (!muted) cancelSpeech();
          }}
          className="inline-flex items-center justify-center rounded-md w-8 h-8 hover:bg-muted transition-colors"
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Step info below controls */}
      {text && !showTooltip && (
        <div className={`mt-2 rounded-lg border bg-card ${compact ? 'p-3' : 'p-4'}`}>
          <p className={compact ? 'text-sm' : 'text-base'}>{text}</p>
          {(step.text_typed || step.key_pressed) && (
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              {step.text_typed && <div>Text entered: <code className="bg-muted px-1 rounded">{step.text_typed}</code></div>}
              {step.key_pressed && <div>Key pressed: <code className="bg-muted px-1 rounded">{step.key_pressed}</code></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
