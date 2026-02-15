document.addEventListener('DOMContentLoaded', async () => {
  const { apiUrl, authToken, projectId, appUrl } = await chrome.storage.sync.get(['apiUrl', 'authToken', 'projectId', 'appUrl']);

  if (!apiUrl || !authToken) {
    document.getElementById('content').innerHTML = '<div class="empty">Please configure Ondoki in <a href="options.html" target="_blank">Settings</a></div>';
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    document.getElementById('content').innerHTML = '<div class="empty">No active page</div>';
    return;
  }

  try {
    const url = new URL(`${apiUrl}/api/v1/context-links/match`);
    url.searchParams.set('url', tab.url);
    if (projectId) url.searchParams.set('project_id', projectId);

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok) throw new Error('API error');
    const data = await res.json();

    if (!data.matches?.length) {
      document.getElementById('content').innerHTML = '<div class="empty">No matching context for this page</div>';
      return;
    }

    document.getElementById('content').innerHTML = data.matches.map(m => `
      <div class="match">
        <div class="match-name">${m.resource_type === 'workflow' ? '🔄' : '📄'} ${escapeHtml(m.resource_name)}</div>
        ${m.note ? `<div class="match-note">📌 ${escapeHtml(m.note)}</div>` : ''}
        <a class="match-link" href="${appUrl || apiUrl}/${m.resource_type === 'workflow' ? 'workflow' : 'editor'}/${m.resource_id}" target="_blank">Open in Ondoki →</a>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('content').innerHTML = '<div class="empty">Failed to check context</div>';
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
