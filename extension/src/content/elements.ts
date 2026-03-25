// ===== ELEMENT IDENTIFICATION =====
// Mechanical port from content.js — element info gathering, selectors, xpath, labels

// No external dependency — we use our own generateSelectorSet for multi-selector capture

export interface SelectorTree {
  selectors: string[];
  prevSiblingSelectors: string[];
  nextSiblingSelectors: string[];
  depth: number;
  parent: SelectorTree | null;
}

export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParentChainEntry {
  tag: string;
  id: string | null;
  role: string | null;
  ariaLabel: string | null;
  testId: string | null;
  className: string | null;
}

export interface ElementInfo {
  tagName: string;
  id: string | null;
  className: string | null;
  text: string;
  href: string | null;
  type: string | null;
  name: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  role: string | null;
  title: string | null;
  alt: string | null;
  associatedLabel: string | null;
  parentText: string | null;
  testId: string | null;
  elementRect: ElementRect;
  selector: string | null;
  selectorSet: string[] | null;  // Multiple selectors for reliability
  selectorTree: SelectorTree | null;  // Tree structure for reliable finding
  content: string;  // element.innerText for verification
  xpath: string | null;
  dataId: string | null;
  dataRole: string | null;
  ariaDescription: string | null;
  ariaLabelledby: string | null;
  parentChain: ParentChainEntry[] | null;
  siblingText: string[] | null;
  isInIframe: boolean;
  iframeSrc: string | null;
  computedRole: string | null;
  computedName: string | null;
  fingerprint: string;
  stableClassName: string | null;
}

export function cleanLabel(text: string): string {
  return text.trim().replace(/\s+/g, ' ').substring(0, 60);
}

function getElementText(element: Element): string {
  const text = (element as HTMLElement).innerText || element.textContent || '';
  return text.trim().substring(0, 100);
}

function getParentText(el: Element): string | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const text = (parent.innerText || parent.textContent || '').trim();
  if (text.length > 0 && text.length <= 100) return text;
  return null;
}

export function getAssociatedLabel(el: Element): string | null {
  // 1. <label for="elementId">
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return cleanLabel(label.textContent!);
  }
  // 2. Parent <label>
  const parentLabel = el.closest('label');
  if (parentLabel) {
    // Get label text excluding the input's own text
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, select, textarea').forEach(c => c.remove());
    const text = clone.textContent!.trim();
    if (text) return cleanLabel(text);
  }
  // 3. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy.split(/\s+/).map(id => {
      const ref = document.getElementById(id);
      return ref ? ref.textContent!.trim() : '';
    }).filter(Boolean);
    if (parts.length) return cleanLabel(parts.join(' '));
  }
  return null;
}

// Get the best label for an element using Scribe's priority chain
export function getBestLabel(info: ElementInfo): string | null {
  return info.ariaLabel
    || info.associatedLabel
    || info.placeholder
    || info.title
    || info.alt
    || info.name
    || info.parentText
    || null;
}

export function generateClickDescription(elementInfo: ElementInfo, x: number, y: number, prefix: string): string {
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

  // Fallback — screenshot shows where the click happened
  return `${prefix} here`;
}

/**
 * Generate MULTIPLE selectors for an element (Usertour/WalkMe pattern).
 * Instead of one brittle selector, we generate 6+ strategies.
 * During replay, we try all of them and pick the one that resolves uniquely.
 * This is the #1 reason DAPs are reliable.
 */
export function generateSelectorSet(el: Element): string[] {
  const selectors: string[] = [];
  const tag = el.tagName.toLowerCase();

  try {
    // Strategy 1: #id — skip unstable/auto-generated IDs
    // React/Radix: :r1ot:, radix-:r1on:, radix-_R_xxxH1_
    // Angular: cdk-xxx, mat-xxx with random suffixes
    // Generic: starts with digit, contains :r, _R_ pattern
    if (el.id && _isStableId(el.id)) {
      const sel = `#${CSS.escape(el.id)}`;
      if (_unique(sel)) selectors.push(sel);
    }

    // Strategy 2: data-testid / data-test / data-cy / data-qa / data-automation-id
    for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-automation-id', 'data-e2e', 'data-hook']) {
      const val = el.getAttribute(attr);
      if (val) {
        const sel = `[${attr}="${CSS.escape(val)}"]`;
        if (_unique(sel)) { selectors.push(sel); break; } // One testid is enough
      }
    }

    // Strategy 3: tag[aria-label="..."]
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      const sel = `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
      if (_unique(sel)) selectors.push(sel);
    }

    // Strategy 4: tag[name="..."] (for form elements)
    const name = el.getAttribute('name');
    if (name) {
      const sel = `${tag}[name="${CSS.escape(name)}"]`;
      if (_unique(sel)) selectors.push(sel);
    }

    // Strategy 5: tag[placeholder="..."]
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) {
      const sel = `${tag}[placeholder="${CSS.escape(placeholder)}"]`;
      if (_unique(sel)) selectors.push(sel);
    }

    // Strategy 6: tag[role="..."][aria-label="..."] compound
    const role = el.getAttribute('role');
    if (role && ariaLabel) {
      const sel = `${tag}[role="${role}"][aria-label="${CSS.escape(ariaLabel)}"]`;
      if (_unique(sel)) selectors.push(sel);
    }

    // Strategy 7: tag[title="..."]
    const title = el.getAttribute('title');
    if (title) {
      const sel = `${tag}[title="${CSS.escape(title)}"]`;
      if (_unique(sel)) selectors.push(sel);
    }

    // Strategy 8: Compound attributes
    const stableAttrs = ['data-testid', 'data-id', 'aria-label', 'name', 'placeholder', 'title', 'role'];
    const attrParts = stableAttrs
      .map(attr => { const v = el.getAttribute(attr); return v ? `[${attr}="${CSS.escape(v)}"]` : null; })
      .filter(Boolean);
    if (attrParts.length >= 2) {
      const sel = tag + attrParts.join('');
      if (_unique(sel)) selectors.push(sel);
    }

    // Strategy 9: nth-of-type path from nearest stable ancestor
    const pathSel = _buildPathSelector(el);
    if (pathSel && _unique(pathSel)) selectors.push(pathSel);

  } catch (_) {}

  return [...new Set(selectors)]; // Deduplicate
}

/**
 * Generate multiple selectors for an element using different strategies.
 * Reuses our existing generateSelectorSet (no external dependencies).
 */
function generateMultiSelectors(el: Element): string[] {
  return generateSelectorSet(el);
}

/**
 * Capture complete SelectorTree structure for an element.
 * Based on Usertour's XNode tree structure for parent chain verification.
 */
export function captureSelectorTree(el: Element, depth = 0, maxDepth = 4): SelectorTree {
  // Generate multiple selectors for this element
  const directSelectors = generateSelectorSet(el);
  const medvSelectors = generateMultiSelectors(el);
  const selectors = [...new Set([...directSelectors, ...medvSelectors])];

  // Capture sibling selectors
  let prevSiblingSelectors: string[] = [];
  let nextSiblingSelectors: string[] = [];
  
  if (el.previousElementSibling) {
    prevSiblingSelectors = generateMultiSelectors(el.previousElementSibling);
  }
  
  if (el.nextElementSibling) {
    nextSiblingSelectors = generateMultiSelectors(el.nextElementSibling);
  }

  // Build tree structure
  const tree: SelectorTree = {
    selectors,
    prevSiblingSelectors,
    nextSiblingSelectors,
    depth,
    parent: null,
  };

  // Recursively capture parent chain up to maxDepth
  if (depth < maxDepth && el.parentElement && 
      el.parentElement !== document.body && 
      el.parentElement !== document.documentElement) {
    tree.parent = captureSelectorTree(el.parentElement, depth + 1, maxDepth);
  }

  return tree;
}

function _unique(sel: string): boolean {
  try { return document.querySelectorAll(sel).length === 1; } catch { return false; }
}

/** Check if an element ID is stable (not auto-generated by React, Radix, Angular, etc.) */
function _isStableId(id: string): boolean {
  if (!id) return false;
  if (/\d/.test(id)) return false;  // ANY digit = skip (Scribe + Tango pattern)
  return true;
}

function _buildPathSelector(el: Element): string | null {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    const ctag = current.tagName.toLowerCase();
    if (current.id && _isStableId(current.id)) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
      const idx = siblings.indexOf(current!) + 1;
      parts.unshift(siblings.length > 1 ? `${ctag}:nth-of-type(${idx})` : ctag);
    } else {
      parts.unshift(ctag);
    }
    current = parent;
  }
  return parts.join(' > ') || null;
}

/** Legacy single-selector function — returns the BEST selector from the set */
export function generateStableSelector(el: Element): string | null {
  const set = generateSelectorSet(el);
  return set.length > 0 ? set[0] : _buildPathSelector(el);
}

export function generateXPath(el: Element): string | null {
  try {
    const parts: string[] = [];
    let current: Node | null = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const tag = (current as Element).tagName.toLowerCase();
      const parent: Node | null = current.parentNode;
      if (parent) {
        const siblings = Array.from((parent as Element).children).filter((c: Element) => c.tagName === (current as Element).tagName);
        const idx = siblings.indexOf(current as Element) + 1;
        parts.unshift(`${tag}[${idx}]`);
      } else {
        parts.unshift(tag);
      }
      current = parent;
    }
    return '/' + parts.join('/');
  } catch (e) {
    return null;
  }
}

export function getParentChain(el: Element, depth: number): ParentChainEntry[] | null {
  try {
    const chain: ParentChainEntry[] = [];
    let current = el.parentElement;
    let level = 0;
    while (current && level < depth && current !== document.documentElement) {
      const info: ParentChainEntry = {
        tag: current.tagName.toLowerCase(),
        id: current.id || null,
        role: current.getAttribute('role') || null,
        ariaLabel: current.getAttribute('aria-label') || null,
        testId: current.getAttribute('data-testid') || current.getAttribute('data-test') || null,
        className: typeof current.className === 'string'
          ? current.className.split(/\s+/).slice(0, 3).join(' ') || null
          : null,
      };
      // Only include ancestors with at least one identifying attribute
      if (info.id || info.role || info.ariaLabel || info.testId) {
        chain.push(info);
      }
      current = current.parentElement;
      level++;
    }
    return chain.length > 0 ? chain : null;
  } catch (e) {
    return null;
  }
}

export function getSiblingText(el: Element): string[] | null {
  try {
    const parent = el.parentElement;
    if (!parent) return null;
    const texts: string[] = [];
    for (const child of Array.from(parent.children)) {
      if (child === el) continue;
      const text = (child.textContent || '').trim();
      if (text.length > 0 && text.length <= 50) {
        texts.push(text.substring(0, 50));
        if (texts.length >= 3) break;
      }
    }
    return texts.length > 0 ? texts : null;
  } catch (e) {
    return null;
  }
}

/** Check if an element is a sensitive input (password, credit card, etc.) */
function isSensitiveInput(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea') return false;
  const input = el as HTMLInputElement;
  if (input.type === 'password') return true;
  const ac = (input.autocomplete || '').toLowerCase();
  return /cc-|credit|cvv|cvc|card-number|exp-|security-code/.test(ac);
}

function computeElementFingerprint(el: Element): string {
  const parts: string[] = [];
  // Parent path (tag names only, no indices)
  let p = el.parentElement;
  const parents: string[] = [];
  while (p && p !== document.body && parents.length < 6) {
    parents.unshift(p.tagName.toLowerCase());
    p = p.parentElement;
  }
  parts.push(parents.join('/'));
  // Stable attributes
  for (const attr of ['role', 'name', 'type', 'placeholder', 'aria-label', 'href', 'data-testid']) {
    const v = el.getAttribute(attr);
    if (v) parts.push(`${attr}=${v}`);
  }
  // Tag
  parts.push(`tag=${el.tagName.toLowerCase()}`);
  // Accessible name
  if ((el as any).computedName) parts.push(`an=${(el as any).computedName}`);
  return parts.join('|');
}

function getOptimizedTarget(el: Element): Element {
  const PRIORITY_ATTRS = ['aria-label', 'data-testid', 'data-cy', 'data-test', 
                          'name', 'role', 'placeholder', 'href', 'alt'];
  const parent = el.parentElement;
  if (!parent) return el;
  // SVG path → use parent
  if (el.tagName.toLowerCase() === 'path' && parent.tagName.toLowerCase() === 'svg') return parent;
  if (el.tagName.toLowerCase() === 'svg' && parent.closest('button,a,[role="button"]')) {
    return parent.closest('button,a,[role="button"]')!;
  }
  // If element has no useful attributes, check parent
  const hasUseful = PRIORITY_ATTRS.some(a => el.getAttribute(a));
  if (!hasUseful && !el.id) {
    const parentHasUseful = PRIORITY_ATTRS.some(a => parent.getAttribute(a)) || 
                            [...parent.attributes].some(a => a.name.startsWith('aria-'));
    if (parentHasUseful) return parent;
  }
  return el;
}

export function gatherElementInfo(target: Element): ElementInfo {
  let optimizedTarget = getOptimizedTarget(target);
  const tag = optimizedTarget.tagName.toLowerCase();
  const el = optimizedTarget as HTMLElement & HTMLInputElement & HTMLAnchorElement;
  return {
    tagName: tag,
    id: optimizedTarget.id || null,
    className: typeof optimizedTarget.className === 'string' ? optimizedTarget.className : null,
    text: getElementText(optimizedTarget),
    href: el.href || null,
    type: el.type || null,
    name: el.name || null,
    placeholder: el.placeholder || null,
    ariaLabel: optimizedTarget.getAttribute('aria-label') || null,
    role: optimizedTarget.getAttribute('role') || null,
    title: optimizedTarget.getAttribute('title') || null,
    alt: optimizedTarget.getAttribute('alt') || null,
    associatedLabel: getAssociatedLabel(optimizedTarget),
    parentText: getParentText(optimizedTarget),
    testId: optimizedTarget.getAttribute('data-testid') || optimizedTarget.getAttribute('data-test') || optimizedTarget.getAttribute('data-cy') || null,
    computedRole: (optimizedTarget as any).computedRole || optimizedTarget.getAttribute('role') || null,
    computedName: (optimizedTarget as any).computedName || null,
    elementRect: {
      x: optimizedTarget.getBoundingClientRect().left,
      y: optimizedTarget.getBoundingClientRect().top,
      width: optimizedTarget.getBoundingClientRect().width,
      height: optimizedTarget.getBoundingClientRect().height,
    },
    // Multi-selector capture (Usertour/WalkMe pattern) — store multiple strategies
    selector: (() => {
      const set = generateSelectorSet(optimizedTarget);
      return set.length > 0 ? set[0] : generateStableSelector(optimizedTarget);
    })(),
    selectorSet: generateSelectorSet(optimizedTarget),
    selectorTree: captureSelectorTree(optimizedTarget),
    content: (optimizedTarget as HTMLElement).innerText || optimizedTarget.textContent || '',
    xpath: generateXPath(optimizedTarget),
    dataId: optimizedTarget.getAttribute('data-id') || null,
    dataRole: optimizedTarget.getAttribute('data-role') || null,
    ariaDescription: optimizedTarget.getAttribute('aria-description') || null,
    ariaLabelledby: optimizedTarget.getAttribute('aria-labelledby') || null,
    parentChain: getParentChain(optimizedTarget, 3),
    siblingText: getSiblingText(optimizedTarget),
    isInIframe: window !== window.top,
    iframeSrc: window !== window.top ? window.location.href : null,
    fingerprint: computeElementFingerprint(optimizedTarget),
    stableClassName: typeof optimizedTarget.className === 'string' 
      ? optimizedTarget.className.replace(/\b(focus|hover|active|selected|loading|animate|transition|visible|hidden|open|closed|collapsed|expanded|pressed|checked|disabled|enabled)\w*\b/gi, '').replace(/\s+/g, ' ').trim() 
      : null,
  };
}
