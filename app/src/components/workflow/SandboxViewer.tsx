/**
 * SandboxViewer — Interactive "Try it" mode using rrweb-snapshot rebuild().
 * Storylane-style: full-width viewport, tooltip near click target, bottom step indicator.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { rebuild, createCache, createMirror } from 'rrweb-snapshot';
import { getApiBaseUrl } from '@/lib/apiClient';

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

/* ── Script injected into iframe ── */

const INJECT_SCRIPT = `
(function() {
  var HC = '\\\\:hover';
  function add(el) {
    while (el && el !== document.documentElement) {
      if (el.classList) try { el.classList.add(HC); } catch(e) {}
      el = el.parentElement;
    }
  }
  function rem(el) {
    while (el && el !== document.documentElement) {
      if (el.classList) try { el.classList.remove(HC); } catch(e) {}
      el = el.parentElement;
    }
  }
  document.addEventListener('mouseenter', function(e) { add(e.target); }, true);
  document.addEventListener('mouseleave', function(e) { rem(e.target); }, true);
  document.addEventListener('click', function(e) {
    e.preventDefault(); e.stopPropagation();
    window.parent.postMessage({ type: 'stept-sandbox-click', x: e.clientX, y: e.clientY }, '*');
  }, true);
  document.addEventListener('submit', function(e) { e.preventDefault(); e.stopPropagation(); }, true);
  var s = document.createElement('style');
  s.textContent = 'noscript{display:none!important}';
  document.head.appendChild(s);
})();
`;

/* ── Scaled iframe viewport ── */

function IframeViewport({
  iframeRef,
  loading,
  step,
  isFullscreen,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  loading: boolean;
  step: SandboxStep;
  isFullscreen: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const captureWidth = step.screenshot_size?.width || step.window_size?.width || 1440;
  const captureHeight = step.screenshot_size?.height || step.window_size?.height || 900;

  useEffect(() => {
    function updateScale() {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      setScale(isFullscreen ? 1 : Math.min(containerWidth / captureWidth, 1));
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [captureWidth, isFullscreen]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{ height: isFullscreen ? '100vh' : captureHeight * scale }}
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
          display: loading ? 'none' : 'block',
        }}
        title="Interactive demo"
      />
    </div>
  );
}

/* ── Main Component ── */

export function SandboxViewer({ steps, files, token, compact, authenticated, sessionId }: SandboxViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const baseUrl = getApiBaseUrl();

  const step = steps[currentIndex];
  const total = steps.length;
  const hasDomSnapshot = step?.has_dom_snapshot;
  const nextStep = currentIndex < total - 1 ? steps[currentIndex + 1] : null;

  /* ── Navigation ── */
  const goTo = useCallback((index: number) => {
    if (index >= 0 && index < total) setCurrentIndex(index);
  }, [total]);

  /* ── Load snapshot into iframe ── */
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

        const iframeDoc = iframeRef.current.contentDocument;
        if (!iframeDoc) { setError('Cannot access iframe'); setLoading(false); return; }

        iframeDoc.open();
        iframeDoc.write('<!DOCTYPE html><html><head></head><body></body></html>');
        iframeDoc.close();

        rebuild(snapshot, {
          doc: iframeDoc,
          hackCss: true,
          mirror: createMirror(),
          cache: createCache(),
        });

        // Inject hover + click relay
        const scriptEl = iframeDoc.createElement('script');
        scriptEl.textContent = INJECT_SCRIPT;
        iframeDoc.body.appendChild(scriptEl);

        // Place hotspot at next step's click position
        const nextPos = nextStep?.screenshot_relative_position;
        if (nextPos) {
          const hotspot = iframeDoc.createElement('div');
          hotspot.id = 'stept-hotspot';
          hotspot.innerHTML = `
            <div style="position:absolute;inset:-20px;border-radius:50%;background:rgba(239,68,68,0.15);animation:stept-ping 2s cubic-bezier(0,0,0.2,1) infinite"></div>
            <div style="position:absolute;inset:-10px;border-radius:50%;background:rgba(239,68,68,0.2);animation:stept-pulse 1.5s ease-in-out infinite"></div>
            <div style="position:relative;width:36px;height:36px;border-radius:50%;border:3px solid rgba(239,68,68,1);background:rgba(239,68,68,0.25);box-shadow:0 0 16px 4px rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center">
              <div style="width:10px;height:10px;border-radius:50%;background:rgba(239,68,68,1)"></div>
            </div>
          `;
          hotspot.style.cssText = `position:absolute;left:${nextPos.x}px;top:${nextPos.y}px;transform:translate(-50%,-50%);z-index:100000;pointer-events:none;`;

          const style = iframeDoc.createElement('style');
          style.textContent = `
            @keyframes stept-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(1.4); } }
            @keyframes stept-ping { 75%,100% { transform:scale(3); opacity:0; } }
          `;
          iframeDoc.head.appendChild(style);
          iframeDoc.body.appendChild(hotspot);
          setTimeout(() => hotspot.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }

        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentIndex, step, hasDomSnapshot, baseUrl, token, authenticated, sessionId, nextStep]);

  /* ── Click detection ── */
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type !== 'stept-sandbox-click' || !nextStep) return;

      const nextSel = nextStep.element_info?.selector;
      const nextPos = nextStep.screenshot_relative_position;
      const nextRect = nextStep.element_info?.elementRect;

      if (nextSel && iframeRef.current?.contentDocument) {
        try {
          const target = iframeRef.current.contentDocument.querySelector(nextSel);
          if (target) {
            const rect = target.getBoundingClientRect();
            const m = 30;
            if (e.data.x >= rect.left - m && e.data.x <= rect.right + m &&
                e.data.y >= rect.top - m && e.data.y <= rect.bottom + m) {
              goTo(currentIndex + 1); return;
            }
          }
        } catch {}
      }

      if (nextRect) {
        const m = 50;
        if (e.data.x >= nextRect.x - m && e.data.x <= nextRect.x + nextRect.width + m &&
            e.data.y >= nextRect.y - m && e.data.y <= nextRect.y + nextRect.height + m) {
          goTo(currentIndex + 1); return;
        }
      }

      if (nextPos) {
        const dx = e.data.x - nextPos.x, dy = e.data.y - nextPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 100) {
          goTo(currentIndex + 1); return;
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [currentIndex, nextStep, goTo]);

  /* ── Keyboard nav ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(currentIndex + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(currentIndex - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, currentIndex]);

  /* ── Fullscreen ── */
  const toggleFullscreen = useCallback(() => {
    if (!viewerRef.current) return;
    if (!document.fullscreenElement) {
      viewerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  if (!step) return null;

  const hasImage = String(step.step_number) in files;
  const imageUrl = `${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}/image/${step.step_number}`;
  const descText = nextStep?.description || nextStep?.generated_title || nextStep?.generated_description || '';
  const progress = total > 1 ? ((currentIndex) / (total - 1)) * 100 : 100;

  return (
    <div ref={viewerRef} className={`flex flex-col ${isFullscreen ? 'bg-black' : ''}`}>
      {/* Main viewport — taller than other modes */}
      <div className="relative rounded-lg overflow-hidden border bg-muted/20" style={{ minHeight: isFullscreen ? '100vh' : 700 }}>
        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 z-30 p-2 rounded-lg bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-20">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <p className="text-sm text-destructive bg-background/80 px-4 py-2 rounded-lg">{error}</p>
          </div>
        )}

        {/* DOM Snapshot iframe */}
        {hasDomSnapshot && (
          <IframeViewport
            iframeRef={iframeRef}
            loading={loading}
            step={step}
            isFullscreen={isFullscreen}
          />
        )}

        {/* Screenshot fallback */}
        {!hasDomSnapshot && hasImage && (
          <div className="flex items-center justify-center p-4" style={{ minHeight: 600 }}>
            <img src={imageUrl} alt={`Step ${currentIndex + 1}`} className="max-w-full max-h-[600px] rounded-lg shadow-lg" />
          </div>
        )}

        {/* Tooltip near click target — Storylane style */}
        {descText && !loading && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 px-5 py-4">
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{descText}</p>
            </div>
          </div>
        )}

        {/* Bottom step indicator — Storylane style */}
        <div className="absolute bottom-0 left-0 right-0 z-30 px-6 pb-4 pt-8 bg-gradient-to-t from-black/40 to-transparent">
          <div className="flex items-center gap-3">
            {/* Step badge */}
            <span className="flex-shrink-0 bg-black/70 text-white text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm">
              Step {currentIndex + 1}
            </span>

            {/* Progress bar */}
            <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Step count */}
            <span className="flex-shrink-0 text-white/60 text-xs font-medium">
              {total} steps
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
