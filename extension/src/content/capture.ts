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
  typingTimer = null;

  if (typedText.length === 0) return;

  const activeElement = document.activeElement;
  const elementInfo = activeElement ? gatherElementInfo(activeElement) : null;

  // Use actual field value if available for more accurate representation
  let finalText = typedText;
  if (activeElement && isInputLike(activeElement as Element)) {
    const currentValue = (activeElement as HTMLInputElement).value || '';
    // If we have a focusedFieldValue baseline, use the net change
    if (focusedFieldValue !== null && currentValue !== focusedFieldValue) {
      finalText = currentValue;
    }
  }

  const displayText = finalText.length > 60 ? finalText.substring(0, 57) + '...' : finalText;
  const fieldName = elementInfo
    ? (getBestLabel(elementInfo) || elementInfo.id || '')
    : '';
  const description = fieldName
    ? `Type "${displayText}" into the "${cleanLabel(fieldName)}" field`
    : `Type "${displayText}"`;

  const stepData: StepData = {
    actionType: 'Type',
    pageTitle: document.title,
    description: description,
    textTyped: finalText,
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
    pendingClick = setTimeout(() => {
      sendClickStep(stepData);
      pendingClick = null;
    }, DOUBLE_CLICK_MS);
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

  // Flush any pending typed text — this already emits the step if needed
  flushTypedText();

  // Reset focus tracking (flushTypedText already synced focusedFieldValue)
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

  // Backspace/Delete while typing: update accumulated text instead of separate step
  if (['Backspace', 'Delete'].includes(event.key) && !event.ctrlKey && !event.metaKey) {
    if (typedText.length > 0) {
      // Remove last character from accumulated text
      if (event.key === 'Backspace') {
        typedText = typedText.slice(0, -1);
      }
      // Reset the typing timer
      clearTimeout(typingTimer as ReturnType<typeof setTimeout>);
      typingTimer = setTimeout(flushTypedText, TYPING_DELAY);
      return;
    }
    // No accumulated text — record as a standalone key press
    sendKeyStep(`Press ${event.key === 'Backspace' ? 'Delete' : event.key}`);
    return;
  }

  // Other special action keys — flush typed text, then record the key press
  if (['Enter', 'Tab', 'Escape'].includes(event.key) && !event.ctrlKey && !event.metaKey) {
    flushTypedText();
    sendKeyStep(`Press ${event.key}`);
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

export function startCapturing(): void {
  if (isRecording) return;
  isRecording = true;
  debugLog('Started capturing events');

  // Use pointerdown — fires before click handlers, captures pre-click state
  document.addEventListener('pointerdown', handleClick, { capture: true });
  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('focusin', handleFocusIn as EventListener, true);
  document.addEventListener('focusout', handleFocusOut as EventListener, true);
}

export function stopCapturing(): void {
  isRecording = false;
  flushTypedText();
  debugLog('Stopped capturing events');

  document.removeEventListener('pointerdown', handleClick, { capture: true });
  document.removeEventListener('keydown', handleKeydown, true);
  document.removeEventListener('focusin', handleFocusIn as EventListener, true);
  document.removeEventListener('focusout', handleFocusOut as EventListener, true);
}
