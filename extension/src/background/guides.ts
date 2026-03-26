import { debugLog, activeGuideState, notifyGuideStateUpdate, setActiveGuideState } from './state';

function isNavigateLikeStep(step: any): boolean {
  const actionType = String(step?.action_type || step?.actionType || '').toLowerCase();
  return actionType === 'navigate' || actionType === 'new-tab' || actionType === 'new_tab';
}

export { isNavigateLikeStep };

export function getReplayStartIndex(guide: any, startIndex: number): number {
  const steps = Array.isArray(guide?.steps) ? guide.steps : [];
  if (steps.length === 0) return 0;
  let index = Math.max(0, startIndex || 0);
  while (index < steps.length && isNavigateLikeStep(steps[index])) {
    index += 1;
  }
  return Math.min(index, steps.length - 1);
}

export function urlMatchesStep(url: string, step: any): boolean {
  const expectedUrl = step?.expected_url;
  if (!expectedUrl) return true;
  try {
    const expected = new URL(expectedUrl);
    const current = new URL(url);
    return expected.origin === current.origin && expected.pathname === current.pathname;
  } catch {
    return url.includes(expectedUrl);
  }
}

export function urlMatchesGuide(url: string, guide: any): boolean {
  const steps = Array.isArray(guide?.steps) ? guide.steps : [];
  return steps.some((step: any) => urlMatchesStep(url, step));
}

export function computePaused(url: string, guide: any, currentIndex: number): boolean {
  const steps = Array.isArray(guide?.steps) ? guide.steps : [];
  const currentStep = steps[currentIndex];
  if (currentStep && urlMatchesStep(url, currentStep)) return false;
  if (urlMatchesGuide(url, guide)) return false;
  return true;
}

/**
 * Broadcast guide state to both the content script (via tabs.sendMessage)
 * and extension pages like sidepanel (via runtime.sendMessage / notifyGuideStateUpdate).
 */
export function broadcastGuideState(tabId?: number): void {
  const tid = tabId || activeGuideState?.tabId;

  const stateMessage = {
    type: 'GUIDE_STATE_UPDATE' as const,
    guide: activeGuideState?.guide || null,
    currentIndex: activeGuideState?.currentIndex || 0,
    paused: !!(activeGuideState as any)?.paused,
    sessionId: activeGuideState?.sessionId || null,
    status: activeGuideState ? 'active' as const : 'stopped' as const,
  };

  // Send to guide-runtime content script
  if (tid) {
    chrome.tabs.sendMessage(tid, stateMessage).catch(() => {});
  }

  // Broadcast to sidepanel/popup + persist session storage
  notifyGuideStateUpdate();
}

/**
 * Advance to the next non-navigate step index, starting from nextIndex.
 * Returns the new index, or -1 if the guide is complete.
 */
export function advanceStepIndex(guide: any, nextIndex: number): number {
  const steps = Array.isArray(guide?.steps) ? guide.steps : [];
  let index = nextIndex;
  while (index < steps.length && isNavigateLikeStep(steps[index])) {
    index++;
  }
  return index >= steps.length ? -1 : index;
}
