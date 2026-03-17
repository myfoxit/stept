import {
  state, debugLog, activeGuideState, setActiveGuideState,
  notifyGuideStateUpdate, healthBatch, setHealthBatch,
  healthBatchWorkflowId, setHealthBatchWorkflowId,
} from './state';
import { authedFetch } from './auth';
import { getApiBaseUrl } from './settings';

export async function _injectGuideNow(tabId: number, guide: any, startIndex: number): Promise<void> {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'START_GUIDE', guide, startIndex });
    if (resp && (resp as any).success) return;
  } catch {
    // No listener -- need to inject
  }
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['guide-runtime.js'] });
  await new Promise((r) => setTimeout(r, 300));
  await chrome.tabs.sendMessage(tabId, { type: 'START_GUIDE', guide, startIndex });
}

export function _injectGuideAfterLoad(tabId: number, guide: any, startIndex: number): void {
  const onCompleted = (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
    if (details.tabId !== tabId || details.frameId !== 0) return;
    chrome.webNavigation.onCompleted.removeListener(onCompleted);
    setTimeout(async () => {
      try {
        await _injectGuideNow(tabId, guide, startIndex);
      } catch (e) { debugLog('Guide inject after load failed:', e); }
    }, 1500);
  };
  chrome.webNavigation.onCompleted.addListener(onCompleted);
}
