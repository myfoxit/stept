let isRecording = false;
let typedText = '';
let typingTimer = null;
let lastClickTime = 0;
let lastClickTarget = null;
let pendingClick = null;
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
      // Upload automatically
      await sendMsg({ type: 'UPLOAD' });
      await sendMsg({ type: 'CLEAR_STEPS' });
      removeDock();
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
        isRecording = false;
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
}

function stopCapturing() {
  isRecording = false;
  flushTypedText();
  debugLog('Stopped capturing events');

  document.removeEventListener('pointerdown', handleClick, { capture: true });
  document.removeEventListener('keydown', handleKeydown, true);
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

  const elementInfo = {
    tagName: target.tagName.toLowerCase(),
    id: target.id || null,
    className: typeof target.className === 'string' ? target.className : null,
    text: getElementText(target),
    href: target.href || null,
    type: target.type || null,
    name: target.name || null,
    placeholder: target.placeholder || null,
    ariaLabel: target.getAttribute('aria-label') || null,
  };

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

function sendClickStep(stepData) {
  chrome.runtime
    .sendMessage({ type: 'CLICK_EVENT', data: stepData })
    .catch((err) => {
      debugLog('Failed to send click event', err);
    });
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
  const elementInfo = activeElement
    ? {
        tagName: activeElement.tagName.toLowerCase(),
        id: activeElement.id || null,
        className:
          typeof activeElement.className === 'string'
            ? activeElement.className
            : null,
        type: activeElement.type || null,
        name: activeElement.name || null,
        placeholder: activeElement.placeholder || null,
      }
    : null;

  const fieldName = elementInfo?.placeholder || elementInfo?.name || elementInfo?.id || '';
  const description = fieldName
    ? `Type "${typedText}" into "${fieldName}"`
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

function getElementText(element) {
  const text = element.innerText || element.textContent || '';
  return text.trim().substring(0, 100);
}

function generateClickDescription(elementInfo, x, y, prefix) {
  if (elementInfo.tagName === 'button' || elementInfo.type === 'submit') {
    const label = elementInfo.text || elementInfo.ariaLabel || 'button';
    return `${prefix} "${label}"`;
  } else if (elementInfo.tagName === 'a') {
    const label = elementInfo.text || 'link';
    return `${prefix} "${label}"`;
  } else if (elementInfo.tagName === 'input') {
    const inputType = elementInfo.type || 'text';
    const label = elementInfo.placeholder || elementInfo.name || inputType + ' field';
    return `${prefix} "${label}"`;
  } else if (elementInfo.tagName === 'select') {
    const label = elementInfo.name || elementInfo.ariaLabel || 'dropdown';
    return `${prefix} "${label}"`;
  } else if (elementInfo.text && elementInfo.text.length > 0) {
    return `${prefix} "${elementInfo.text.substring(0, 50)}"`;
  } else {
    return `${prefix} on ${elementInfo.tagName} element`;
  }
}
