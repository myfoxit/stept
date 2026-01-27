let isRecording = false;
let typedText = '';
let typingTimer = null;
const TYPING_DELAY = 1000;

console.log('Snaprow content script loaded');

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message.type);
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
  console.log('Snaprow: Started capturing events');

  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown, true);
}

function stopCapturing() {
  isRecording = false;
  flushTypedText();
  console.log('Snaprow: Stopped capturing events');

  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeydown, true);
}

function handleClick(event) {
  if (!isRecording) return;

  // Flush any pending typed text before recording click
  flushTypedText();

  const target = event.target;
  const rect = target.getBoundingClientRect();

  // Get element information
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

  // Calculate click position relative to element
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

  console.log('Snaprow: Sending click event', stepData.actionType);
  chrome.runtime
    .sendMessage({ type: 'CLICK_EVENT', data: stepData })
    .catch((err) => {
      console.error('Snaprow: Failed to send click event', err);
    });
}

function handleKeydown(event) {
  if (!isRecording) return;

  // Handle special keys that should flush typed text
  if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') {
    flushTypedText();
    return;
  }

  // Skip modifier keys alone
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
    return;
  }

  // Handle backspace
  if (event.key === 'Backspace') {
    typedText = typedText.slice(0, -1);
  } else if (event.key.length === 1) {
    // Regular character
    typedText += event.key;
  }

  // Reset typing timer
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

  const stepData = {
    actionType: 'Type',
    pageTitle: document.title,
    description: `Typed: "${typedText}"`,
    textTyped: typedText,
    url: window.location.href,
    windowSize: { width: window.outerWidth, height: window.outerHeight },
    viewportSize: { width: window.innerWidth, height: window.innerHeight },
    elementInfo: elementInfo,
  };

  console.log('Snaprow: Sending type event');
  chrome.runtime
    .sendMessage({ type: 'TYPE_EVENT', data: stepData })
    .catch((err) => {
      console.error('Snaprow: Failed to send type event', err);
    });

  typedText = '';
}

function getElementText(element) {
  // Get meaningful text from element
  const text = element.innerText || element.textContent || '';
  return text.trim().substring(0, 100); // Limit length
}

function generateClickDescription(elementInfo, x, y) {
  let description = `Clicked`;

  if (elementInfo.tagName === 'button' || elementInfo.type === 'submit') {
    description = `Clicked button "${elementInfo.text || elementInfo.ariaLabel || 'unnamed'}"`;
  } else if (elementInfo.tagName === 'a') {
    description = `Clicked link "${elementInfo.text || elementInfo.href || 'unnamed'}"`;
  } else if (elementInfo.tagName === 'input') {
    const inputType = elementInfo.type || 'text';
    description = `Clicked ${inputType} input "${elementInfo.placeholder || elementInfo.name || 'unnamed'}"`;
  } else if (elementInfo.text) {
    description = `Clicked on "${elementInfo.text.substring(0, 50)}"`;
  } else {
    description = `Clicked at (${x}, ${y}) on ${elementInfo.tagName}`;
  }

  return description;
}

// Check initial recording state
setTimeout(() => {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log(
        'Snaprow: Could not get initial state',
        chrome.runtime.lastError.message,
      );
      return;
    }
    if (response && response.isRecording && !response.isPaused) {
      console.log('Snaprow: Recording already active, starting capture');
      startCapturing();
    }
  });
}, 100);
