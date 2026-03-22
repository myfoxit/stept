/**
 * SandboxViewer — Interactive "Try it" mode.
 * Full-bleed viewport, Storylane-style step bar + tooltip.
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
  element_info?: { selector?: string | null; elementRect?: { x: number; y: number; width: number; height: number } | null; [k: string]: unknown } | null;
  has_dom_snapshot?: boolean;
}

interface Props {
  steps: SandboxStep[];
  files: Record<string, string>;
  token: string;
  compact?: boolean;
  authenticated?: boolean;
  sessionId?: string;
}

/* ── Hover + click relay script injected into iframe ── */
const INJECT_SCRIPT = `(function(){
  var HC='\\\\:hover';
  function a(e){while(e&&e!==document.documentElement){if(e.classList)try{e.classList.add(HC)}catch(x){}e=e.parentElement}}
  function r(e){while(e&&e!==document.documentElement){if(e.classList)try{e.classList.remove(HC)}catch(x){}e=e.parentElement}}
  document.addEventListener('mouseenter',function(e){a(e.target)},true);
  document.addEventListener('mouseleave',function(e){r(e.target)},true);
  document.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();window.parent.postMessage({type:'stept-sandbox-click',x:e.clientX,y:e.clientY},'*')},true);
  document.addEventListener('submit',function(e){e.preventDefault();e.stopPropagation()},true);
  var s=document.createElement('style');s.textContent='noscript{display:none!important}';document.head.appendChild(s);
})()`;

/* ── Hotspot HTML + CSS ── */
function injectHotspot(doc: Document, x: number, y: number) {
  const el = doc.createElement('div');
  el.innerHTML = `
    <div style="position:absolute;inset:-20px;border-radius:50%;background:rgba(239,68,68,0.15);animation:sp 2s cubic-bezier(0,0,0.2,1) infinite"></div>
    <div style="position:absolute;inset:-10px;border-radius:50%;background:rgba(239,68,68,0.2);animation:sb 1.5s ease-in-out infinite"></div>
    <div style="position:relative;width:36px;height:36px;border-radius:50%;border:3px solid #ef4444;background:rgba(239,68,68,0.25);box-shadow:0 0 16px 4px rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center">
      <div style="width:10px;height:10px;border-radius:50%;background:#ef4444"></div>
    </div>`;
  el.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);z-index:100000;pointer-events:none;`;
  const style = doc.createElement('style');
  style.textContent = '@keyframes sb{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}@keyframes sp{75%,100%{transform:scale(3);opacity:0}}';
  doc.head.appendChild(style);
  doc.body.appendChild(el);
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
}

/* ── Component ── */
export function SandboxViewer({ steps, files, token, authenticated, sessionId }: Props) {
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fs, setFs] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const base = getApiBaseUrl();

  // Filter out Navigate steps — merge into following step's description
  const visualSteps = React.useMemo(() => {
    const result: (SandboxStep & { navPrefix?: string })[] = [];
    let pendingNav: string | null = null;
    for (const s of steps) {
      const isNav = (s.action_type || '').toLowerCase() === 'navigate' || (s.step_type || '').toLowerCase() === 'navigate';
      if (isNav) {
        pendingNav = s.description || s.window_title || 'Navigate';
      } else {
        result.push({ ...s, navPrefix: pendingNav || undefined });
        pendingNav = null;
      }
    }
    return result;
  }, [steps]);

  const vStep = visualSteps[idx];
  const vNext = idx < visualSteps.length - 1 ? visualSteps[idx + 1] : null;
  const vTotal = visualSteps.length;

  const go = useCallback((i: number) => { if (i >= 0 && i < vTotal) setIdx(i); }, [vTotal]);

  const imgUrl = (sn: number) => `${base.replace('/api/v1', '')}/api/v1/public/workflow/${token}/image/${sn}`;
  const hasDom = vStep?.has_dom_snapshot;
  const capW = vStep?.screenshot_size?.width || vStep?.window_size?.width || 1440;
  const capH = vStep?.screenshot_size?.height || vStep?.window_size?.height || 900;

  /* ── Load DOM snapshot ── */
  useEffect(() => {
    if (!vStep || !hasDom || !iframeRef.current) return;
    let cancelled = false;
    setLoading(true); setError(null);

    const url = authenticated && sessionId
      ? `${base}/process-recording/session/${sessionId}/dom-snapshot/${vStep.step_number}`
      : `${base.replace('/api/v1', '')}/api/v1/public/workflow/${token}/dom-snapshot/${vStep.step_number}`;

    fetch(url, authenticated ? { credentials: 'include' } : {})
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(snap => {
        if (cancelled || !iframeRef.current) return;
        const doc = iframeRef.current.contentDocument!;
        doc.open(); doc.write('<!DOCTYPE html><html><head></head><body></body></html>'); doc.close();
        rebuild(snap, { doc, hackCss: true, mirror: createMirror(), cache: createCache() });
        const s = doc.createElement('script'); s.textContent = INJECT_SCRIPT; doc.body.appendChild(s);
        const np = vNext?.screenshot_relative_position;
        if (np) injectHotspot(doc, np.x, np.y);
        setLoading(false);
      })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });

    return () => { cancelled = true; };
  }, [idx, vStep, hasDom, base, token, authenticated, sessionId, vNext]);

  /* ── Click detection ── */
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.type !== 'stept-sandbox-click' || !vNext) return;
      const np = vNext.screenshot_relative_position;
      const nr = vNext.element_info?.elementRect;
      // Check element rect
      if (nr) { const m=50; if (e.data.x>=nr.x-m&&e.data.x<=nr.x+nr.width+m&&e.data.y>=nr.y-m&&e.data.y<=nr.y+nr.height+m) { go(idx+1); return; } }
      // Check click position
      if (np) { const d=Math.hypot(e.data.x-np.x,e.data.y-np.y); if (d<100) { go(idx+1); return; } }
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [idx, vNext, go]);

  /* ── Keys ── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key==='ArrowRight') { e.preventDefault(); go(idx+1); }
      if (e.key==='ArrowLeft') { e.preventDefault(); go(idx-1); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [go, idx]);

  /* ── Fullscreen ── */
  const toggleFs = useCallback(() => {
    if (!viewerRef.current) return;
    document.fullscreenElement ? document.exitFullscreen() : viewerRef.current.requestFullscreen();
  }, []);
  useEffect(() => { const h=()=>setFs(!!document.fullscreenElement); document.addEventListener('fullscreenchange',h); return ()=>document.removeEventListener('fullscreenchange',h); }, []);

  if (!vStep) return null;

  const hasImg = String(vStep.step_number) in files;
  const rawDesc = vNext?.description || vNext?.generated_title || '';
  const desc = vNext?.navPrefix ? `${vNext.navPrefix} → ${rawDesc}` : rawDesc;
  const pct = vTotal > 1 ? (idx / (vTotal - 1)) * 100 : 100;

  return (
    <div ref={viewerRef} className={`relative ${fs ? 'bg-white dark:bg-zinc-950' : ''}`} style={{ minHeight: fs ? '100vh' : undefined }}>
      {/* Viewport container — near full viewport height */}
      <div className="relative overflow-hidden rounded-lg border" style={{ height: fs ? 'calc(100vh - 48px)' : 'calc(100vh - 120px)' }}>

        {/* Loading spinner */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-white/60 dark:bg-zinc-950/60">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}

        {/* Error */}
        {error && <div className="absolute inset-0 flex items-center justify-center z-20"><p className="text-sm text-destructive">{error}</p></div>}

        {/* ── DOM snapshot iframe ── */}
        {hasDom && (
          <iframe
            ref={iframeRef}
            sandbox="allow-same-origin allow-scripts"
            className="border-0 origin-top-left absolute top-0 left-0"
            style={{
              width: capW,
              height: capH,
              transform: `scale(${fs ? 1 : Math.min((typeof window !== 'undefined' ? viewerRef.current?.clientWidth || window.innerWidth : 1200) / capW, 1)})`,
              transformOrigin: 'top left',
              display: loading ? 'none' : 'block',
            }}
            title="Interactive demo"
          />
        )}

        {/* ── Screenshot fallback (no DOM snapshot) ── */}
        {!hasDom && hasImg && (
          <div className="w-full h-full relative">
            <img
              src={imgUrl(vStep.step_number)}
              alt={`Step ${idx + 1}`}
              className="w-full h-full object-contain"
            />
            {vNext?.screenshot_relative_position && vNext?.screenshot_size && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${(vNext.screenshot_relative_position.x / vNext.screenshot_size.width) * 100}%`,
                  top: `${(vNext.screenshot_relative_position.y / vNext.screenshot_size.height) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="absolute -inset-5 rounded-full bg-red-500/15 animate-ping" style={{ animationDuration: '2s' }} />
                <div className="absolute -inset-2.5 rounded-full bg-red-500/20 animate-pulse" />
                <div className="relative h-9 w-9 rounded-full border-[3px] border-red-500 bg-red-500/25 shadow-[0_0_16px_4px_rgba(239,68,68,0.4)] flex items-center justify-center">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFs}
          className="absolute top-3 right-3 z-30 p-2 rounded-lg bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors backdrop-blur-sm"
        >
          {fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>

        {/* Tooltip near the click target */}
        {desc && !loading && (() => {
          const np = vNext?.screenshot_relative_position;
          const ns = vNext?.screenshot_size || vNext?.window_size;
          if (!np || !ns?.width || !ns?.height) return null;
          // Convert click position to percentage
          const xPct = (np.x / ns.width) * 100;
          const yPct = (np.y / ns.height) * 100;
          // Position tooltip: to the right of hotspot if space, otherwise left
          const tooltipLeft = xPct < 60;
          return (
            <div
              className="absolute z-30 max-w-xs animate-in fade-in duration-300 pointer-events-none"
              style={{
                top: `${Math.max(5, Math.min(yPct - 5, 75))}%`,
                ...(tooltipLeft
                  ? { left: `${Math.min(xPct + 5, 70)}%` }
                  : { right: `${Math.min(100 - xPct + 5, 70)}%` }),
              }}
            >
              <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl border-2 border-dashed border-red-300 dark:border-red-700 px-4 py-3">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{desc}</p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Bottom step bar — outside the viewport, always visible ── */}
      <div className={`flex items-center gap-3 px-1 ${fs ? 'py-3' : 'pt-3'}`}>
        <span className="flex-shrink-0 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold px-3 py-1 rounded-full">
          Step {idx + 1}
        </span>
        <div className="flex-1 flex gap-1">
          {visualSteps.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              className="flex-1 h-1.5 rounded-full transition-colors cursor-pointer"
              style={{ background: i <= idx ? 'var(--color-primary, #6366f1)' : 'var(--color-muted, #e5e7eb)' }}
              title={`Step ${i + 1}`}
            />
          ))}
        </div>
        <span className="flex-shrink-0 text-xs text-muted-foreground">
          {vTotal} steps
        </span>
      </div>
    </div>
  );
}
