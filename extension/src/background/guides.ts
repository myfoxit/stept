import {
  state, debugLog, activeGuideState, setActiveGuideState,
  notifyGuideStateUpdate, healthBatch, setHealthBatch,
  healthBatchWorkflowId, setHealthBatchWorkflowId,
} from './state';
import { authedFetch } from './auth';
import { getApiBaseUrl } from './settings';

// Guard against double-injection: tracks tabs where _injectGuideAfterLoad is pending
const pendingAfterLoadTabs = new Set<number>();

export async function _injectGuideNow(tabId: number, guide: any, startIndex: number): Promise<void> {
  // First try lightweight step jump if runner is already active (with retries)
  if (startIndex > 0) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await chrome.tabs.sendMessage(tabId, { type: 'GUIDE_GOTO', stepIndex: startIndex });
        if (resp && (resp as any).success) return;
      } catch {
        // Runner not active or not ready yet
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 200));
    }
  }
  // Full injection: start or restart the guide runner
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'START_GUIDE', guide, startIndex });
    if (resp && (resp as any).success) return;
  } catch {
    // No listener — need to inject script
  }
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['guide-runtime.js'] });
  await new Promise((r) => setTimeout(r, 300));
  await chrome.tabs.sendMessage(tabId, { type: 'START_GUIDE', guide, startIndex });
}

export { pendingAfterLoadTabs };

export function _injectGuideAfterLoad(tabId: number, guide: any, startIndex: number): void {
  pendingAfterLoadTabs.add(tabId);
  const onCompleted = (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
    if (details.tabId !== tabId || details.frameId !== 0) return;
    chrome.webNavigation.onCompleted.removeListener(onCompleted);
    pendingAfterLoadTabs.delete(tabId);
    // Ping/retry: wait for content script to be ready instead of hardcoded 1500ms delay
    (async () => {
      const MAX_ATTEMPTS = 20;
      const INTERVAL_MS = 200;
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        try {
          const resp = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
          if (resp && (resp as any).pong) {
            await _injectGuideNow(tabId, guide, startIndex);
            return;
          }
        } catch {
          // Content script not ready yet
        }
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
      }
      // Final fallback: try injection anyway after all retries exhausted
      try {
        await _injectGuideNow(tabId, guide, startIndex);
      } catch (e) { debugLog('Guide inject after load failed:', e); }
    })();
  };
  chrome.webNavigation.onCompleted.addListener(onCompleted);
}
