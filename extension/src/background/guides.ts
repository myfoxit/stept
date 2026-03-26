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
    if (expected.origin !== current.origin) return false;
    // Exact path match
    if (expected.pathname === current.pathname) return true;
    // Flexible match: ignore dynamic path segments like project IDs (UUIDs, short IDs).
    // Compare the last meaningful path segment(s) so /projects/abc/settings matches /projects/xyz/settings
    const expectedParts = expected.pathname.split('/').filter(Boolean);
    const currentParts = current.pathname.split('/').filter(Boolean);
    if (expectedParts.length === currentParts.length) {
      const match = expectedParts.every((part, i) => part === currentParts[i] || looksLikeDynamicSegment(part) || looksLikeDynamicSegment(currentParts[i]));
      if (match) return true;
    }
    return false;
  } catch {
    return url.includes(expectedUrl);
  }
}

function looksLikeDynamicSegment(segment: string): boolean {
  // UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true;
  // Short ID (alphanumeric, 6-24 chars, mixed case or digits)
  if (/^[a-zA-Z0-9]{6,24}$/.test(segment) && /\d/.test(segment)) return true;
  return false;
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
