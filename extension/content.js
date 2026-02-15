let widget = null;
let appUrl = '';

chrome.storage.sync.get(['appUrl'], ({ appUrl: url }) => {
  appUrl = url || '';
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ONDOKI_MATCHES') {
    renderWidget(msg.matches);
  }
});

function renderWidget(matches) {
  if (widget) widget.remove();
  if (!matches || matches.length === 0) return;

  widget = document.createElement('div');
  widget.id = 'ondoki-context-widget';
  widget.innerHTML = `
    <div id="ondoki-toggle">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4l3 3"/>
      </svg>
      <span id="ondoki-badge">${matches.length}</span>
    </div>
    <div id="ondoki-panel" style="display:none">
      <div id="ondoki-header">
        <span>📋 Ondoki Context</span>
        <button id="ondoki-close">×</button>
      </div>
      <div id="ondoki-list">
        ${matches.map(m => `
          <div class="ondoki-item">
            <div class="ondoki-item-type">${m.resource_type === 'workflow' ? '🔄' : '📄'} ${escapeHtml(m.resource_name)}</div>
            ${m.note ? `<div class="ondoki-item-note">${escapeHtml(m.note)}</div>` : ''}
            ${m.resource_summary ? `<div class="ondoki-item-summary">${escapeHtml(m.resource_summary.substring(0, 100))}...</div>` : ''}
            <a class="ondoki-item-link" href="${getResourceUrl(m)}" target="_blank">Open in Ondoki →</a>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(widget);

  document.getElementById('ondoki-toggle').addEventListener('click', () => {
    const panel = document.getElementById('ondoki-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('ondoki-close').addEventListener('click', () => {
    document.getElementById('ondoki-panel').style.display = 'none';
  });
}

function getResourceUrl(match) {
  if (match.resource_type === 'workflow') {
    return `${appUrl}/workflow/${match.resource_id}`;
  }
  return `${appUrl}/editor/${match.resource_id}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
