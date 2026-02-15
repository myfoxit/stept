const CACHE_TTL = 5 * 60 * 1000; // 5 min
const cache = new Map();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  const { apiUrl, authToken, projectId } = await chrome.storage.sync.get(['apiUrl', 'authToken', 'projectId']);
  if (!apiUrl || !authToken || !projectId) return;

  const cacheKey = `${projectId}:${tab.url}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    updateBadge(tabId, cached.data.matches.length);
    chrome.tabs.sendMessage(tabId, { type: 'ONDOKI_MATCHES', matches: cached.data.matches }).catch(() => {});
    return;
  }

  try {
    const url = new URL(`${apiUrl}/api/v1/context-links/match`);
    url.searchParams.set('url', tab.url);
    url.searchParams.set('project_id', projectId);

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok) return;
    const data = await res.json();

    cache.set(cacheKey, { data, time: Date.now() });
    updateBadge(tabId, data.matches.length);
    chrome.tabs.sendMessage(tabId, { type: 'ONDOKI_MATCHES', matches: data.matches }).catch(() => {});
  } catch (e) {
    console.error('Ondoki context match failed:', e);
  }
});

function updateBadge(tabId, count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count), tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}
