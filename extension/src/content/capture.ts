// ===== EVENT CAPTURE =====
// Mechanical port from content.js — event handler setup/teardown, click/key/focus handling

import { gatherElementInfo, getBestLabel, generateClickDescription, cleanLabel, type ElementInfo } from './elements';
import { captureDomSnapshot } from './dom-snapshot';
import { debugLog } from './index';

let isRecording = false;
let typedText = '';
let typingTimer: ReturnType<typeof setTimeout> | null = null;
let lastClickTime = 0;
let lastClickTarget: EventTarget | null = null;
let pendingClick: ReturnType<typeof setTimeout> | null = null;
let focusedFieldValue: string | null = null; // Track value on focus for blur comparison
const TYPING_DELAY = 1000;
const DOUBLE_CLICK_MS = 400;

interface StepData {
  actionType: string;
  pageTitle: string;
  description: string;
  globalPosition?: { x: number; y: number };
  relativePosition?: { x: number; y: number };
  clickPosition?: { x: number; y: number };
  windowSize: { width: number; height: number };
  viewportSize: { width: number; height: number };
  url: string;
  elementInfo?: ElementInfo | null;
  textTyped?: string;
  domSnapshot?: string;
}

function isInputLike(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' ||
    ((el as HTMLElement).isContentEditable && tag !== 'body');
}

function sendClickStep(stepData: StepData): void {
  // Capture DOM snapshot for click events (non-blocking, best-effort)
  const domSnapshot = captureDomSnapshot();
  const messageData: StepData = domSnapshot
    ? Object.assign({}, stepData, { domSnapshot: domSnapshot })
    : stepData;

  chrome.runtime
    .sendMessage({ type: 'CLICK_EVENT', data: messageData })
    .catch((err: unknown) => {
      debugLog('Failed to send click event', err);
    });

  // Track SELECT change: listen for change event to capture selected option
  const target = stepData.elementInfo?.tagName === 'select'
    ? document.querySelector(`select[name="${stepData.elementInfo.name}"]`) || document.activeElement
    : null;
  if (target && target.tagName === 'SELECT') {
    const selectTarget = target as HTMLSelectElement;
    const onSelectChange = (): void => {
      selectTarget.removeEventListener('change', onSelectChange);
      const selectedOption = selectTarget.options[selectTarget.selectedIndex];
      if (selectedOption) {
        const label = getBestLabel(stepData.elementInfo!) || 'dropdown';
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
    selectTarget.addEventListener('change', onSelectChange, { once: true });
    // Auto-cleanup after 5 seconds if no change
    setTimeout(() => selectTarget.removeEventListener('change', onSelectChange), 5000);
  }
}

function sendKeyStep(description: string): void {
  const stepData: StepData = {
    actionType: 'Key',
    pageTitle: document.title,
    description: description,
    url: window.location.href,
    windowSize: { width: window.outerWidth, height: window.outerHeight },
    viewportSize: { width: window.innerWidth, height: window.innerHeight },
  };

  chrome.runtime
    .sendMessage({ type: 'TYPE_EVENT', data: stepData })
    .catch((err: unknown) => {
      debugLog('Failed to send key event', err);
    });
}

function flushTypedText(): void {
  clearTimeout(typingTimer as ReturnType<typeof setTimeout>);

  if (typedText.length === 0) return;

  const activeElement = document.activeElement;
  const elementInfo = activeElement ? gatherElementInfo(activeElement) : null;

  const fieldName = elementInfo
    ? (getBestLabel(elementInfo) || elementInfo.id || '')
    : '';
  const description = fieldName
    ? `Type "${typedText}" into the "${cleanLabel(fieldName)}" field`
    : `Type "${typedText}"`;

  const stepData: StepData = {
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
    .catch((err: unknown) => {
      debugLog('Failed to send type event', err);
    });

  typedText = '';

  // Sync focusedFieldValue so handleFocusOut doesn't duplicate this step
  if (activeElement && isInputLike(activeElement as Element)) {
    focusedFieldValue = (activeElement as HTMLInputElement).value || '';
  }
}

function handleClick(event: PointerEvent): void {
  if (!isRecording) return;

  // Only handle primary pointer (ignore multi-touch) and left/right clicks
  if (!event.isPrimary) return;
  if (event.button !== 0 && event.button !== 2) return;

  flushTypedText();

  // Pre-capture screenshot immediately at pointerdown, BEFORE click effects propagate.
  // Background stores the result and uses it when CLICK_EVENT arrives later.
  chrome.runtime.sendMessage({ type: 'PRE_CAPTURE' }).catch(() => {});

  const target = event.target as Element;
  const rect = target.getBoundingClientRect();
  const now = Date.now();

  const elementInfo = gatherElementInfo(target);

  const relativeX = event.clientX - rect.left;
  const relativeY = event.clientY - rect.top;

  const buildStepData = (actionType: string, description: string): StepData => ({
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
    clearTimeout(pendingClick as ReturnType<typeof setTimeout>);
    pendingClick = null;
    lastClickTime = 0;
    lastClickTarget = null;
    sendClickStep(buildStepData('Double Click', generateClickDescription(elementInfo, event.clientX, event.clientY, 'Double-click')));
  } else {
    // Potential single click — delay to see if a second click follows
    lastClickTime = now;
    lastClickTarget = target;
    const stepData = buildStepData('Left Click', generateClickDescription(elementInfo, event.clientX, event.clientY, 'Click'));
    clearTimeout(pendingClick as ReturnType<typeof setTimeout>);

    // For navigation-triggering elements, send immediately (page may unload)
    const tag = (target as HTMLElement).tagName?.toLowerCase();
    const isLink = tag === 'a' || !!(target as HTMLElement).closest?.('a');
    const isSubmit = (tag === 'button' && (target as HTMLButtonElement).type === 'submit') ||
                     tag === 'input' && (target as HTMLInputElement).type === 'submit';
    if (isLink || isSubmit) {
      sendClickStep(stepData);
      pendingClick = null;
    } else {
      pendingClick = setTimeout(() => {
        sendClickStep(stepData);
        pendingClick = null;
      }, DOUBLE_CLICK_MS);
    }
  }
}

// ===== INPUT BLUR TRACKING =====

function handleFocusIn(event: FocusEvent): void {
  const el = event.target as HTMLInputElement;
  if (!isInputLike(el as Element)) return;
  focusedFieldValue = el.value || '';
}

function handleFocusOut(event: FocusEvent): void {
  if (!isRecording) return;
  const el = event.target as HTMLInputElement;
  if (!isInputLike(el as Element)) return;

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

function handleKeydown(event: KeyboardEvent): void {
  if (!isRecording) return;

  // Skip password and sensitive fields
  const el = document.activeElement as HTMLInputElement | null;
  if (el && (el.type === 'password' || (el.autocomplete as string) === 'cc-number' || (el.autocomplete as string) === 'cc-cvc' || (el.autocomplete as string) === 'cc-exp')) return;

  // Modifier combos (Ctrl+A, Ctrl+C, etc.) — flush text first, then record combo
  if (event.ctrlKey || event.metaKey || event.altKey) {
    if (event.key.length === 1 || ['Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      flushTypedText();
      const mods: string[] = [];
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
    clearTimeout(typingTimer as ReturnType<typeof setTimeout>);
    typingTimer = setTimeout(flushTypedText, TYPING_DELAY);
  }
}

function handlePageUnload(): void {
  // Flush any pending click or typing before page unloads
  if (pendingClick) {
    clearTimeout(pendingClick);
    pendingClick = null;
  }
  flushTypedText();
}

/** Apply JS overrides to preserve canvas/blob content during capture (Storylane technique). */
function applyJsOverrides(): void {
  if ((window as any).__steptOverridesApplied) return;
  (window as any).__steptOverridesApplied = true;

  // 1. Force WebGL preserveDrawingBuffer so canvas.toDataURL() works
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type: string, opts?: any) {
    if (type === 'webgl' || type === 'webgl2') {
      opts = Object.assign({}, opts, { preserveDrawingBuffer: true });
    }
    return origGetContext.call(this, type, opts) as any;
  } as any;

  // 2. Prevent blob URL revocation so resources survive capture
  const origRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = function (url: string) {
    // No-op during recording — blobs stay alive for snapshot capture
    if (isRecording) return;
    return origRevoke.call(this, url);
  };

  debugLog('JS overrides applied (WebGL buffer, blob revocation)');
}

export function startCapturing(): void {
  if (isRecording) return;
  isRecording = true;
  debugLog('Started capturing events');

  applyJsOverrides();

  // Use pointerdown — fires before click handlers, captures pre-click state
  document.addEventListener('pointerdown', handleClick, { capture: true });
  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('focusin', handleFocusIn as EventListener, true);
  document.addEventListener('focusout', handleFocusOut as EventListener, true);
  window.addEventListener('pagehide', handlePageUnload);
}

export function stopCapturing(): void {
  isRecording = false;
  flushTypedText();
  debugLog('Stopped capturing events');

  document.removeEventListener('pointerdown', handleClick, { capture: true });
  document.removeEventListener('keydown', handleKeydown, true);
  document.removeEventListener('focusin', handleFocusIn as EventListener, true);
  document.removeEventListener('focusout', handleFocusOut as EventListener, true);
  window.removeEventListener('pagehide', handlePageUnload);
}
