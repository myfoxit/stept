// ===== DOCK OVERLAY =====
// Mechanical port from content.js — shadow DOM dock panel

import { sendMsg } from './index';

let dockElement: HTMLDivElement | null = null;
let dockShadowRef: ShadowRoot | null = null;
let dockStepCount = 0;
let dockTimerInterval: ReturnType<typeof setInterval> | null = null;
let dockStartTime: number | null = null;
let dockIsPaused = false;

export function getDockElement(): HTMLDivElement | null {
  return dockElement;
}

export function setDockIsPaused(val: boolean): void {
  dockIsPaused = val;
}

export function getDockIsPaused(): boolean {
  return dockIsPaused;
}

export function getDockShadow(): ShadowRoot | null {
  return dockShadowRef;
}

export function createDock(): void {
  if (dockElement) return;

  dockElement = document.createElement('div');
  dockElement.id = '__stept-dock__';
  dockElement.setAttribute('data-stept-exclude', 'true');

  const shadow = dockElement.attachShadow({ mode: 'closed' });
  dockShadowRef = shadow;

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }
    .dock {
      position: fixed;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      z-index: 2147483647;
      background: #1c1917;
      color: white;
      border-radius: 12px 0 0 12px;
      padding: 12px 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px;
      box-shadow: -4px 0 20px rgba(0,0,0,0.3);
      user-select: none;
      min-width: 52px;
    }
    .dock-logo {
      width: 28px;
      height: 28px;
    }
    .dock-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3ab08a;
      animation: pulse 1.5s infinite;
    }
    .dock-dot.paused {
      background: #f59e0b;
      animation: none;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .dock-time {
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: #a8a29e;
    }
    .dock-steps {
      font-size: 18px;
      font-weight: 700;
      color: white;
      line-height: 1;
    }
    .dock-label {
      font-size: 9px;
      color: #a8a29e;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .dock-divider {
      width: 24px;
      height: 1px;
      background: #44403c;
    }
    .dock-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: #292524;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #a8a29e;
      transition: all 0.15s;
    }
    .dock-btn:hover {
      background: #44403c;
      color: white;
    }
    .dock-btn.complete {
      background: #3ab08a;
      color: white;
    }
    .dock-btn.complete:hover {
      background: #2c8368;
    }
    .dock-btn.danger:hover {
      background: #dc2626;
      color: white;
    }
  `;

  const dock = document.createElement('div');
  dock.className = 'dock';
  dock.innerHTML = `
    <svg class="dock-logo" width="28" height="28" viewBox="0 0 32 32">
      <rect x="0" y="0" width="32" height="32" rx="9" fill="#3AB08A"/>
      <rect x="7" y="7" width="10" height="3.5" rx="1.75" fill="white"/>
      <rect x="7" y="13.5" width="18" height="3.5" rx="1.75" fill="white"/>
      <rect x="7" y="20" width="14" height="3.5" rx="1.75" fill="white"/>
    </svg>
    <div class="dock-dot" id="dockDot"></div>
    <div class="dock-time" id="dockTime">00:00</div>
    <div class="dock-steps" id="dockSteps">0</div>
    <div class="dock-label">steps</div>
    <div class="dock-divider"></div>
    <button class="dock-btn" id="dockPause" title="Pause">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      </svg>
    </button>
    <button class="dock-btn danger" id="dockDelete" title="Delete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    </button>
    <button class="dock-btn complete" id="dockComplete" title="Complete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </button>
  `;

  shadow.appendChild(style);
  shadow.appendChild(dock);

  // Wire up buttons
  (shadow.getElementById('dockPause') as HTMLButtonElement).addEventListener('click', async (e: Event) => {
    e.stopPropagation();
    const state = await sendMsg({ type: 'GET_STATE' }) as { isPaused?: boolean };
    if (state.isPaused) {
      await sendMsg({ type: 'RESUME_RECORDING' });
      dockIsPaused = false;
    } else {
      await sendMsg({ type: 'PAUSE_RECORDING' });
      dockIsPaused = true;
    }
    updateDockPauseUI(shadow);
  });

  (shadow.getElementById('dockDelete') as HTMLButtonElement).addEventListener('click', async (e: Event) => {
    e.stopPropagation();
    if (confirm('Delete this entire capture?')) {
      await sendMsg({ type: 'STOP_RECORDING' });
      await sendMsg({ type: 'CLEAR_STEPS' });
      removeDock();
    }
  });

  (shadow.getElementById('dockComplete') as HTMLButtonElement).addEventListener('click', async (e: Event) => {
    e.stopPropagation();
    await sendMsg({ type: 'STOP_RECORDING' });
    // Upload automatically — only clear on success
    const result = await sendMsg({ type: 'UPLOAD' }) as { success?: boolean; sessionId?: string };
    if (result.success) {
      await sendMsg({ type: 'CLEAR_STEPS' });
      removeDock();
      // Redirect to workflow page
      if (result.sessionId) {
        const settings = await sendMsg({ type: 'GET_SETTINGS' }) as { frontendUrl?: string; apiBaseUrl?: string };
        const webAppUrl = settings.frontendUrl || (settings.apiBaseUrl || '').replace('/api/v1', '');
        if (webAppUrl) {
          window.open(`${webAppUrl}/workflow/${result.sessionId}`, '_blank');
        }
      }
    } else {
      // Show error feedback — flash the complete button red
      const btn = shadow.getElementById('dockComplete') as HTMLButtonElement | null;
      if (btn) {
        btn.style.background = '#dc2626';
        setTimeout(() => { btn.style.background = ''; }, 2000);
      }
    }
  });

  document.documentElement.appendChild(dockElement);

  // Start timer
  sendMsg({ type: 'GET_STATE' }).then((state: Record<string, unknown>) => {
    dockStartTime = state.recordingStartTime as number;
    dockStepCount = (state.stepCount as number) || 0;
    dockIsPaused = state.isPaused as boolean;
    updateDockDisplay(shadow);
    updateDockPauseUI(shadow);
    dockTimerInterval = setInterval(() => updateDockDisplay(shadow), 1000);
  });
}

export function updateDockDisplay(shadow: ShadowRoot): void {
  if (!shadow) return;
  const timeEl = shadow.getElementById('dockTime');
  const stepsEl = shadow.getElementById('dockSteps');
  if (timeEl && dockStartTime) {
    const elapsed = Date.now() - dockStartTime;
    const m = Math.floor(elapsed / 60000);
    const s = Math.floor((elapsed % 60000) / 1000);
    timeEl.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  if (stepsEl) {
    stepsEl.textContent = String(dockStepCount);
  }
}

export function updateDockPauseUI(shadow: ShadowRoot): void {
  if (!shadow) return;
  const dot = shadow.getElementById('dockDot');
  const pauseBtn = shadow.getElementById('dockPause');
  if (dockIsPaused) {
    dot?.classList.add('paused');
    if (pauseBtn) pauseBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  } else {
    dot?.classList.remove('paused');
    if (pauseBtn) pauseBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  }
}

export function removeDock(): void {
  if (dockTimerInterval) {
    clearInterval(dockTimerInterval);
    dockTimerInterval = null;
  }
  if (dockElement) {
    dockElement.remove();
    dockElement = null;
  }
}

export function incrementDockSteps(): void {
  if (!dockElement) return;
  dockStepCount++;
  const shadow = dockElement.shadowRoot;
  if (shadow) updateDockDisplay(shadow);
}
