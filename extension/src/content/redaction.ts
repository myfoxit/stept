/**
 * PII Redaction Module — Live per-category redaction on the page.
 *
 * Categories:
 *   emails     — blur elements containing email addresses
 *   names      — blur elements containing common first names
 *   numbers    — blur elements containing 4+ digit sequences
 *   formFields — replace sensitive form field values with bullets
 *   longText   — blur text nodes >100 chars
 *   images     — blur all <img> elements
 *
 * Each category can be toggled independently in real-time.
 * Redaction persists on the page until explicitly removed.
 *
 * Content scripts can't use ES modules — this uses an IIFE + message passing.
 */

// Make this file a module so declare global works
export {};

declare global {
  interface Window {
    __steptRedaction?: {
      applyCategory: (category: string) => number;
      removeCategory: (category: string) => void;
      applyAllEnabled: () => number;
      removeAll: () => void;
      toggleCategory: (category: string, enabled: boolean) => number;
      loadSettings: () => Promise<RedactionSettings>;
      getSettings: () => RedactionSettings;
    };
  }
}

interface RedactionSettings {
  enabled: boolean;
  emails: boolean;
  names: boolean;
  numbers: boolean;
  formFields: boolean;
  longText: boolean;
  images: boolean;
  [key: string]: boolean;
}

interface OriginalValueRecord {
  filter: string;
  webkitFilter: string;
  value?: string;
}

(function () {
  'use strict';

  const REDACTION_ATTR = 'data-stept-redacted';

  // WeakMap to store original values for restoration
  const originalValues = new WeakMap<HTMLElement, OriginalValueRecord>();

  // Default redaction settings
  let redactionSettings: RedactionSettings = {
    enabled: true,
    emails: true,
    names: true,
    numbers: false,
    formFields: true,
    longText: false,
    images: false,
  };

  // Load settings from storage
  function loadSettings(): Promise<RedactionSettings> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['redactionSettings'], (result: { [key: string]: unknown }) => {
        if (result.redactionSettings) {
          redactionSettings = { ...redactionSettings, ...(result.redactionSettings as Partial<RedactionSettings>) } as RedactionSettings;
        }
        resolve(redactionSettings);
      });
    });
  }

  // Save settings to storage
  function saveSettings(): void {
    chrome.storage.local.set({ redactionSettings });
  }

  // CSS selectors for sensitive form fields
  const SENSITIVE_FIELD_SELECTORS: string[] = [
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

  // Number pattern: sequences of 4+ digits
  const NUMBER_REGEX = /\d{4,}/;

  // ~200 most common US first names (census-based)
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
    'jordan','janice','jean','abigail','alice','dylan','ralph','gabriel',
    'joe','eugene','wayne','ethan','judy','sophia','grace','denise',
    'russell','amber','doris','marilyn','danielle','elijah','alan','philip',
    'roy','vincent','bobby','johnny','beverly','isabella','theresa','diana',
    'logan','noah','liam','mason','natalie','brittany','charlotte','marie',
    'aiden','jackson','lucas','kayla','alexis',
  ]);

  // Helper: blur a DOM element for a given category
  function blurElement(el: HTMLElement, category: string, blurAmount: number): boolean {
    if (el.getAttribute(REDACTION_ATTR)) return false;
    if (!originalValues.has(el)) {
      originalValues.set(el, {
        filter: el.style.filter,
        webkitFilter: el.style.webkitFilter,
        value: (el as HTMLInputElement).value !== undefined ? (el as HTMLInputElement).value : undefined,
      });
    }
    el.style.filter = `blur(${blurAmount}px)`;
    el.style.webkitFilter = `blur(${blurAmount}px)`;
    el.setAttribute(REDACTION_ATTR, category);
    return true;
  }

  // Helper: unblur all elements for a given category
  function unblurCategory(category: string): void {
    document.querySelectorAll(`[${REDACTION_ATTR}="${category}"]`).forEach((node) => {
      const el = node as HTMLElement & HTMLInputElement;
      const original = originalValues.get(el);
      if (original) {
        if (original.value !== undefined && category === 'formFields') {
          el.value = original.value;
        }
        el.style.filter = original.filter || '';
        el.style.webkitFilter = original.webkitFilter || '';
        originalValues.delete(el);
      } else {
        el.style.filter = '';
        el.style.webkitFilter = '';
      }
      el.removeAttribute(REDACTION_ATTR);
    });
  }

  // Collect text nodes that haven't been redacted yet
  function getTextNodes(): Text[] {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node: Node): number => {
          if (!node.textContent || node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;
          if ((node as Text).parentElement?.closest(`[${REDACTION_ATTR}]`)) return NodeFilter.FILTER_REJECT;
          if ((node as Text).parentElement?.closest('[data-stept-exclude]')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    return nodes;
  }

  /**
   * Apply redaction for a single category.
   */
  function applyCategory(category: string): number {
    let count = 0;

    switch (category) {
      case 'formFields': {
        const selector = SENSITIVE_FIELD_SELECTORS.join(', ');
        document.querySelectorAll(selector).forEach((node) => {
          const el = node as HTMLInputElement;
          if (el.getAttribute(REDACTION_ATTR)) return;
          if (el.value && el.value.length > 0) {
            if (!originalValues.has(el)) {
              originalValues.set(el, {
                filter: el.style.filter,
                webkitFilter: el.style.webkitFilter,
                value: el.value,
              });
            }
            el.value = '\u2022'.repeat(Math.min(el.value.length, 20));
            el.setAttribute(REDACTION_ATTR, 'formFields');
            count++;
          }
        });
        break;
      }

      case 'emails': {
        getTextNodes().forEach((textNode) => {
          const parent = textNode.parentElement;
          if (!parent || parent.getAttribute(REDACTION_ATTR)) return;
          if (EMAIL_REGEX.test(textNode.textContent!)) {
            if (blurElement(parent, 'emails', 4)) count++;
          }
        });
        break;
      }

      case 'names': {
        getTextNodes().forEach((textNode) => {
          const parent = textNode.parentElement;
          if (!parent || parent.getAttribute(REDACTION_ATTR)) return;
          const words = textNode.textContent!.split(/\s+/);
          for (const word of words) {
            const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
            if (clean.length >= 2 && COMMON_NAMES.has(clean)) {
              if (blurElement(parent, 'names', 4)) count++;
              break;
            }
          }
        });
        break;
      }

      case 'numbers': {
        getTextNodes().forEach((textNode) => {
          const parent = textNode.parentElement;
          if (!parent || parent.getAttribute(REDACTION_ATTR)) return;
          if (NUMBER_REGEX.test(textNode.textContent!)) {
            if (blurElement(parent, 'numbers', 4)) count++;
          }
        });
        break;
      }

      case 'longText': {
        getTextNodes().forEach((textNode) => {
          const parent = textNode.parentElement;
          if (!parent || parent.getAttribute(REDACTION_ATTR)) return;
          if (textNode.textContent!.trim().length > 100) {
            if (blurElement(parent, 'longText', 4)) count++;
          }
        });
        break;
      }

      case 'images': {
        document.querySelectorAll('img').forEach((img) => {
          if (img.getAttribute(REDACTION_ATTR)) return;
          if (img.closest('[data-stept-exclude]')) return;
          if (blurElement(img, 'images', 8)) count++;
        });
        break;
      }
    }

    return count;
  }

  /**
   * Remove redaction for a single category.
   */
  function removeCategory(category: string): void {
    unblurCategory(category);
  }

  /**
   * Apply all enabled categories (used for initial bulk apply).
   */
  function applyAllEnabled(): number {
    if (!redactionSettings.enabled) return 0;
    let total = 0;
    const cats: string[] = ['emails', 'names', 'numbers', 'formFields', 'longText', 'images'];
    for (const cat of cats) {
      if (redactionSettings[cat]) {
        total += applyCategory(cat);
      }
    }
    return total;
  }

  /**
   * Remove ALL redaction from every category.
   */
  function removeAll(): void {
    document.querySelectorAll(`[${REDACTION_ATTR}]`).forEach((node) => {
      const el = node as HTMLElement & HTMLInputElement;
      const original = originalValues.get(el);
      const redactType = el.getAttribute(REDACTION_ATTR);

      if (redactType === 'formFields' && original && original.value !== undefined) {
        el.value = original.value;
      }
      if (original) {
        el.style.filter = original.filter || '';
        el.style.webkitFilter = original.webkitFilter || '';
        originalValues.delete(el);
      } else {
        el.style.filter = '';
        el.style.webkitFilter = '';
      }

      el.removeAttribute(REDACTION_ATTR);
    });
  }

  /**
   * Toggle a single category on/off. Updates settings and persists.
   */
  function toggleCategory(category: string, enabled: boolean): number {
    redactionSettings[category] = enabled;
    saveSettings();

    if (enabled) {
      return applyCategory(category);
    } else {
      removeCategory(category);
      return 0;
    }
  }

  /**
   * Get current settings.
   */
  function getSettings(): RedactionSettings {
    return { ...redactionSettings };
  }

  // Listen for redaction messages
  chrome.runtime.onMessage.addListener((message: { type: string; category?: string; enabled?: boolean; settings?: Partial<RedactionSettings> }, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
    switch (message.type) {
      case 'APPLY_REDACTION':
        loadSettings().then(() => {
          const count = applyAllEnabled();
          sendResponse({ success: true, redactedCount: count });
        });
        return true;

      case 'REMOVE_REDACTION':
        removeAll();
        sendResponse({ success: true });
        break;

      case 'TOGGLE_REDACTION_CATEGORY':
        toggleCategory(message.category!, message.enabled!);
        sendResponse({ success: true });
        break;

      case 'GET_REDACTION_SETTINGS':
        loadSettings().then((settings) => {
          sendResponse(settings);
        });
        return true;

      case 'SET_REDACTION_SETTINGS':
        redactionSettings = { ...redactionSettings, ...message.settings } as RedactionSettings;
        saveSettings();
        sendResponse({ success: true });
        break;
    }
  });

  // Expose for inline use by content.js
  window.__steptRedaction = {
    applyCategory,
    removeCategory,
    applyAllEnabled,
    removeAll,
    toggleCategory,
    loadSettings,
    getSettings,
  };
})();
