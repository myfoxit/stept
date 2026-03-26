import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setState, getState } from './store';
import { ElementFinder } from './element-finder';

// ── Deduplication ───────────────────────────────────────────
const DEDUP_EVENT = `stept_guide_remove_${chrome.runtime.id}`;

interface SteptWindow extends Window {
  __steptGuideLoaded?: boolean;
  __steptGuideOverlay?: HTMLElement;
}
const _window = window as unknown as SteptWindow;

function cleanup(): void {
  if (_window.__steptGuideOverlay) {
    _window.__steptGuideOverlay.remove();
    _window.__steptGuideOverlay = undefined;
  }
}

document.dispatchEvent(new CustomEvent(DEDUP_EVENT));
document.addEventListener(DEDUP_EVENT, cleanup);
cleanup();
_window.__steptGuideLoaded = true;

// ── Iframe: only handle frame-level element search ──────────
if (window !== window.top) {
  chrome.runtime.onMessage.addListener((message: { type: string; step?: any }, _sender, sendResponse) => {
    if (message.type !== 'GUIDE_FIND_IN_FRAME' || !message.step) return false;
    const found = ElementFinder.find(message.step);
    if (!found?.element) {
      sendResponse({ found: false });
      return false;
    }
    const rect = found.element.getBoundingClientRect();
    sendResponse({
      found: true,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      confidence: found.confidence,
      method: found.method,
    });
    return false;
  });
} else {
  // ── Top frame: mount React overlay in Shadow DOM ──────────

  const OVERLAY_STYLES = `
    :host { all: initial; }
    .guide-highlight { position: fixed; z-index: 2147483641; border: 2px solid #ff6b52; border-radius: 8px; box-shadow: 0 0 0 4px rgba(255,107,82,.12), 0 8px 24px rgba(255,107,82,.18); pointer-events:none; display:none; }
    .guide-tooltip { position: fixed; z-index: 2147483642; max-width: 340px; background: #111827; color: white; border-radius: 18px; padding: 10px 12px; display:none; align-items:center; gap:8px; box-shadow: 0 8px 30px rgba(0,0,0,.28); font: 500 12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif; }
    .guide-dot { width: 7px; height: 7px; background:#ff6b52; border-radius:999px; flex:none; }
    .guide-text { min-width: 0; }
    .guide-text strong { display:block; font-size:12px; margin-bottom:2px; }
    .guide-text span { display:block; color: rgba(255,255,255,.82); }
    .guide-done { margin-left:auto; border:0; background: rgba(255,255,255,.12); color:white; border-radius:10px; padding: 4px 8px; font: inherit; cursor:pointer; }
  `;

  const host = document.createElement('stept-guide-overlay');
  host.id = 'stept-guide-overlay-host';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = OVERLAY_STYLES;
  shadow.appendChild(style);

  const container = document.createElement('div');
  shadow.appendChild(container);
  document.documentElement.appendChild(host);
  _window.__steptGuideOverlay = host;

  const root = createRoot(container);
  root.render(createElement(App));

  // ── Message listener: receive state from background ───────
  chrome.runtime.onMessage.addListener((message: { type: string; [key: string]: any }, _sender, sendResponse) => {
    if (message.type === 'GUIDE_STATE_UPDATE') {
      setState({
        guide: message.guide || null,
        currentIndex: message.currentIndex || 0,
        paused: !!message.paused,
        sessionId: message.sessionId || null,
        status: (message.status as 'idle' | 'active' | 'stopped') || 'idle',
      });
      sendResponse({ success: true });
      return false;
    }
    if (message.type === 'STOP_GUIDE') {
      setState({ status: 'stopped', guide: null });
      sendResponse({ success: true });
      return false;
    }
    if (message.type === 'PING') {
      const s = getState();
      sendResponse({ pong: true, state: s.status, sessionId: s.sessionId });
      return false;
    }
    return false;
  });

  // ── Announce ready to background ──────────────────────────
  chrome.runtime.sendMessage({
    type: 'GUIDE_RUNTIME_READY',
    url: location.href,
    state: 'idle',
    hasRunner: true,
    sessionId: null,
  }).catch(() => {});
}
