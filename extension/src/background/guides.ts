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

  // Content script is manifest-declared so it should already be present.
  // Try sending START_GUIDE directly first.
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'START_GUIDE', guide, startIndex: replayIndex, sessionId });
    if (resp && (resp as any).success) return;
  } catch {
    // No listener yet — fall back to executeScript injection
  }

  // Fallback: inject via scripting API (e.g. tab loaded before extension installed)
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['guide-runtime.js'] });
    await new Promise((r) => setTimeout(r, 120));
    await chrome.tabs.sendMessage(tabId, { type: 'START_GUIDE', guide, startIndex: replayIndex, sessionId });
  } catch (e) {
    debugLog('Guide inject fallback failed:', e);
  }
}
