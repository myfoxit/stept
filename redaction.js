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
    names: true,
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

  // Number pattern: sequences of 4+ digits (credit cards, SSNs, phone numbers, etc.)
  const NUMBER_REGEX = /\d{4,}/;

  // ~200 most common US first names (census-based) for name redaction
  const COMMON_NAMES = new Set([
    'james','mary','robert','patricia','john','jennifer','michael','linda',
    'david','elizabeth','william','barbara','richard','susan','joseph','jessica',
    'thomas','sarah','charles','karen','christopher','lisa','daniel','nancy',
    'matthew','betty','anthony','margaret','mark','sandra','donald','ashley',
    'steven','kimberly','paul','emily','andrew','donna','joshua','michelle',
    'kenneth','dorothy','kevin','carol','brian','amanda','george','melissa',
    'timothy','deborah','ronald','stephanie','edward','rebecca','jason','sharon',
    'jeffrey','laura','ryan','cynthia','jacob','kathleen','gary','amy',
    'nicholas','angela','eric','shirley','jonathan','anna','stephen','brenda',
    'larry','pamela','justin','emma','scott','nicole','brandon','helen',
    'benjamin','samantha','samuel','katherine','raymond','christine','gregory','debra',
    'frank','rachel','alexander','carolyn','patrick','janet','jack','catherine',
    'dennis','maria','jerry','heather','tyler','diane','aaron','ruth',
    'jose','julie','adam','olivia','nathan','joyce','henry','virginia',
    'peter','victoria','zachary','kelly','douglas','lauren','harold','christina',
    'carl','joan','arthur','evelyn','gerald','judith','roger','megan',
    'keith','andrea','jeremy','cheryl','terry','hannah','lawrence','jacqueline',
    'sean','martha','christian','gloria','austin','teresa','jesse','ann',
    'willie','sara','billy','madison','bruce','frances','albert','kathryn',
    'jordan','janice','dylan','jean','ralph','abigail','gabriel','alice',
    'joe','judy','eugene','sophia','wayne','grace','ethan','denise',
    'russell','amber','elijah','doris','alan','marilyn','philip','danielle',
    'roy','beverly','vincent','isabella','bobby','theresa','johnny','diana',
    'logan','natalie','noah','brittany','liam','charlotte','mason','marie',
    'aiden','kayla','jackson','alexis','lucas','sophia',
  ]);

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

    // Helper to blur a text node's parent element
    function blurParent(textNode) {
      const parent = textNode.parentElement;
      if (!parent || parent.getAttribute(REDACTION_ATTR)) return false;
      originalValues.set(parent, {
        filter: parent.style.filter,
        webkitFilter: parent.style.webkitFilter,
      });
      parent.style.filter = 'blur(4px)';
      parent.style.webkitFilter = 'blur(4px)';
      parent.setAttribute(REDACTION_ATTR, 'blur');
      return true;
    }

    // Walk text nodes once and check for emails, names, and numbers
    const checkEmails = redactionSettings.emails;
    const checkNames = redactionSettings.names;
    const checkNumbers = redactionSettings.numbers;

    if (checkEmails || checkNames || checkNumbers) {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (!node.textContent || node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;
            if (node.parentElement?.closest(`[${REDACTION_ATTR}]`)) return NodeFilter.FILTER_REJECT;
            if (node.parentElement?.closest('[data-ondoki-exclude]')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );

      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      textNodes.forEach((textNode) => {
        if (textNode.parentElement?.getAttribute(REDACTION_ATTR)) return;
        const text = textNode.textContent;

        // Check emails
        if (checkEmails && EMAIL_REGEX.test(text)) {
          if (blurParent(textNode)) count++;
          return;
        }

        // Check names — split by whitespace, match against common names
        if (checkNames) {
          const words = text.split(/\s+/);
          for (const word of words) {
            const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
            if (clean.length >= 2 && COMMON_NAMES.has(clean)) {
              if (blurParent(textNode)) count++;
              return;
            }
          }
        }

        // Check numbers — 4+ digit sequences
        if (checkNumbers && NUMBER_REGEX.test(text)) {
          if (blurParent(textNode)) count++;
        }
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
