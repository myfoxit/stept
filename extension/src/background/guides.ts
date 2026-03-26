import { debugLog } from './state';

// Guard against double-injection: tracks tabs where _injectGuideAfterLoad is pending
const pendingAfterLoadTabs = new Set<number>();

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

export async function _injectGuideNow(tabId: number, guide: any, startIndex: number): Promise<void> {
  const replayIndex = getReplayStartIndex(guide, startIndex);

  // First try lightweight step jump if runner is already active (with retries)
  if (replayIndex > 0) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await chrome.tabs.sendMessage(tabId, { type: 'GUIDE_GOTO', stepIndex: replayIndex });
        if (resp && (resp as any).success) return;
      } catch {
        // Runner not active or not ready yet
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Full injection: start or restart the guide runner
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'START_GUIDE', guide, startIndex: replayIndex });
    if (resp && (resp as any).success) return;
  } catch {
    // No listener — need to inject script
  }

  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['guide-runtime.js'] });
  await new Promise((r) => setTimeout(r, 300));
  await chrome.tabs.sendMessage(tabId, { type: 'START_GUIDE', guide, startIndex: replayIndex });
}

export { pendingAfterLoadTabs };

export function _injectGuideAfterLoad(tabId: number, guide: any, startIndex: number): void {
  pendingAfterLoadTabs.add(tabId);

  let settled = false;

  const cleanup = (): void => {
    chrome.webNavigation.onCompleted.removeListener(onCompleted);
    chrome.webNavigation.onHistoryStateUpdated.removeListener(onHistoryUpdated);
    chrome.tabs.onUpdated.removeListener(onTabUpdated);
    pendingAfterLoadTabs.delete(tabId);
  };

  const runInjection = async (): Promise<void> => {
    if (settled) return;
    settled = true;
    cleanup();

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

    try {
      await _injectGuideNow(tabId, guide, startIndex);
    } catch (e) {
      debugLog('Guide inject after load failed:', e);
    }
  };

  const onCompleted = (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
    if (details.tabId !== tabId || details.frameId !== 0) return;
    runInjection();
  };

  const onHistoryUpdated = (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
    if (details.tabId !== tabId || details.frameId !== 0) return;
    runInjection();
  };

  const onTabUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
    if (updatedTabId !== tabId) return;
    if (changeInfo.status === 'complete') {
      runInjection();
    }
  };

  chrome.webNavigation.onCompleted.addListener(onCompleted);
  chrome.webNavigation.onHistoryStateUpdated.addListener(onHistoryUpdated);
  chrome.tabs.onUpdated.addListener(onTabUpdated);

  // If the tab is already complete (fast load / bfcache), don't wait for an event we may have missed.
  chrome.tabs.get(tabId).then((tab) => {
    if (tab.status === 'complete') {
      runInjection();
    }
  }).catch(() => {});
}
