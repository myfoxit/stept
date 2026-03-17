// ===== SMART BLUR POPUP =====
// Mechanical port from content.js — shadow DOM smart blur panel

import { sendMsg } from './index';

// Window.__steptRedaction type is declared in redaction.ts

let smartBlurElement: HTMLDivElement | null = null;
let smartBlurOpen = false;

export function isSmartBlurOpen(): boolean {
  return smartBlurOpen;
}

export function createSmartBlurPopup(): void {
  if (smartBlurElement) return;

  smartBlurElement = document.createElement('div');
  smartBlurElement.id = '__stept-smartblur__';
  smartBlurElement.setAttribute('data-stept-exclude', 'true');

  const shadow = smartBlurElement.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }
    .sb-panel {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      width: 260px;
      background: #FFFFFF;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
      font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      color: #1C1917;
      user-select: none;
      overflow: hidden;
    }
    .sb-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 1px solid #E7E5E4;
    }
    .sb-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: #1C1917;
    }
    .sb-title svg {
      color: #3AB08A;
    }
    .sb-close {
      width: 26px;
      height: 26px;
      border: none;
      background: transparent;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #78716C;
      transition: all 0.15s;
    }
    .sb-close:hover {
      background: #F5F5F4;
      color: #1C1917;
    }
    .sb-body {
      padding: 8px 14px 6px;
    }
    .sb-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 0;
    }
    .sb-row + .sb-row {
      border-top: 1px solid #F5F5F4;
    }
    .sb-label {
      font-size: 13px;
      font-weight: 500;
      color: #1C1917;
    }
    .sb-toggle {
      position: relative;
      width: 40px;
      height: 22px;
      flex-shrink: 0;
    }
    .sb-toggle input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }
    .sb-slider {
      position: absolute;
      inset: 0;
      background: #D6D3D1;
      border-radius: 22px;
      cursor: pointer;
      transition: 0.2s;
    }
    .sb-slider::before {
      content: '';
      position: absolute;
      width: 18px;
      height: 18px;
      left: 2px;
      top: 2px;
      background: white;
      border-radius: 50%;
      transition: 0.2s;
    }
    .sb-toggle input:checked + .sb-slider {
      background: #3AB08A;
    }
    .sb-toggle input:checked + .sb-slider::before {
      transform: translateX(18px);
    }
    .sb-footer {
      padding: 8px 14px 12px;
      border-top: 1px solid #E7E5E4;
    }
    .sb-hint {
      font-size: 11px;
      color: #A8A29E;
      line-height: 1.4;
    }
    .sb-done {
      width: 100%;
      margin-top: 8px;
      padding: 8px 12px;
      border: none;
      border-radius: 8px;
      background: #3AB08A;
      color: white;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s;
    }
    .sb-done:hover {
      background: #33a07d;
    }
    .sb-paused {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: #FFFBEB;
      font-size: 11px;
      font-weight: 600;
      color: #D97706;
    }
    .sb-paused-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #F59E0B;
    }
  `;

  const categories = [
    { key: 'emails', label: 'Email Addresses', defaultOn: true },
    { key: 'numbers', label: 'Numbers', defaultOn: false },
    { key: 'names', label: 'Common Names', defaultOn: true },
    { key: 'formFields', label: 'Form Fields', defaultOn: true },
    { key: 'longText', label: 'Long Text', defaultOn: false },
    { key: 'images', label: 'Images', defaultOn: false },
  ];

  const panel = document.createElement('div');
  panel.className = 'sb-panel';

  panel.innerHTML = `
    <div class="sb-header">
      <div class="sb-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Smart Blur
      </div>
      <button class="sb-close" id="sbClose">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="sb-paused">
      <span class="sb-paused-dot"></span>
      Capture paused \u2014 Smart Blur active
    </div>
    <div class="sb-body" id="sbBody"></div>
    <div class="sb-footer">
      <span class="sb-hint">Elements matching enabled categories will be blurred on the page.</span>
      <button class="sb-done" id="sbDone">Done \u2014 Resume Capture</button>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(panel);

  // Build toggle rows
  const body = shadow.getElementById('sbBody') as HTMLDivElement;
  const redaction = window.__steptRedaction;

  // Get current settings to initialize toggles
  const currentSettings = redaction ? redaction.getSettings() : {} as Record<string, boolean>;

  categories.forEach(({ key, label, defaultOn }) => {
    const isOn = currentSettings[key] !== undefined ? currentSettings[key] : defaultOn;

    const row = document.createElement('div');
    row.className = 'sb-row';
    row.innerHTML = `
      <span class="sb-label">${label}</span>
      <label class="sb-toggle">
        <input type="checkbox" data-category="${key}" ${isOn ? 'checked' : ''}>
        <span class="sb-slider"></span>
      </label>
    `;

    const checkbox = row.querySelector('input') as HTMLInputElement;
    checkbox.addEventListener('change', () => {
      if (redaction) {
        redaction.toggleCategory(key, checkbox.checked);
      }
    });

    body.appendChild(row);
  });

  // Apply initial redaction for all enabled categories
  if (redaction) {
    redaction.applyAllEnabled();
  }

  // Close button
  (shadow.getElementById('sbClose') as HTMLButtonElement).addEventListener('click', (e: Event) => {
    e.stopPropagation();
    closeSmartBlur();
  });

  // Done button
  (shadow.getElementById('sbDone') as HTMLButtonElement).addEventListener('click', (e: Event) => {
    e.stopPropagation();
    closeSmartBlur();
  });

  document.documentElement.appendChild(smartBlurElement);
  smartBlurOpen = true;
}

export function closeSmartBlur(): void {
  if (!smartBlurElement) return;
  smartBlurElement.remove();
  smartBlurElement = null;
  smartBlurOpen = false;

  // Resume capture
  sendMsg({ type: 'RESUME_RECORDING' });
}

export function toggleSmartBlur(): void {
  if (smartBlurOpen) {
    closeSmartBlur();
  } else {
    // Pause capture first, then show popup
    sendMsg({ type: 'PAUSE_RECORDING' }).then(() => {
      // Load latest settings before creating popup
      if (window.__steptRedaction) {
        window.__steptRedaction.loadSettings().then(() => {
          createSmartBlurPopup();
        });
      } else {
        createSmartBlurPopup();
      }
    });
  }
}

export function removeSmartBlur(): void {
  if (smartBlurElement) {
    smartBlurElement.remove();
    smartBlurElement = null;
    smartBlurOpen = false;
  }
}
