import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiClient';

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

interface SlidesPlayerProps {
  steps: PublicStep[];
  files: Record<string, string>;
  token: string;
  compact?: boolean;
}

export function SlidesPlayer({ steps, files, token, compact }: SlidesPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);

  const baseUrl = getApiBaseUrl();
  const step = steps[currentIndex];
  const total = steps.length;

  const goTo = useCallback((index: number) => {
    if (index >= 0 && index < total) {
      setCurrentIndex(index);
      setFadeKey((k) => k + 1);
    }
  }, [total]);

  const goNext = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);
  const goPrev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  if (!step) return null;

  const stepType = step.step_type || 'screenshot';
  const hasImage = String(step.step_number) in files;
  const screenshotRel = step.screenshot_relative_position;
  const screenshotSize = step.screenshot_size ?? step.window_size;
  let circlePos: { x: number; y: number } | null = null;
  if (screenshotRel && screenshotSize) {
    circlePos = {
      x: (screenshotRel.x / screenshotSize.width) * 100,
      y: (screenshotRel.y / screenshotSize.height) * 100,
    };
  }

  // Compute visible step number (skip headers/tips/alerts)
  let visibleNum = 0;
  for (let i = 0; i <= currentIndex; i++) {
    const t = steps[i].step_type || 'screenshot';
    if (t === 'screenshot') visibleNum++;
  }

  const descText = step.description || step.generated_description || step.generated_title || step.content || step.window_title || '';

  return (
    <div className="flex flex-col">
      {/* Image area */}
      <div className="relative bg-muted/30 rounded-lg overflow-hidden">
        <div key={fadeKey} className="animate-in fade-in duration-300">
          {stepType === 'header' && (
            <div className={`flex items-center justify-center ${compact ? 'min-h-[200px]' : 'min-h-[300px]'}`}>
              <h2 className="text-xl font-semibold px-8 text-center">{step.content || step.description || 'Header'}</h2>
            </div>
          )}
          {stepType === 'tip' && (
            <div className={`flex items-center justify-center ${compact ? 'min-h-[200px]' : 'min-h-[300px]'}`}>
              <div className="bg-green-50 dark:bg-green-950 border-l-4 border-green-500 p-6 rounded-r-lg max-w-lg">
                <strong>Tip:</strong> {step.content || step.description}
              </div>
            </div>
          )}
          {stepType === 'alert' && (
            <div className={`flex items-center justify-center ${compact ? 'min-h-[200px]' : 'min-h-[300px]'}`}>
              <div className="bg-amber-50 dark:bg-amber-950 border-l-4 border-amber-500 p-6 rounded-r-lg max-w-lg">
                <strong>Alert:</strong> {step.content || step.description}
              </div>
            </div>
          )}
          {stepType === 'screenshot' && hasImage && (
            <div className="relative">
              <img
                src={`${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}/image/${step.step_number}`}
                alt={`Step ${visibleNum}`}
                className="w-full rounded-lg"
              />
              {circlePos && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${circlePos.x}%`,
                    top: `${circlePos.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="absolute -inset-4 rounded-full bg-primary/20 animate-pulse" />
                  <div className="relative h-8 w-8 rounded-full border-2 border-primary bg-primary/30">
                    <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
                  </div>
                </div>
              )}
            </div>
          )}
          {stepType === 'screenshot' && !hasImage && (
            <div className={`flex items-center justify-center ${compact ? 'min-h-[200px]' : 'min-h-[300px]'} text-muted-foreground`}>
              No screenshot available
            </div>
          )}
        </div>
      </div>

      {/* Description card */}
      {descText && (
        <div className={`mt-3 rounded-lg border bg-card ${compact ? 'p-3' : 'p-4'}`}>
          <p className={compact ? 'text-sm' : 'text-base'}>{descText}</p>
          {(step.text_typed || step.key_pressed) && (
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              {step.text_typed && <div>Text entered: <code className="bg-muted px-1 rounded">{step.text_typed}</code></div>}
              {step.key_pressed && <div>Key pressed: <code className="bg-muted px-1 rounded">{step.key_pressed}</code></div>}
            </div>
          )}
        </div>
      )}

      {/* Navigation controls */}
      <div className={`flex items-center justify-between ${compact ? 'mt-3' : 'mt-4'}`}>
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <span className="text-sm text-muted-foreground">
          Step {currentIndex + 1} of {total}
        </span>
        <button
          onClick={goNext}
          disabled={currentIndex === total - 1}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
