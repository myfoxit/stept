// Content script entry — main entry point
// Mechanical port from content.js

import { startCapturing, stopCapturing } from './capture';
import { updateContextIndicator } from './context-indicator';
import {
  createDock,
  removeDock,
  updateDockPauseUI,
  incrementDockSteps,
  getDockElement,
  setDockIsPaused,
  getDockShadow,
} from './dock';
import {
  toggleSmartBlur,
  removeSmartBlur,
  isSmartBlurOpen,
} from './smart-blur';

declare global {
  interface Window {
    __steptContentLoaded?: boolean;
  }
}

const DEBUG = false;

export function debugLog(...args: unknown[]): void {
  if (DEBUG) console.log('[Stept]', ...args);
}

export function sendMsg(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response?: Record<string, unknown>) => {
      resolve(response || {});
    });
  });
}

// Guard against double-injection: if already loaded, skip
if (window.__steptContentLoaded) {
  debugLog('Content script already loaded, skipping');
} else {
  window.__steptContentLoaded = true;

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message: { type: string }, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
    debugLog('Content script received message:', message.type);
    switch (message.type) {
      case 'START_RECORDING':
        startCapturing();
        sendResponse({ success: true });
        break;
      case 'STOP_RECORDING':
        stopCapturing();
        // Clean up any active redaction/blur
        if ((window as any).__steptRedaction?.removeAll) {
          (window as any).__steptRedaction.removeAll();
        }
        sendResponse({ success: true });
        break;
      case 'PAUSE_RECORDING':
        stopCapturing();
        // Update dock UI
        if (getDockElement()) {
          setDockIsPaused(true);
          const shadow = getDockShadow();
          if (shadow) updateDockPauseUI(shadow);
        }
        sendResponse({ success: true });
        break;
      case 'RESUME_RECORDING':
        startCapturing();
        // Update dock UI
        if (getDockElement()) {
          setDockIsPaused(false);
          const shadow = getDockShadow();
          if (shadow) updateDockPauseUI(shadow);
        }
        sendResponse({ success: true });
        break;
      case 'SHOW_DOCK':
        createDock();
        sendResponse({ success: true });
        break;
      case 'HIDE_DOCK':
        removeDock();
        sendResponse({ success: true });
        break;
      case 'HIDE_DOCK_TEMP': {
        const el = getDockElement();
        if (el) el.style.display = 'none';
        sendResponse({ success: true });
        break;
      }
      case 'SHOW_DOCK_TEMP': {
        const el = getDockElement();
        if (el) el.style.display = '';
        sendResponse({ success: true });
        break;
      }
      case 'TOGGLE_SMART_BLUR':
        toggleSmartBlur();
        sendResponse({ success: true, isOpen: isSmartBlurOpen() });
        break;
      case 'CLOSE_SMART_BLUR':
        removeSmartBlur();
        sendResponse({ success: true });
        break;
      case 'STEP_ADDED':
        incrementDockSteps();
        sendResponse({ success: true });
        break;
      case 'CONTEXT_MATCHES_UPDATED':
        updateContextIndicator(message.matches || []);
        sendResponse({ success: true });
        break;
      case 'PING':
        sendResponse({ alive: true });
        break;
    }
    return true;
  });

  // Check initial recording state
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response?: { isRecording?: boolean; isPaused?: boolean }) => {
      if (chrome.runtime.lastError) return;
      if (response && response.isRecording && !response.isPaused) {
        startCapturing();
      }
    });
  }, 100);
}
