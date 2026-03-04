/**
 * PII Redaction Module — DOM-level redaction before screenshot capture.
 *
 * Flow:
 * 1. content.js detects click → sends message to background.js
 * 2. background.js tells content.js to APPLY_REDACTION
 * 3. content.js calls applyRedaction() — CSS blur + value replacement
 * 4. content.js sends "redaction-applied" to background.js
 * 5. background.js calls captureVisibleTab()
 * 6. background.js tells content.js to REMOVE_REDACTION
 * 7. content.js calls removeRedaction() — restores original state
 *
 * Content scripts can't use ES modules — this uses an IIFE + message passing.
 */

(function () {
  'use strict';

  // WeakMap to store original values for restoration
  const originalValues = new WeakMap();
  const REDACTION_ATTR = 'data-ondoki-redacted';

  // Default redaction settings
  let redactionSettings = {
    enabled: true,
    formFields: true,
    emails: true,
    names: false,
    numbers: false,
  };

  // Load settings from storage
  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['redactionSettings'], (result) => {
        if (result.redactionSettings) {
          redactionSettings = { ...redactionSettings, ...result.redactionSettings };
        }
        resolve(redactionSettings);
      });
    });
  }

  // CSS selectors for sensitive form fields
  const SENSITIVE_FIELD_SELECTORS = [
    'input[type="password"]',
    'input[type="email"]',
    'input[autocomplete*="email"]',
    'input[autocomplete*="name"]',
    'input[autocomplete*="given"]',
    'input[autocomplete*="family"]',
    'input[type="tel"]',
    'input[autocomplete*="tel"]',
    'input[autocomplete*="cc-"]',
    'input[autocomplete*="address"]',
    'input[autocomplete*="postal"]',
    'input[autocomplete*="street"]',
    'input[name*="ssn" i]',
    'input[name*="social" i]',
    'input[name*="tax" i]',
  ];

  // Email pattern for text nodes
  const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

  /**
   * Apply redaction to all sensitive elements in the DOM.
   * Returns a count of redacted elements.
   */
  function applyRedaction() {
    if (!redactionSettings.enabled) return 0;
    let count = 0;

    // Redact sensitive form fields
    if (redactionSettings.formFields) {
      const selector = SENSITIVE_FIELD_SELECTORS.join(', ');
      document.querySelectorAll(selector).forEach((el) => {
        if (el.getAttribute(REDACTION_ATTR)) return;
        if (el.value && el.value.length > 0) {
          originalValues.set(el, { value: el.value });
          el.value = '\u2022'.repeat(Math.min(el.value.length, 20));
          el.setAttribute(REDACTION_ATTR, 'value');
          count++;
        }
      });
    }

    // Blur text containers with email patterns
    if (redactionSettings.emails) {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (!node.textContent || node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;
            if (node.parentElement?.closest(`[${REDACTION_ATTR}]`)) return NodeFilter.FILTER_REJECT;
            if (node.parentElement?.closest('[data-ondoki-exclude]')) return NodeFilter.FILTER_REJECT;
            if (EMAIL_REGEX.test(node.textContent)) return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_REJECT;
          },
        },
      );

      const emailNodes = [];
      while (walker.nextNode()) emailNodes.push(walker.currentNode);

      emailNodes.forEach((textNode) => {
        const parent = textNode.parentElement;
        if (!parent || parent.getAttribute(REDACTION_ATTR)) return;
        originalValues.set(parent, {
          filter: parent.style.filter,
          webkitFilter: parent.style.webkitFilter,
        });
        parent.style.filter = 'blur(4px)';
        parent.style.webkitFilter = 'blur(4px)';
        parent.setAttribute(REDACTION_ATTR, 'blur');
        count++;
      });
    }

    return count;
  }

  /**
   * Remove all redaction — restore original values and styles.
   */
  function removeRedaction() {
    document.querySelectorAll(`[${REDACTION_ATTR}]`).forEach((el) => {
      const original = originalValues.get(el);
      const redactType = el.getAttribute(REDACTION_ATTR);

      if (redactType === 'value' && original) {
        el.value = original.value;
      } else if (redactType === 'blur' && original) {
        el.style.filter = original.filter || '';
        el.style.webkitFilter = original.webkitFilter || '';
      }

      el.removeAttribute(REDACTION_ATTR);
      originalValues.delete(el);
    });
  }

  // Listen for redaction messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'APPLY_REDACTION':
        loadSettings().then(() => {
          const count = applyRedaction();
          sendResponse({ success: true, redactedCount: count });
        });
        return true; // async response

      case 'REMOVE_REDACTION':
        removeRedaction();
        sendResponse({ success: true });
        break;

      case 'GET_REDACTION_SETTINGS':
        loadSettings().then((settings) => {
          sendResponse(settings);
        });
        return true;

      case 'SET_REDACTION_SETTINGS':
        redactionSettings = { ...redactionSettings, ...message.settings };
        chrome.storage.local.set({ redactionSettings });
        sendResponse({ success: true });
        break;
    }
  });

  // Expose for inline use by content.js
  window.__ondokiRedaction = { applyRedaction, removeRedaction, loadSettings };
})();
