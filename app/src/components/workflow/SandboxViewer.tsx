/**
 * SandboxViewer — Interactive "Try it" mode using rrweb-snapshot rebuild().
 *
 * Fetches the rrweb-snapshot JSON and uses the library's own rebuild()
 * to reconstruct a real DOM inside a sandboxed iframe.
 * hackCss: true automatically converts :hover CSS rules to .\:hover class rules.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MousePointer2, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { rebuild, createCache, createMirror } from 'rrweb-snapshot';
import { getApiBaseUrl } from '@/lib/apiClient';

/* ── Scaled iframe viewport: renders at original size, CSS-scaled to fit ── */

function IframeViewport({
  iframeRef,
  loading,
  error,
  step,
  compact,
  currentIndex,
  isFullscreen,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  loading: boolean;
  error: string | null;
  step: SandboxStep;
  compact?: boolean;
  currentIndex: number;
  isFullscreen: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Original viewport from the recording
  const captureWidth = step.screenshot_size?.width || step.window_size?.width || 1440;
  const captureHeight = step.screenshot_size?.height || step.window_size?.height || 900;

  // Compute scale to fit container
  useEffect(() => {
    function updateScale() {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const newScale = isFullscreen ? 1 : Math.min(containerWidth / captureWidth, 1);
      setScale(newScale);
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [captureWidth, isFullscreen]);

  const scaledHeight = captureHeight * scale;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{ height: isFullscreen ? '100vh' : scaledHeight }}
    >
      <iframe
        ref={iframeRef}
        sandbox="allow-same-origin allow-scripts"
        className="border-0 origin-top-left"
        style={{
          width: captureWidth,
          height: captureHeight,
          transform: isFullscreen ? 'none' : `scale(${scale})`,
          transformOrigin: 'top left',
          display: loading || error ? 'none' : 'block',
        }}
        title={`Step ${currentIndex + 1}`}
      />
    </div>
  );
}

/* ── Types ── */

interface SandboxStep {
  step_number: number;
  step_type: string | null;
  action_type?: string | null;
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
  element_info?: {
    selector?: string | null;
    xpath?: string | null;
    testId?: string | null;
    tagName?: string | null;
    text?: string | null;
    elementRect?: { x: number; y: number; width: number; height: number } | null;
    [key: string]: unknown;
  } | null;
  has_dom_snapshot?: boolean;
}

interface SandboxViewerProps {
  steps: SandboxStep[];
  files: Record<string, string>;
  token: string;
  compact?: boolean;
  authenticated?: boolean;
  sessionId?: string;
}

/* ── Hover reanimation + click relay script ── */

const INJECT_SCRIPT = `
(function() {
  var HC = '\\\\:hover';
  function add(el) { while (el && el !== document.documentElement) { el.classList.add(HC); el = el.parentElement; } }
  function rem(el) { while (el && el !== document.documentElement) { el.classList.remove(HC); el = el.parentElement; } }
  document.addEventListener('mouseenter', function(e) { add(e.target); }, true);
  document.addEventListener('mouseleave', function(e) { rem(e.target); }, true);
  document.addEventListener('click', function(e) {
    e.preventDefault(); e.stopPropagation();
    window.parent.postMessage({ type: 'stept-sandbox-click', x: e.clientX, y: e.clientY }, '*');
  }, true);
  document.addEventListener('submit', function(e) { e.preventDefault(); e.stopPropagation(); }, true);
  // Hide noscript tags (scripts are disabled via sandbox)
  var s = document.createElement('style');
  s.textContent = 'noscript{display:none!important}';
  document.head.appendChild(s);
})();
`;

/* ── Component ── */

export function SandboxViewer({ steps, files, token, compact, authenticated, sessionId }: SandboxViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const baseUrl = getApiBaseUrl();

  const step = steps[currentIndex];
  const total = steps.length;
  const hasDomSnapshot = step?.has_dom_snapshot;

  const nextStep = currentIndex < total - 1 ? steps[currentIndex + 1] : null;

  /* ── Load snapshot into iframe via rebuild() ── */
  useEffect(() => {
    if (!step || !hasDomSnapshot || !iframeRef.current) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = authenticated && sessionId
      ? `${baseUrl}/process-recording/session/${sessionId}/dom-snapshot/${step.step_number}`
      : `${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}/dom-snapshot/${step.step_number}`;

    fetch(url, authenticated ? { credentials: 'include' } : {})
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(snapshot => {
        if (cancelled || !iframeRef.current) return;

        const iframe = iframeRef.current;
        const iframeDoc = iframe.contentDocument;
        if (!iframeDoc) {
          setError('Cannot access iframe document');
          setLoading(false);
          return;
        }

        // Clear the iframe
        iframeDoc.open();
        iframeDoc.write('<!DOCTYPE html><html><head></head><body></body></html>');
        iframeDoc.close();

        // Use rrweb-snapshot rebuild() to reconstruct DOM
        const mirror = createMirror();
        const cache = createCache();

        rebuild(snapshot, {
          doc: iframeDoc,
          hackCss: true,     // converts :hover to .\:hover automatically
          mirror,
          cache,
          onVisit: (_node: Node) => {
            // Could add per-node processing here if needed
          },
        });

        // Inject hover reanimation + click relay script
        const scriptEl = iframeDoc.createElement('script');
        scriptEl.textContent = INJECT_SCRIPT;
        iframeDoc.body.appendChild(scriptEl);

        // Highlight next click target
        if (nextStep?.element_info?.selector) {
          try {
            const target = iframeDoc.querySelector(nextStep.element_info.selector);
            if (target) {
              (target as HTMLElement).style.outline = '2px solid rgba(99, 102, 241, 0.7)';
              (target as HTMLElement).style.outlineOffset = '2px';
              (target as HTMLElement).style.transition = 'outline 0.3s ease';
            }
          } catch { /* selector may be invalid */ }
        }

        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(`Failed to load: ${err.message}`);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentIndex, step, hasDomSnapshot, baseUrl, token, authenticated, sessionId, nextStep]);

  /* ── Listen for clicks from iframe ── */
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type !== 'stept-sandbox-click') return;
      if (!nextStep) return;

      const nextPos = nextStep.screenshot_relative_position;
      const nextRect = nextStep.element_info?.elementRect;

      // Proximity check against element rect
      if (nextRect) {
        const margin = 40;
        if (
          e.data.x >= nextRect.x - margin && e.data.x <= nextRect.x + nextRect.width + margin &&
          e.data.y >= nextRect.y - margin && e.data.y <= nextRect.y + nextRect.height + margin
        ) {
          goTo(currentIndex + 1);
          return;
        }
      }

      // Proximity check against click position
      if (nextPos) {
        const dx = e.data.x - nextPos.x;
        const dy = e.data.y - nextPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 80) {
          goTo(currentIndex + 1);
          return;
        }
      }

      // Any click advances for now (better UX than showing error hints)
      goTo(currentIndex + 1);
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [currentIndex, nextStep]);

  /* ── Navigation ── */
  const goTo = useCallback((index: number) => {
    if (index >= 0 && index < total) setCurrentIndex(index);
  }, [total]);

  const goNext = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);
  const goPrev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  const toggleFullscreen = useCallback(() => {
    if (!viewerRef.current) return;
    if (!document.fullscreenElement) {
      viewerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  if (!step) return null;

  const hasImage = String(step.step_number) in files;
  const imageUrl = `${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}/image/${step.step_number}`;
  const descText = step.description || step.generated_description || step.generated_title || '';
  const progress = total > 1 ? (currentIndex / (total - 1)) * 100 : 100;

  return (
    <div ref={viewerRef} className={`flex flex-col ${isFullscreen ? 'bg-background p-4' : ''}`}>
      {/* Progress bar */}
      <div className="h-1 bg-muted rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main viewport */}
      <div className="relative bg-muted/30 rounded-lg overflow-hidden border" style={{ minHeight: compact ? 300 : 450 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* DOM Snapshot iframe — rendered at original viewport size, scaled to fit */}
        {hasDomSnapshot && (
          <IframeViewport
            iframeRef={iframeRef}
            loading={loading}
            error={error}
            step={step}
            compact={compact}
            currentIndex={currentIndex}
            isFullscreen={isFullscreen}
          />
        )}

        {/* Screenshot fallback */}
        {!hasDomSnapshot && hasImage && (
          <div className="p-4">
            <img
              src={imageUrl}
              alt={`Step ${currentIndex + 1}`}
              className="w-full rounded-lg"
            />
          </div>
        )}

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-2 right-2 z-20 p-1.5 rounded-md bg-background/80 border text-muted-foreground hover:text-foreground transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>

        {/* Hint toast */}
        {hint && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="bg-foreground text-background px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2">
              <MousePointer2 className="h-3.5 w-3.5" />
              {hint}
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      {(descText || step.text_typed) && (
        <div className={`mt-3 rounded-lg border bg-card ${compact ? 'p-3' : 'p-4'}`}>
          {descText && <p className={compact ? 'text-sm' : 'text-base'}>{descText}</p>}
          {step.text_typed && (
            <div className="mt-2 text-sm text-muted-foreground">
              Text entered: <code className="bg-muted px-1 rounded">{step.text_typed}</code>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
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
