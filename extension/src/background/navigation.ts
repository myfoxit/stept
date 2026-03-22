import { NAVIGATION_SUPPRESS_WINDOW } from '@/shared/constants';
import {
  state, debugLog, lastTrackedPage, setLastTrackedPage,
  lastUserActionTime, contextMatches, setContextMatches,
  lastContextUrl, setLastContextUrl,
} from './state';
import { addStep } from './recording';
import { getApiBaseUrl } from './settings';
import { authedFetch } from './auth';

async function fetchContextMatches(
  apiUrl: string,
  accessToken: string,
  tabUrl: string,
  projectId: string | null,
): Promise<{ matches: any[] }> {
  const params = new URLSearchParams({ url: tabUrl });
  if (projectId) params.append('project_id', projectId);

  const response = await fetch(`${apiUrl}/context-links/match?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 404) return { matches: [] };
    throw new Error(`Context match failed: ${response.status}`);
  }

  return response.json();
}

export async function trackPageChange(tabId: number, reason: string): Promise<void> {
  if (!state.isRecording || state.isPaused) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (
      !tab.url ||
      (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))
    )
      return;

    const now = Date.now();
    if (
      lastTrackedPage.tabId === tabId &&
      lastTrackedPage.url === tab.url &&
      now - lastTrackedPage.time < 2000
    )
      return;
    setLastTrackedPage({ tabId, url: tab.url, time: now });

    if (now - lastUserActionTime < NAVIGATION_SUPPRESS_WINDOW) {
      debugLog('Suppressing navigate step (caused by recent user action)');
      return;
    }

    await addStep({
      actionType: 'Navigate',
      pageTitle: tab.title || '',
      description: `Navigate to "${tab.title || tab.url}"`,
      url: tab.url,
      windowSize: { width: 0, height: 0 },
      viewportSize: { width: 0, height: 0 },
    });
  } catch (e) {
    debugLog('Page tracking failed:', e);
  }
}

export async function checkContextLinks(tabUrl: string): Promise<void> {
  if (!state.isAuthenticated || !state.accessToken || !tabUrl) return;
  if (!tabUrl.startsWith('http://') && !tabUrl.startsWith('https://')) return;
  if (tabUrl === lastContextUrl) return;
  setLastContextUrl(tabUrl);

  try {
    const API_BASE_URL = await getApiBaseUrl();
    const result = await fetchContextMatches(
      API_BASE_URL, state.accessToken, tabUrl, state.selectedProjectId,
    );
    setContextMatches(result.matches || []);

    if (!state.isRecording) {
      if (contextMatches.length > 0) {
        chrome.action.setBadgeText({ text: String(contextMatches.length) });
        chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
      } else {
        chrome.action.setBadgeText({ text: '' });
      }
    }

    // Notify sidepanel (runtime message)
    chrome.runtime.sendMessage({
      type: 'CONTEXT_MATCHES_UPDATED',
      matches: contextMatches,
      url: tabUrl,
    }).catch(() => {});

    // Notify content script on the active tab (page-level indicator)
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          type: 'CONTEXT_MATCHES_UPDATED',
          matches: contextMatches,
        }).catch(() => {});
      }
    } catch { /* no active tab */ }
  } catch (e) {
    debugLog('Context link check failed:', e);
    setContextMatches([]);
  }
}
