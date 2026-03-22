// ===== CONTEXT INDICATOR =====
// Floating badge injected into pages with matching stept workflows/docs.
// Shows "N guides" pill in bottom-right corner with Shadow DOM isolation.

import { debugLog } from './index';

let indicatorHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;

interface ContextMatch {
  resource_type: string;
  resource_id: string;
  resource_name?: string;
  match_type?: string;
}

export function showContextIndicator(matches: ContextMatch[]): void {
  if (matches.length === 0) {
    hideContextIndicator();
    return;
  }

  if (!indicatorHost) {
    indicatorHost = document.createElement('div');
    indicatorHost.id = 'stept-context-indicator';
    indicatorHost.style.cssText = 'all:initial;position:fixed;bottom:20px;right:20px;z-index:2147483646;';
    shadowRoot = indicatorHost.attachShadow({ mode: 'closed' });
    document.body.appendChild(indicatorHost);
    debugLog('Context indicator created');
  }

  if (!shadowRoot) return;

  const count = matches.length;
  const label = count === 1 ? '1 guide' : `${count} guides`;
  const names = matches.slice(0, 3).map(m => m.resource_name || 'Untitled').join('\n');

  shadowRoot.innerHTML = `
    <style>
      :host { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: #1e1b4b;
        color: #e0e7ff;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(99,102,241,0.2);
        transition: all 0.2s ease;
        user-select: none;
        animation: slideIn 0.3s ease-out;
      }
      .indicator:hover {
        background: #312e81;
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0,0,0,0.2), 0 0 0 1px rgba(99,102,241,0.4);
      }
      .icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
      .badge {
        background: #6366f1;
        color: white;
        font-size: 11px;
        font-weight: 700;
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 5px;
      }
      .dropdown {
        position: absolute;
        bottom: 100%;
        right: 0;
        margin-bottom: 8px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05);
        min-width: 280px;
        max-width: 340px;
        display: none;
        overflow: hidden;
        animation: fadeIn 0.2s ease;
      }
      .dropdown.open { display: block; }
      .dropdown-header {
        padding: 12px 16px;
        border-bottom: 1px solid #f1f5f9;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .dropdown-item {
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        transition: background 0.15s;
        text-decoration: none;
        color: inherit;
      }
      .dropdown-item:hover { background: #f8fafc; }
      .dropdown-item-icon { font-size: 16px; flex-shrink: 0; }
      .dropdown-item-name {
        font-size: 13px;
        font-weight: 500;
        color: #1e293b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dropdown-item-type {
        font-size: 11px;
        color: #94a3b8;
        margin-left: auto;
        flex-shrink: 0;
      }
      .close-btn {
        position: absolute;
        top: -6px;
        left: -6px;
        width: 20px;
        height: 20px;
        background: #475569;
        color: white;
        border: 2px solid white;
        border-radius: 50%;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s;
      }
      .indicator:hover .close-btn { opacity: 1; }
      @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    </style>
    <div class="wrapper" style="position:relative;">
      <div class="dropdown" id="dropdown">
        <div class="dropdown-header">Available guides</div>
        ${matches.map(m => `
          <div class="dropdown-item" data-id="${m.resource_id}" data-type="${m.resource_type}">
            <span class="dropdown-item-icon">${m.resource_type === 'workflow' ? '📋' : '📄'}</span>
            <span class="dropdown-item-name">${(m.resource_name || 'Untitled').replace(/</g, '&lt;')}</span>
            <span class="dropdown-item-type">${m.resource_type}</span>
          </div>
        `).join('')}
      </div>
      <div class="indicator" id="pill" title="${names}">
        <span class="close-btn" id="close">✕</span>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
        <span>${label}</span>
        <span class="badge">${count}</span>
      </div>
    </div>
  `;

  // Event handlers
  const pill = shadowRoot.getElementById('pill');
  const dropdown = shadowRoot.getElementById('dropdown');
  const closeBtn = shadowRoot.getElementById('close');

  pill?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('open');
  });

  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideContextIndicator();
  });

  // Click on dropdown items → open in stept
  shadowRoot.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = (item as HTMLElement).dataset.id;
      const type = (item as HTMLElement).dataset.type;
      if (id) {
        chrome.runtime.sendMessage({
          type: 'OPEN_RESOURCE',
          resourceId: id,
          resourceType: type,
        }).catch(() => {});
        dropdown?.classList.remove('open');
      }
    });
  });

  // Click outside closes dropdown
  document.addEventListener('click', () => {
    dropdown?.classList.remove('open');
  }, { once: false });
}

export function hideContextIndicator(): void {
  if (indicatorHost) {
    indicatorHost.remove();
    indicatorHost = null;
    shadowRoot = null;
  }
}

export function updateContextIndicator(matches: ContextMatch[]): void {
  if (matches.length > 0) {
    showContextIndicator(matches);
  } else {
    hideContextIndicator();
  }
}
