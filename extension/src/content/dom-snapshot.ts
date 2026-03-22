// ===== DOM SNAPSHOT CAPTURE =====
// Mechanical port from content.js — rrweb snapshot integration

import { debugLog } from './index';

declare const rrwebSnapshot: {
  snapshot: (doc: Document, opts: {
    blockClass: string;
    maskTextClass: string;
    maskInputOptions?: Record<string, boolean>;
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
      // Inline all stylesheets into the snapshot so replay works without the original server
      inlineStylesheet: true,
      // Capture canvas content (WebGL preserveDrawingBuffer override makes this work)
      recordCanvas: true,
      // Mask password fields — never capture credentials in snapshots
      maskInputOptions: { password: true },
    });
    return snap ? JSON.stringify(snap) : null;
  } catch (e) {
    debugLog('DOM snapshot failed:', e);
    return null;
  }
}
