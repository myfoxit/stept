// ===== DOM SNAPSHOT CAPTURE =====
// Mechanical port from content.js — rrweb snapshot integration

import { debugLog } from './index';

declare const rrwebSnapshot: {
  snapshot: (doc: Document, opts: {
    blockClass: string;
    maskTextClass: string;
    inlineStylesheet: boolean;
    recordCanvas: boolean;
  }) => unknown;
} | undefined;

export function captureDomSnapshot(): string | null {
  try {
    if (typeof rrwebSnapshot === 'undefined' || !rrwebSnapshot.snapshot) return null;
    const snap = rrwebSnapshot.snapshot(document, {
      blockClass: 'stept-exclude',
      maskTextClass: 'stept-mask',
      inlineStylesheet: false,
      recordCanvas: false,
    });
    return snap ? JSON.stringify(snap) : null;
  } catch (e) {
    debugLog('DOM snapshot failed:', e);
    return null;
  }
}
