let isRecording = false;
let typedText = '';
let typingTimer = null;
let lastClickTime = 0;
let lastClickTarget = null;
let pendingClick = null;
let focusedFieldValue = null; // Track value on focus for blur comparison
const TYPING_DELAY = 1000;
const DOUBLE_CLICK_MS = 400;
const DEBUG = false;

function debugLog(...args) {
  if (DEBUG) console.log('[Ondoki]', ...args);
}

// Guard against double-injection: if already loaded, skip
if (window.__ondokiContentLoaded) {
  debugLog('Content script already loaded, skipping');
} else {
  window.__ondokiContentLoaded = true;

  // ===== SMART BLUR POPUP =====
  let smartBlurElement = null;
  let smartBlurOpen = false;

  function createSmartBlurPopup() {
    if (smartBlurElement) return;

    smartBlurElement = document.createElement('div');
    smartBlurElement.id = '__ondoki-smartblur__';
    smartBlurElement.setAttribute('data-ondoki-exclude', 'true');

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
        Capture paused — Smart Blur active
      </div>
      <div class="sb-body" id="sbBody"></div>
      <div class="sb-footer">
        <span class="sb-hint">Elements matching enabled categories will be blurred on the page.</span>
        <button class="sb-done" id="sbDone">Done — Resume Capture</button>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(panel);

    // Build toggle rows
    const body = shadow.getElementById('sbBody');
    const redaction = window.__ondokiRedaction;

    // Get current settings to initialize toggles
    const currentSettings = redaction ? redaction.getSettings() : {};

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

      const checkbox = row.querySelector('input');
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
    shadow.getElementById('sbClose').addEventListener('click', (e) => {
      e.stopPropagation();
      closeSmartBlur();
    });

    // Done button
    shadow.getElementById('sbDone').addEventListener('click', (e) => {
      e.stopPropagation();
      closeSmartBlur();
    });

    document.documentElement.appendChild(smartBlurElement);
    smartBlurOpen = true;
  }

  function closeSmartBlur() {
    if (!smartBlurElement) return;
    smartBlurElement.remove();
    smartBlurElement = null;
    smartBlurOpen = false;

    // Resume capture
    sendMsg({ type: 'RESUME_RECORDING' });
  }

  function toggleSmartBlur() {
    if (smartBlurOpen) {
      closeSmartBlur();
    } else {
      // Pause capture first, then show popup
      sendMsg({ type: 'PAUSE_RECORDING' }).then(() => {
        // Load latest settings before creating popup
        if (window.__ondokiRedaction) {
          window.__ondokiRedaction.loadSettings().then(() => {
            createSmartBlurPopup();
          });
        } else {
          createSmartBlurPopup();
        }
      });
    }
  }

  function removeSmartBlur() {
    if (smartBlurElement) {
      smartBlurElement.remove();
      smartBlurElement = null;
      smartBlurOpen = false;
    }
  }

  // ===== DOCK OVERLAY =====
  let dockElement = null;
  let dockStepCount = 0;
  let dockTimerInterval = null;
  let dockStartTime = null;
  let dockIsPaused = false;

  function createDock() {
    if (dockElement) return;

    dockElement = document.createElement('div');
    dockElement.id = '__ondoki-dock__';
    dockElement.setAttribute('data-ondoki-exclude', 'true');

    const shadow = dockElement.attachShadow({ mode: 'closed' });

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
    shadow.getElementById('dockPause').addEventListener('click', async (e) => {
      e.stopPropagation();
      const state = await sendMsg({ type: 'GET_STATE' });
      if (state.isPaused) {
        await sendMsg({ type: 'RESUME_RECORDING' });
        dockIsPaused = false;
      } else {
        await sendMsg({ type: 'PAUSE_RECORDING' });
        dockIsPaused = true;
      }
      updateDockPauseUI(shadow);
    });

    shadow.getElementById('dockDelete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Delete this entire capture?')) {
        await sendMsg({ type: 'STOP_RECORDING' });
        await sendMsg({ type: 'CLEAR_STEPS' });
        removeDock();
      }
    });

    shadow.getElementById('dockComplete').addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendMsg({ type: 'STOP_RECORDING' });
      // Upload automatically — only clear on success
      const result = await sendMsg({ type: 'UPLOAD' });
      if (result.success) {
        await sendMsg({ type: 'CLEAR_STEPS' });
        removeDock();
        // Redirect to workflow page
        if (result.sessionId) {
          const settings = await sendMsg({ type: 'GET_SETTINGS' });
          const webAppUrl = settings.frontendUrl || (settings.apiBaseUrl || '').replace('/api/v1', '');
          if (webAppUrl) {
            window.open(`${webAppUrl}/workflows/${result.sessionId}`, '_blank');
          }
        }
      } else {
        // Show error feedback — flash the complete button red
        const btn = shadow.getElementById('dockComplete');
        if (btn) {
          btn.style.background = '#dc2626';
          setTimeout(() => { btn.style.background = ''; }, 2000);
        }
      }
    });

    document.documentElement.appendChild(dockElement);

    // Start timer
    sendMsg({ type: 'GET_STATE' }).then((state) => {
      dockStartTime = state.recordingStartTime;
      dockStepCount = state.stepCount || 0;
      dockIsPaused = state.isPaused;
      updateDockDisplay(shadow);
      updateDockPauseUI(shadow);
      dockTimerInterval = setInterval(() => updateDockDisplay(shadow), 1000);
    });
  }

  function updateDockDisplay(shadow) {
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
      stepsEl.textContent = dockStepCount;
    }
  }

  function updateDockPauseUI(shadow) {
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

  function removeDock() {
    if (dockTimerInterval) {
      clearInterval(dockTimerInterval);
      dockTimerInterval = null;
    }
    if (dockElement) {
      dockElement.remove();
      dockElement = null;
    }
  }

  function incrementDockSteps() {
    if (!dockElement) return;
    dockStepCount++;
    const shadow = dockElement.shadowRoot;
    if (shadow) updateDockDisplay(shadow);
  }

  function sendMsg(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response || {});
      });
    });
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    debugLog('Content script received message:', message.type);
    switch (message.type) {
      case 'START_RECORDING':
        startCapturing();
        sendResponse({ success: true });
        break;
      case 'STOP_RECORDING':
        stopCapturing();
        sendResponse({ success: true });
        break;
      case 'PAUSE_RECORDING':
        stopCapturing();
        // Update dock UI
        if (dockElement) {
          dockIsPaused = true;
          const shadow = dockElement.shadowRoot;
          if (shadow) updateDockPauseUI(shadow);
        }
        sendResponse({ success: true });
        break;
      case 'RESUME_RECORDING':
        startCapturing();
        // Update dock UI
        if (dockElement) {
          dockIsPaused = false;
          const shadow = dockElement.shadowRoot;
          if (shadow) updateDockPauseUI(shadow);
        }
        sendResponse({ success: true });
        break;
      case 'SHOW_DOCK':
        createDock();
        sendResponse({ success: true });
        break;
      case 'HIDE_DOCK':
        removeDock();
        sendResponse({ success: true });
        break;
      case 'HIDE_DOCK_TEMP':
        if (dockElement) dockElement.style.display = 'none';
        sendResponse({ success: true });
        break;
      case 'SHOW_DOCK_TEMP':
        if (dockElement) dockElement.style.display = '';
        sendResponse({ success: true });
        break;
      case 'TOGGLE_SMART_BLUR':
        toggleSmartBlur();
        sendResponse({ success: true, isOpen: smartBlurOpen });
        break;
      case 'CLOSE_SMART_BLUR':
        removeSmartBlur();
        sendResponse({ success: true });
        break;
      case 'STEP_ADDED':
        incrementDockSteps();
        sendResponse({ success: true });
        break;
      case 'PING':
        sendResponse({ alive: true });
        break;
    }
    return true;
  });

  // Check initial recording state
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.isRecording && !response.isPaused) {
        startCapturing();
      }
    });
  }, 100);
}

function startCapturing() {
  if (isRecording) return;
  isRecording = true;
  debugLog('Started capturing events');

  // Use pointerdown — fires before click handlers, captures pre-click state
  document.addEventListener('pointerdown', handleClick, { capture: true });
  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('focusin', handleFocusIn, true);
  document.addEventListener('focusout', handleFocusOut, true);
}

function stopCapturing() {
  isRecording = false;
  flushTypedText();
  debugLog('Stopped capturing events');

  document.removeEventListener('pointerdown', handleClick, { capture: true });
  document.removeEventListener('keydown', handleKeydown, true);
  document.removeEventListener('focusin', handleFocusIn, true);
  document.removeEventListener('focusout', handleFocusOut, true);
}

function handleClick(event) {
  if (!isRecording) return;

  // Only handle primary pointer (ignore multi-touch) and left/right clicks
  if (!event.isPrimary) return;
  if (event.button !== 0 && event.button !== 2) return;

  flushTypedText();

  const target = event.target;
  const rect = target.getBoundingClientRect();
  const now = Date.now();

  const elementInfo = gatherElementInfo(target);

  const relativeX = event.clientX - rect.left;
  const relativeY = event.clientY - rect.top;

  const buildStepData = (actionType, description) => ({
    actionType,
    pageTitle: document.title,
    description,
    globalPosition: { x: event.screenX, y: event.screenY },
    relativePosition: { x: relativeX, y: relativeY },
    clickPosition: { x: event.clientX, y: event.clientY },
    windowSize: { width: window.outerWidth, height: window.outerHeight },
    viewportSize: { width: window.innerWidth, height: window.innerHeight },
    url: window.location.href,
    elementInfo: elementInfo,
  });

  // Right-click: send immediately (no double-click possible)
  if (event.button === 2) {
    sendClickStep(buildStepData('Right Click', generateClickDescription(elementInfo, event.clientX, event.clientY, 'Right-click')));
    return;
  }

  // Left click: detect double-click
  if (now - lastClickTime < DOUBLE_CLICK_MS && lastClickTarget === target) {
    // Double-click detected — cancel pending single click, send double click
    clearTimeout(pendingClick);
    pendingClick = null;
    lastClickTime = 0;
    lastClickTarget = null;
    sendClickStep(buildStepData('Double Click', generateClickDescription(elementInfo, event.clientX, event.clientY, 'Double-click')));
  } else {
    // Potential single click — delay to see if a second click follows
    lastClickTime = now;
    lastClickTarget = target;
    const stepData = buildStepData('Left Click', generateClickDescription(elementInfo, event.clientX, event.clientY, 'Click'));
    clearTimeout(pendingClick);
    pendingClick = setTimeout(() => {
      sendClickStep(stepData);
      pendingClick = null;
    }, DOUBLE_CLICK_MS);
  }
}

// ===== INPUT BLUR TRACKING =====

function handleFocusIn(event) {
  const el = event.target;
  if (!isInputLike(el)) return;
  focusedFieldValue = el.value || '';
}

function handleFocusOut(event) {
  if (!isRecording) return;
  const el = event.target;
  if (!isInputLike(el)) return;

  const currentValue = el.value || '';
  if (currentValue === focusedFieldValue) {
    focusedFieldValue = null;
    return; // Value didn't change
  }

  // Skip sensitive fields
  if (el.type === 'password' || (el.autocomplete && /cc-|credit/i.test(el.autocomplete))) {
    focusedFieldValue = null;
    return;
  }

  flushTypedText(); // Flush any pending typed text first

  const elementInfo = gatherElementInfo(el);
  const fieldLabel = getBestLabel(elementInfo) || el.id || 'field';
  const displayValue = currentValue.length > 60 ? currentValue.substring(0, 57) + '...' : currentValue;
  const description = `Type "${displayValue}" in the "${cleanLabel(fieldLabel)}" field`;

  chrome.runtime.sendMessage({
    type: 'TYPE_EVENT',
    data: {
      actionType: 'Type',
      pageTitle: document.title,
      description: description,
      textTyped: currentValue,
      url: window.location.href,
      windowSize: { width: window.outerWidth, height: window.outerHeight },
      viewportSize: { width: window.innerWidth, height: window.innerHeight },
      elementInfo: elementInfo,
    },
  }).catch(() => {});

  focusedFieldValue = null;
}

function isInputLike(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' ||
    (el.isContentEditable && tag !== 'body');
}

function sendClickStep(stepData) {
  chrome.runtime
    .sendMessage({ type: 'CLICK_EVENT', data: stepData })
    .catch((err) => {
      debugLog('Failed to send click event', err);
    });

  // Track SELECT change: listen for change event to capture selected option
  const target = stepData.elementInfo?.tagName === 'select'
    ? document.querySelector(`select[name="${stepData.elementInfo.name}"]`) || document.activeElement
    : null;
  if (target && target.tagName === 'SELECT') {
    const onSelectChange = () => {
      target.removeEventListener('change', onSelectChange);
      const selectedOption = target.options[target.selectedIndex];
      if (selectedOption) {
        const label = getBestLabel(stepData.elementInfo) || 'dropdown';
        const desc = `Select "${selectedOption.text}" from the "${cleanLabel(label)}" dropdown`;
        chrome.runtime.sendMessage({
          type: 'TYPE_EVENT',
          data: {
            actionType: 'Select',
            pageTitle: document.title,
            description: desc,
            url: window.location.href,
            windowSize: { width: window.outerWidth, height: window.outerHeight },
            viewportSize: { width: window.innerWidth, height: window.innerHeight },
            elementInfo: stepData.elementInfo,
          },
        }).catch(() => {});
      }
    };
    target.addEventListener('change', onSelectChange, { once: true });
    // Auto-cleanup after 5 seconds if no change
    setTimeout(() => target.removeEventListener('change', onSelectChange), 5000);
  }
}

function handleKeydown(event) {
  if (!isRecording) return;

  // Skip password and sensitive fields
  const el = document.activeElement;
  if (el && (el.type === 'password' || el.autocomplete === 'cc-number' || el.autocomplete === 'cc-cvc' || el.autocomplete === 'cc-exp')) return;

  // Modifier combos (Ctrl+A, Ctrl+C, etc.) — flush text first, then record combo
  if (event.ctrlKey || event.metaKey || event.altKey) {
    if (event.key.length === 1 || ['Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      flushTypedText();
      const mods = [];
      if (event.ctrlKey) mods.push('Ctrl');
      if (event.metaKey) mods.push('Cmd');
      if (event.altKey) mods.push('Alt');
      if (event.shiftKey) mods.push('Shift');
      const keyName = event.key.length === 1 ? event.key.toUpperCase() : event.key;
      sendKeyStep(`Press ${mods.join('+')}+${keyName}`);
      return;
    }
  }

  // Special action keys — flush typed text, then record the key press
  if (['Enter', 'Tab', 'Escape', 'Delete', 'Backspace'].includes(event.key) && !event.ctrlKey && !event.metaKey) {
    flushTypedText();
    const keyLabel = event.key === 'Backspace' ? 'Delete' : event.key;
    sendKeyStep(`Press ${keyLabel}`);
    return;
  }

  // Skip lone modifier keys
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
    return;
  }

  // Regular character typing — accumulate
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    typedText += event.key;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(flushTypedText, TYPING_DELAY);
  }
}

function sendKeyStep(description) {
  const stepData = {
    actionType: 'Key',
    pageTitle: document.title,
    description: description,
    url: window.location.href,
    windowSize: { width: window.outerWidth, height: window.outerHeight },
    viewportSize: { width: window.innerWidth, height: window.innerHeight },
  };

  chrome.runtime
    .sendMessage({ type: 'TYPE_EVENT', data: stepData })
    .catch((err) => {
      debugLog('Failed to send key event', err);
    });
}

function flushTypedText() {
  clearTimeout(typingTimer);

  if (typedText.length === 0) return;

  const activeElement = document.activeElement;
  const elementInfo = activeElement ? gatherElementInfo(activeElement) : null;

  const fieldName = elementInfo
    ? (getBestLabel(elementInfo) || elementInfo.id || '')
    : '';
  const description = fieldName
    ? `Type "${typedText}" into the "${cleanLabel(fieldName)}" field`
    : `Type "${typedText}"`;

  const stepData = {
    actionType: 'Type',
    pageTitle: document.title,
    description: description,
    textTyped: typedText,
    url: window.location.href,
    windowSize: { width: window.outerWidth, height: window.outerHeight },
    viewportSize: { width: window.innerWidth, height: window.innerHeight },
    elementInfo: elementInfo,
  };

  chrome.runtime
    .sendMessage({ type: 'TYPE_EVENT', data: stepData })
    .catch((err) => {
      debugLog('Failed to send type event', err);
    });

  typedText = '';
}

// ===== ELEMENT IDENTIFICATION =====

function gatherElementInfo(target) {
  const tag = target.tagName.toLowerCase();
  return {
    tagName: tag,
    id: target.id || null,
    className: typeof target.className === 'string' ? target.className : null,
    text: getElementText(target),
    href: target.href || null,
    type: target.type || null,
    name: target.name || null,
    placeholder: target.placeholder || null,
    ariaLabel: target.getAttribute('aria-label') || null,
    role: target.getAttribute('role') || null,
    title: target.getAttribute('title') || null,
    alt: target.getAttribute('alt') || null,
    associatedLabel: getAssociatedLabel(target),
    parentText: getParentText(target),
    testId: target.getAttribute('data-testid') || target.getAttribute('data-test') || target.getAttribute('data-cy') || null,
    elementRect: {
      x: target.getBoundingClientRect().left,
      y: target.getBoundingClientRect().top,
      width: target.getBoundingClientRect().width,
      height: target.getBoundingClientRect().height,
    },
  };
}

function getAssociatedLabel(el) {
  // 1. <label for="elementId">
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return cleanLabel(label.textContent);
  }
  // 2. Parent <label>
  const parentLabel = el.closest('label');
  if (parentLabel) {
    // Get label text excluding the input's own text
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input, select, textarea').forEach(c => c.remove());
    const text = clone.textContent.trim();
    if (text) return cleanLabel(text);
  }
  // 3. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy.split(/\s+/).map(id => {
      const ref = document.getElementById(id);
      return ref ? ref.textContent.trim() : '';
    }).filter(Boolean);
    if (parts.length) return cleanLabel(parts.join(' '));
  }
  return null;
}

function getParentText(el) {
  const parent = el.parentElement;
  if (!parent) return null;
  const text = (parent.innerText || parent.textContent || '').trim();
  if (text.length > 0 && text.length <= 100) return text;
  return null;
}

function getElementText(element) {
  const text = element.innerText || element.textContent || '';
  return text.trim().substring(0, 100);
}

function cleanLabel(text) {
  return text.trim().replace(/\s+/g, ' ').substring(0, 60);
}

// Get the best label for an element using Scribe's priority chain
function getBestLabel(info) {
  return info.ariaLabel
    || info.associatedLabel
    || info.placeholder
    || info.title
    || info.alt
    || info.name
    || info.parentText
    || null;
}

function generateClickDescription(elementInfo, x, y, prefix) {
  const tag = elementInfo.tagName;
  const bestLabel = getBestLabel(elementInfo);

  // Buttons
  if (tag === 'button' || elementInfo.type === 'submit' || elementInfo.role === 'button') {
    const label = elementInfo.ariaLabel || elementInfo.text || bestLabel || 'button';
    return `${prefix} the "${cleanLabel(label)}" button`;
  }

  // Links
  if (tag === 'a') {
    const label = elementInfo.text || elementInfo.ariaLabel || bestLabel || 'link';
    return `${prefix} the "${cleanLabel(label)}" link`;
  }

  // Checkboxes
  if (elementInfo.type === 'checkbox') {
    const label = bestLabel || elementInfo.text || '';
    return label ? `${prefix} the "${cleanLabel(label)}" checkbox` : `${prefix} checkbox`;
  }

  // Radio buttons
  if (elementInfo.type === 'radio') {
    const label = bestLabel || elementInfo.text || '';
    return label ? `Select the "${cleanLabel(label)}" option` : `${prefix} radio option`;
  }

  // Select/dropdown
  if (tag === 'select') {
    const label = bestLabel || 'dropdown';
    return `${prefix} the "${cleanLabel(label)}" dropdown`;
  }

  // Input/textarea
  if (tag === 'input' || tag === 'textarea') {
    const label = bestLabel || elementInfo.type + ' field';
    return `${prefix} the "${cleanLabel(label)}" field`;
  }

  // Tabs / menu items
  if (elementInfo.role === 'tab' || elementInfo.role === 'menuitem') {
    const label = elementInfo.text || elementInfo.ariaLabel || '';
    return label ? `${prefix} the "${cleanLabel(label)}" tab` : `${prefix} tab`;
  }

  // Images
  if (tag === 'img') {
    const label = elementInfo.alt || elementInfo.title || 'image';
    return `${prefix} the "${cleanLabel(label)}" image`;
  }

  // Elements with meaningful short text
  if (elementInfo.text && elementInfo.text.length > 0 && elementInfo.text.length <= 60) {
    return `${prefix} "${cleanLabel(elementInfo.text)}"`;
  }

  // Fallback
  return `${prefix} on the page`;
}
