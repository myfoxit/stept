import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
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
  return step.description || step.generated_description || step.generated_title || step.content || step.window_title || '';
}

/* ── Component ── */

export function MoviePlayer({ steps, files, token, compact }: MoviePlayerProps) {
  const baseUrl = getApiBaseUrl();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
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

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const mutedRef = useRef(muted);
  const currentIndexRef = useRef(currentIndex);

  playingRef.current = playing;
  speedRef.current = speed;
  mutedRef.current = muted;
  currentIndexRef.current = currentIndex;

  const step = steps[currentIndex];
  const total = steps.length;
  const stepType = step?.step_type || 'screenshot';
  const hasImage = step ? String(step.step_number) in files : false;

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
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimeouts();
      cancelSpeech();
    };
  }, [clearAllTimeouts, cancelSpeech]);

  /* ── TTS ── */

  const speak = useCallback((text: string, onEnd: () => void) => {
    if (mutedRef.current || typeof speechSynthesis === 'undefined' || !isEnglish(text)) {
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

    // For non-screenshot steps, just show and wait
    if (sType !== 'screenshot' || !sHasImage) {
      setShowTooltip(true);
      setCursorVisible(false);
      setZoomTransform('scale(1) translate(0%, 0%)');

      schedule(() => {
        if (!playingRef.current) return;
        advanceStep(idx);
      }, 3000);
      return;
    }

    // Phase 1: Show image, start zoom
    setAnimState('zooming-in');
    setShowTooltip(false);
    setCursorVisible(false);
    setImageOpacity(1);

    if (clickPos) {
      // Zoom into click target
      const tx = -(clickPos.x - 50) * 0.6;
      const ty = -(clickPos.y - 50) * 0.6;
      schedule(() => {
        setZoomTransform(`scale(2.5) translate(${tx}%, ${ty}%)`);
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
    }, 700);

    // Phase 3: Click animation
    schedule(() => {
      if (!playingRef.current) return;
      setAnimState('clicking');
      setClicking(true);
    }, 1600);

    schedule(() => {
      setClicking(false);
    }, 1800);

    // Phase 4: Show tooltip and speak
    schedule(() => {
      if (!playingRef.current) return;
      setAnimState('speaking');
      setShowTooltip(true);

      if (text) {
        speak(text, () => {
          if (!playingRef.current) return;
          // Phase 5: Wait
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
              }, 350);
            }, 500);
          }, 1500);
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
            schedule(() => advanceStep(idx), 350);
          }, 500);
        }, 2000);
      }
    }, 2000);
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

  useEffect(() => {
    if (playing) {
      clearAllTimeouts();
      cancelSpeech();
      // Small delay to let state settle
      const id = setTimeout(() => {
        runStepAnimation(currentIndexRef.current);
      }, 100);
      timeoutsRef.current.push(id);
    } else {
      clearAllTimeouts();
      cancelSpeech();
      setAnimState('idle');
    }
  }, [playing, clearAllTimeouts, cancelSpeech, runStepAnimation]);

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

  return (
    <div className="flex flex-col">
      {/* Viewport */}
      <div className="relative bg-black rounded-lg overflow-hidden" style={{ minHeight: compact ? 200 : 300 }}>
        {stepType === 'screenshot' && hasImage ? (
          <div
            className="w-full"
            style={{
              transform: zoomTransform,
              transition: 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
              transformOrigin: 'center center',
              willChange: 'transform',
            }}
          >
            <div style={{ opacity: imageOpacity, transition: 'opacity 300ms ease' }}>
              <img
                src={`${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}/image/${step.step_number}`}
                alt={`Step ${currentIndex + 1}`}
                className="w-full block"
              />
              {/* Cursor overlay */}
              <CursorOverlay
                x={cursorPos.x}
                y={cursorPos.y}
                visible={cursorVisible}
                clicking={clicking}
              />
            </div>
          </div>
        ) : (
          /* Non-screenshot steps as text cards */
          <div className="flex items-center justify-center min-h-[300px] px-8">
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
