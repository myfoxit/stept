let isRecording = false;
let typedText = '';
let typingTimer = null;
const TYPING_DELAY = 1000;
const DEBUG = false;

function debugLog(...args) {
  if (DEBUG) console.log('[Ondoki]', ...args);
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
  }
  return true;
});

function startCapturing() {
  if (isRecording) return;
  isRecording = true;
  debugLog('Started capturing events');

  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown, true);
}

function stopCapturing() {
  isRecording = false;
  flushTypedText();
  debugLog('Stopped capturing events');

  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeydown, true);
}

function handleClick(event) {
  if (!isRecording) return;

  flushTypedText();

  const target = event.target;
  const rect = target.getBoundingClientRect();

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

  const buttonName =
    event.button === 0 ? 'Left' : event.button === 2 ? 'Right' : 'Middle';

  const stepData = {
    actionType: `${buttonName} Click`,
    pageTitle: document.title,
    description: generateClickDescription(
      elementInfo,
      event.clientX,
      event.clientY,
    ),
    globalPosition: { x: event.screenX, y: event.screenY },
    relativePosition: { x: relativeX, y: relativeY },
    clickPosition: { x: event.clientX, y: event.clientY },
    windowSize: { width: window.outerWidth, height: window.outerHeight },
    viewportSize: { width: window.innerWidth, height: window.innerHeight },
    url: window.location.href,
    elementInfo: elementInfo,
  };

  chrome.runtime
    .sendMessage({ type: 'CLICK_EVENT', data: stepData })
    .catch((err) => {
      debugLog('Failed to send click event', err);
    });
}

function handleKeydown(event) {
  if (!isRecording) return;

  if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') {
    flushTypedText();
    return;
  }

  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
    return;
  }

  if (event.key === 'Backspace') {
    typedText = typedText.slice(0, -1);
  } else if (event.key.length === 1) {
    typedText += event.key;
  }

  clearTimeout(typingTimer);
  typingTimer = setTimeout(flushTypedText, TYPING_DELAY);
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

function generateClickDescription(elementInfo, x, y) {
  if (elementInfo.tagName === 'button' || elementInfo.type === 'submit') {
    const label = elementInfo.text || elementInfo.ariaLabel || 'button';
    return `Click "${label}"`;
  } else if (elementInfo.tagName === 'a') {
    const label = elementInfo.text || 'link';
    return `Click "${label}"`;
  } else if (elementInfo.tagName === 'input') {
    const inputType = elementInfo.type || 'text';
    const label = elementInfo.placeholder || elementInfo.name || inputType + ' field';
    return `Click "${label}"`;
  } else if (elementInfo.tagName === 'select') {
    const label = elementInfo.name || elementInfo.ariaLabel || 'dropdown';
    return `Click "${label}"`;
  } else if (elementInfo.text && elementInfo.text.length > 0) {
    return `Click "${elementInfo.text.substring(0, 50)}"`;
  } else {
    return `Click on ${elementInfo.tagName} element`;
  }
}

// Check initial recording state
setTimeout(() => {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.isRecording && !response.isPaused) {
      startCapturing();
    }
  });
}, 100);
