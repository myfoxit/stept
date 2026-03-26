import { debugLog } from './state';

function isNavigateLikeStep(step: any): boolean {
  const actionType = String(step?.action_type || step?.actionType || '').toLowerCase();
  return actionType === 'navigate' || actionType === 'new-tab' || actionType === 'new_tab';
}

export function getReplayStartIndex(guide: any, startIndex: number): number {
  const steps = Array.isArray(guide?.steps) ? guide.steps : [];
  if (steps.length === 0) return 0;

  let index = Math.max(0, startIndex || 0);
  while (index < steps.length && isNavigateLikeStep(steps[index])) {
    index += 1;
  }

  return Math.min(index, steps.length - 1);
}

export async function _injectGuideNow(tabId: number, guide: any, startIndex: number, sessionId?: string): Promise<void> {
  const replayIndex = getReplayStartIndex(guide, startIndex);
  const message = { type: 'START_GUIDE', guide, startIndex: replayIndex, sessionId };

  // Content script is manifest-declared so it should already be present.
  // Try sending START_GUIDE directly first.
  try {
    const resp = await chrome.tabs.sendMessage(tabId, message);
    if (resp && (resp as any).success) return;
  } catch {
    // No listener yet — content script may not have initialized
  }

  // Retry with backoff: manifest content scripts run at document_idle,
  // which may take a moment after onCompleted fires.
  const RETRY_DELAYS = [150, 300, 600, 1200];
  for (const delay of RETRY_DELAYS) {
    await new Promise((r) => setTimeout(r, delay));
    try {
      const resp = await chrome.tabs.sendMessage(tabId, message);
      if (resp && (resp as any).success) return;
    } catch {
      // Still not ready
    }
  }

  // Last resort: force-inject via scripting API
  try {
    debugLog('Guide manifest script not responding after retries, force-injecting');
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['guide-runtime.js'] });
    await new Promise((r) => setTimeout(r, 150));
    await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    debugLog('Guide inject fallback failed:', e);
  }
}
