/**
 * SandboxViewer — Interactive "Try it" mode for workflow replay.
 *
 * For web recordings (has DOM snapshots):
 *   Renders rrweb-snapshot JSON in a sandboxed iframe with:
 *   - Live hover states (CSS :hover rules reanimated via JS)
 *   - Click target detection (next step's element highlighted)
 *   - Smooth transitions between steps
 *
 * For desktop recordings (screenshots only):
 *   Smart screenshot replay with proximity-based click detection.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MousePointer2, Loader2 } from 'lucide-react';
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
  /** If true, use authenticated endpoints instead of public */
  authenticated?: boolean;
  sessionId?: string;
}

/* ── Hover reanimation script injected into the iframe ── */

const HOVER_SCRIPT = `
<script>
(function() {
  // rrweb-snapshot hackCss converts :hover to .\\:hover
  // We add/remove this class on mouseenter/mouseleave to reanimate hover states
  var HOVER_CLASS = '\\\\:hover';

  function addHoverClass(el) {
    while (el && el !== document.documentElement) {
      el.classList.add(HOVER_CLASS);
      el = el.parentElement;
    }
  }

  function removeHoverClass(el) {
    while (el && el !== document.documentElement) {
      el.classList.remove(HOVER_CLASS);
      el = el.parentElement;
    }
  }

  document.addEventListener('mouseenter', function(e) {
    addHoverClass(e.target);
  }, true);

  document.addEventListener('mouseleave', function(e) {
    removeHoverClass(e.target);
  }, true);

  // Disable all links and form submissions
  document.addEventListener('click', function(e) {
    var target = e.target;
    var link = target.closest ? target.closest('a') : null;
    if (link) { e.preventDefault(); e.stopPropagation(); }
    var form = target.closest ? target.closest('form') : null;
    if (form) { e.preventDefault(); e.stopPropagation(); }
    // Notify parent about the click position
    window.parent.postMessage({
      type: 'stept-sandbox-click',
      x: e.clientX,
      y: e.clientY,
      selector: buildSelector(target),
    }, '*');
  }, true);

  document.addEventListener('submit', function(e) {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Build a simple selector for click matching
  function buildSelector(el) {
    if (!el || !el.tagName) return null;
    if (el.id) return '#' + el.id;
    var tag = el.tagName.toLowerCase();
    if (el.getAttribute('data-testid')) return tag + '[data-testid="' + el.getAttribute('data-testid') + '"]';
    if (el.getAttribute('aria-label')) return tag + '[aria-label="' + el.getAttribute('aria-label') + '"]';
    return tag + (el.className ? '.' + el.className.split(' ').filter(Boolean).slice(0,2).join('.') : '');
  }

  // Highlight the click target
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'stept-highlight-target') return;
    // Remove old highlights
    var old = document.querySelectorAll('[data-stept-highlight]');
    old.forEach(function(el) { el.removeAttribute('data-stept-highlight'); el.style.outline = ''; el.style.outlineOffset = ''; });

    var selector = e.data.selector;
    if (!selector) return;
    try {
      var el = document.querySelector(selector);
      if (el) {
        el.setAttribute('data-stept-highlight', 'true');
        el.style.outline = '2px solid rgba(99, 102, 241, 0.7)';
        el.style.outlineOffset = '2px';
        el.style.transition = 'outline 0.2s ease';
      }
    } catch(err) {}
  });
})();
</script>
`;

/* ── rrweb-snapshot rebuild (simplified for iframe injection) ── */

/**
 * Instead of importing rrweb-snapshot's rebuild(), we take the snapshot JSON
 * and reconstruct it as an HTML string that can be injected via srcdoc.
 * This is simpler and avoids needing the full rrweb library in the frontend.
 */
function snapshotToHtml(snapshot: any): string {
  if (!snapshot) return '<html><body><p>No snapshot data</p></body></html>';

  // rrweb-snapshot output is a tree: { type, tagName, attributes, childNodes, ... }
  function renderNode(node: any): string {
    if (!node) return '';

    // Document node
    if (node.type === 0) {
      return node.childNodes?.map(renderNode).join('') || '';
    }

    // DocumentType
    if (node.type === 1) {
      return `<!DOCTYPE ${node.name || 'html'}>`;
    }

    // Text node
    if (node.type === 3) {
      // Style content with hackCss (hover → .\:hover class)
      if (node.isStyle && node.textContent) {
        return hackCssHover(node.textContent);
      }
      return escapeHtml(node.textContent || '');
    }

    // Comment
    if (node.type === 5) {
      return `<!--${node.textContent || ''}-->`;
    }

    // CDATA
    if (node.type === 4) {
      return `<![CDATA[${node.textContent || ''}]]>`;
    }

    // Element node (type === 2)
    if (node.type === 2) {
      let tag = node.tagName || 'div';

      // Skip script tags for security
      if (tag === 'noscript' && node.attributes?._cssText) tag = 'style';
      if (tag === 'script') return '';

      const attrs = node.attributes || {};
      let attrStr = '';

      for (const [key, value] of Object.entries(attrs)) {
        if (key.startsWith('rr_')) continue; // skip rrweb internal attrs
        if (key === '_cssText') {
          // This is an inlined stylesheet — render as style content
          if (tag === 'style' || tag === 'link') {
            tag = 'style';
            const cssContent = hackCssHover(String(value));
            const children = node.childNodes?.map(renderNode).join('') || '';
            return `<style${attrStr}>${cssContent}${children}</style>`;
          }
          continue;
        }
        // Strip event handlers (rrweb prefixes them with _)
        if (key.startsWith('_on')) continue;
        if (key === 'onload' || key === 'onclick' || key.startsWith('on')) continue;

        const safeVal = String(value).replace(/"/g, '&quot;');
        attrStr += ` ${key}="${safeVal}"`;
      }

      // Void elements
      const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
      if (voidTags.has(tag)) {
        return `<${tag}${attrStr}>`;
      }

      const children = node.childNodes?.map(renderNode).join('') || '';

      // Handle _cssText for style elements
      if (tag === 'style' && attrs._cssText) {
        return `<style${attrStr}>${hackCssHover(String(attrs._cssText))}${children}</style>`;
      }

      return `<${tag}${attrStr}>${children}</${tag}>`;
    }

    return '';
  }

  // Convert :hover CSS rules to also match .\:hover class (rrweb pattern)
  function hackCssHover(css: string): string {
    if (!css.includes(':hover')) return css;
    // For each rule with :hover, duplicate it with .\:hover
    return css.replace(
      /([^{}]*):hover([^{]*)\{/g,
      (match, before, after) => {
        const hoverClass = `${before}.\\:hover${after}{`;
        return `${match}\n${hoverClass}`;
      }
    );
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  let html = renderNode(snapshot);

  // Inject hover reanimation script + CSP that blocks external scripts but allows our inline one
  html = html.replace(
    '</head>',
    `<meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline'; default-src * data: blob: 'unsafe-inline';">
    <style>
      * { cursor: default !important; }
      [data-stept-highlight] { outline: 2px solid rgba(99, 102, 241, 0.7) !important; outline-offset: 2px !important; }
      body { overflow: auto; }
    </style>
    ${HOVER_SCRIPT}
    </head>`
  );

  return html;
}

/* ── Main Component ── */

export function SandboxViewer({ steps, files, token, compact, authenticated, sessionId }: SandboxViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [snapshotHtml, setSnapshotHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const baseUrl = getApiBaseUrl();

  const step = steps[currentIndex];
  const total = steps.length;
  const hasDomSnapshot = step?.has_dom_snapshot;

  // Determine next step's click target for highlighting
  const nextStep = currentIndex < total - 1 ? steps[currentIndex + 1] : null;
  const nextClickTarget = nextStep?.element_info?.selector || null;

  /* ── Fetch DOM snapshot ── */
  useEffect(() => {
    if (!step || !hasDomSnapshot) {
      setSnapshotHtml(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = authenticated && sessionId
      ? `${baseUrl}/process-recording/session/${sessionId}/dom-snapshot/${step.step_number}`
      : `${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}/dom-snapshot/${step.step_number}`;

    fetch(url, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(snapshot => {
        if (cancelled) return;
        const html = snapshotToHtml(snapshot);
        setSnapshotHtml(html);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(`Failed to load snapshot: ${err.message}`);
        setSnapshotHtml(null);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentIndex, step, hasDomSnapshot, baseUrl, token, authenticated, sessionId]);

  /* ── Highlight next click target in iframe ── */
  useEffect(() => {
    if (!iframeRef.current?.contentWindow || !nextClickTarget) return;
    // Wait a tick for iframe to render
    const timer = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage({
        type: 'stept-highlight-target',
        selector: nextClickTarget,
      }, '*');
    }, 200);
    return () => clearTimeout(timer);
  }, [snapshotHtml, nextClickTarget]);

  /* ── Listen for clicks from iframe ── */
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type !== 'stept-sandbox-click') return;

      // Check if click is near the next step's target
      if (!nextStep) return;

      const nextEi = nextStep.element_info;
      const nextRect = nextEi?.elementRect;
      const nextPos = nextStep.screenshot_relative_position;

      // Strategy 1: selector match
      if (nextEi?.selector && e.data.selector) {
        // Loose match: check if clicked selector contains the target selector parts
        const clickedSel = String(e.data.selector).toLowerCase();
        const targetSel = String(nextEi.selector).toLowerCase();
        if (clickedSel === targetSel || clickedSel.includes(targetSel.split(' ').pop() || '')) {
          goTo(currentIndex + 1);
          return;
        }
      }

      // Strategy 2: proximity to element rect
      if (nextRect) {
        const cx = e.data.x;
        const cy = e.data.y;
        const margin = 40; // px tolerance
        if (
          cx >= nextRect.x - margin && cx <= nextRect.x + nextRect.width + margin &&
          cy >= nextRect.y - margin && cy <= nextRect.y + nextRect.height + margin
        ) {
          goTo(currentIndex + 1);
          return;
        }
      }

      // Strategy 3: proximity to click position
      if (nextPos) {
        const dx = e.data.x - nextPos.x;
        const dy = e.data.y - nextPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 60) {
          goTo(currentIndex + 1);
          return;
        }
      }

      // Click wasn't near the target — show a gentle hint
      showHint();
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

  /* ── Keyboard nav ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  /* ── Hint toast ── */
  const [hint, setHint] = useState<string | null>(null);
  const showHint = useCallback(() => {
    const nextDesc = nextStep?.description || nextStep?.generated_title || 'the highlighted element';
    setHint(`Try clicking ${nextDesc}`);
    setTimeout(() => setHint(null), 2500);
  }, [nextStep]);

  if (!step) return null;

  const hasImage = String(step.step_number) in files;
  const imageUrl = `${baseUrl.replace('/api/v1', '')}/api/v1/public/workflow/${token}/image/${step.step_number}`;
  const descText = step.description || step.generated_description || step.generated_title || '';
  const progress = total > 1 ? ((currentIndex) / (total - 1)) * 100 : 100;

  return (
    <div className="flex flex-col">
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

        {/* DOM Snapshot iframe (HTML sandbox) */}
        {hasDomSnapshot && snapshotHtml && !loading && (
          <iframe
            ref={iframeRef}
            srcDoc={snapshotHtml}
            sandbox="allow-same-origin allow-scripts"
            className="w-full border-0"
            style={{ height: compact ? 400 : 600 }}
            title={`Step ${currentIndex + 1}`}
          />
        )}

        {/* Screenshot fallback (desktop or no snapshot) */}
        {(!hasDomSnapshot || (!snapshotHtml && !loading)) && hasImage && (
          <div className="p-4">
            <div className="relative w-full">
              <img
                src={imageUrl}
                alt={`Step ${currentIndex + 1}`}
                className="w-full rounded-lg"
              />
              {/* Click target highlight for screenshot mode */}
              {nextStep?.screenshot_relative_position && nextStep?.screenshot_size && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${(nextStep.screenshot_relative_position.x / nextStep.screenshot_size.width) * 100}%`,
                    top: `${(nextStep.screenshot_relative_position.y / nextStep.screenshot_size.height) * 100}%`,
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
          </div>
        )}

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

      {/* Description + typing info */}
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
