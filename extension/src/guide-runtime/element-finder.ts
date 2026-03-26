// Element finding logic — Tango's full scoring system
// Ported from Tango's replay element-finding (commit 52b13d7)

import type { GuideStep, FindResult, AdjustedRect, SearchRoot, IframeOffset } from './types';

// ── Utilities ────────────────────────────────────────────────────────

export const normalizeText = (value: string | null | undefined): string =>
  String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

const unique = <T>(values: (T | null | undefined)[]): T[] => {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (value == null || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

export function isProbablyVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(element as Element);
  if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') return false;
  if (parseFloat(style.opacity || '1') === 0) return false;
  const cx = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
  const cy = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
  const top = element.ownerDocument.elementFromPoint(cx, cy);
  if (!top) return true;
  return top === element || element.contains(top) || top.contains(element);
}

export function collectSearchRoots(root: Document | ShadowRoot = document, offset: IframeOffset = { x: 0, y: 0 }): SearchRoot[] {
  const roots: SearchRoot[] = [{ root, iframeOffset: offset }];
  const visit = (nodeRoot: Document | ShadowRoot, nodeOffset: IframeOffset, depth: number): void => {
    if (depth > 4) return;
    nodeRoot.querySelectorAll('*').forEach((el) => {
      if ((el as HTMLElement).id === 'stept-guide-overlay-host') return;
      const shadow = (el as HTMLElement).shadowRoot;
      if (shadow) roots.push({ root: shadow, iframeOffset: nodeOffset });
    });
    nodeRoot.querySelectorAll('iframe').forEach((frame) => {
      try {
        const doc = (frame as HTMLIFrameElement).contentDocument;
        if (!doc) return;
        const rect = frame.getBoundingClientRect();
        const nextOffset = { x: nodeOffset.x + rect.left, y: nodeOffset.y + rect.top };
        roots.push({ root: doc, iframeOffset: nextOffset });
        visit(doc, nextOffset, depth + 1);
      } catch {}
    });
    nodeRoot.querySelectorAll('*').forEach((el) => {
      const shadow = (el as HTMLElement).shadowRoot;
      if (shadow) visit(shadow, nodeOffset, depth + 1);
    });
  };
  visit(root, offset, 0);
  return roots;
}

// ── Tango's Point System ─────────────────────────────────────────────

const POINT_MAP: Record<string, number> = {
  attributesClassExact: 2,
  attributesClassPartial: 1,
  attributesCols: 1,
  attributesDataset: 2,
  attributesDatasetExact: 2,
  automationIdExact: 10,
  attributesDatasetPartial: 1,
  attributesEmpty: 1,
  attributesId: 4,
  attributesHref: 3,
  attributesHrefPartial: 2,
  attributesMinLength: 1,
  attributesMaxLength: 1,
  attributesName: 4,
  attributesPlaceholder: 2,
  attributesRole: 2,
  attributesRows: 1,
  attributesTagName: 1,
  attributesType: 1,
  attributesValue: 2,
  boundsSizeExact: 2,
  boundsSizeLoose: 1,
  childExactMatch: 2,
  childPartialMatch: 1,
  contenteditable: 5,
  cssSelector: 2,
  iconMatch: 1,
  labelExact: 9,
  labelLoose: 5,
  labelledByMatch: 6,
  parentMatch: 3,
  parentTextExact: 2,
  parentTextPartial: 1,
};

// ── Scorecard System ─────────────────────────────────────────────────

interface Scorecard {
  element: Element;
  score: number;
  wins: string[];
}

const createScorecard = (element: Element): Scorecard => ({
  element,
  score: 0,
  wins: [],
});

const addScore = (scorecard: Scorecard, key: string): void => {
  scorecard.score += POINT_MAP[key] || 0;
  scorecard.wins.push(key);
};

const sortScorecards = (scorecards: Scorecard[]): void => {
  scorecards.sort((a, b) => b.score - a.score);
};

// ── Tango's Semantic Element Type System ─────────────────────────────

interface ElementTypeDefinition {
  tags?: string[];
  ariaRoles?: string[];
  inputTypes?: string[];
  contentEditable?: boolean;
}

const ELEMENT_TYPES: Record<string, ElementTypeDefinition> = {
  button: { tags: ['button', 'summary'], ariaRoles: ['button', 'tab'], inputTypes: ['button', 'submit'] },
  link: { tags: ['a'], ariaRoles: ['link'] },
  option: { tags: ['option'], ariaRoles: ['option', 'treeitem'] },
  menuitem: { ariaRoles: ['menuitem'] },
  comboboxSearch: { ariaRoles: ['combobox'] },
  select: { tags: ['select'] },
  radio: { inputTypes: ['radio'], ariaRoles: ['radio', 'menuitemradio'] },
  checkbox: { inputTypes: ['checkbox'], ariaRoles: ['checkbox', 'switch', 'menuitemcheckbox'] },
  textbox: { tags: ['textarea', 'input'], ariaRoles: ['textbox'], contentEditable: true },
  searchbox: { inputTypes: ['search'], ariaRoles: ['searchbox'] },
  listitem: { tags: ['li'], ariaRoles: ['listitem'] },
  gridcell: { tags: ['td', 'th'], ariaRoles: ['gridcell'] },
};

const INTERACTIVE_FALLBACK_SELECTOR = 'a, button, input, select, textarea, [role="link"], [role="button"], [role="menuitem"], [role="tab"], [role="option"], [tabindex], [onclick]';

/** Classify a recorded element into a semantic type */
function classifyElementType(step: GuideStep): string | null {
  const tag = step.element_info?.tagName?.toLowerCase();
  const role = step.element_info?.role || step.element_role;
  const inputType = step.element_info?.type;

  for (const [typeName, def] of Object.entries(ELEMENT_TYPES)) {
    // Match by inputType (most specific for inputs)
    if (inputType && def.inputTypes?.includes(inputType)) return typeName;
    // Match by aria role
    if (role && def.ariaRoles?.includes(role)) return typeName;
    // Match by tag
    if (tag && def.tags?.includes(tag)) return typeName;
    // Match contentEditable
    if (def.contentEditable && step.element_info?.contenteditable === 'true') return typeName;
  }

  return null;
}

/** Build a CSS selector to query candidates for a given element type */
function buildCandidateSelector(elementType: string | null): string {
  if (!elementType) return INTERACTIVE_FALLBACK_SELECTOR;

  const def = ELEMENT_TYPES[elementType];
  if (!def) return INTERACTIVE_FALLBACK_SELECTOR;

  const parts: string[] = [];
  if (def.tags) parts.push(...def.tags);
  if (def.ariaRoles) parts.push(...def.ariaRoles.map(r => `[role="${r}"]`));
  if (def.inputTypes) parts.push(...def.inputTypes.map(t => `input[type="${t}"]`));
  if (def.contentEditable) parts.push('[contenteditable="true"]', '[contenteditable="plaintext-only"]');

  return parts.length > 0 ? parts.join(', ') : INTERACTIVE_FALLBACK_SELECTOR;
}

// ── Scoring Functions (Tango's "games") ──────────────────────────────

/** Dynamic ID check (Qt function) */
const isDynamicId = (id: string | null | undefined): boolean => {
  return typeof id === 'string' ? /-\d+$/.test(id) : false;
};

/** Check if element needs only label match (Bt function) */
const isLabelOnlyMatch = (step: GuideStep, attributes: Record<string, any>): boolean => {
  const ariaLabel = attributes['aria-label'] || attributes.ariaLabel;
  if (typeof ariaLabel === 'string' && ariaLabel.length > 2) return true;

  const text = step.element_info?.content || step.element_info?.text;
  const isContentEditable = attributes.contenteditable === 'true' ||
    attributes.contenteditable === '' ||
    attributes.contenteditable === 'plaintext-only' ||
    attributes.role === 'textbox';
  const isCombobox = attributes.role === 'combobox';

  if (typeof text === 'string' && text.length > 2 && !isContentEditable && !isCombobox) return true;

  const alt = attributes.alt;
  if (typeof alt === 'string' && alt.length > 2) return true;

  const title = attributes.title;
  if (typeof title === 'string' && title.length > 2) return true;

  const value = attributes.value;
  return typeof value === 'string' && value.length > 2 &&
    (attributes.type === 'button' || attributes.type === 'submit');
};

/** LABEL scoring (zt function) — 9 pts exact, 5 pts loose */
const scoreLabelMatch = (scorecard: Scorecard, step: GuideStep, attributes: Record<string, any>): void => {
  const element = scorecard.element;

  // Check aria-label first
  const ariaLabel = attributes['aria-label'] || attributes.ariaLabel;
  if (typeof ariaLabel === 'string' && ariaLabel.length > 2) {
    const actualAriaLabel = element.getAttribute('aria-label');
    const labelAttr = element.getAttribute('label');

    if (actualAriaLabel === ariaLabel || labelAttr === ariaLabel) {
      addScore(scorecard, 'labelExact');
      return;
    }

    if (actualAriaLabel?.includes(ariaLabel) || labelAttr?.includes(ariaLabel)) {
      addScore(scorecard, 'labelLoose');
      return;
    }
  }

  // Check text content
  const recordedText = step.element_info?.content || step.element_info?.text;
  if (recordedText) {
    const elementText = element.textContent?.trim() || '';
    if (elementText === recordedText.trim()) {
      addScore(scorecard, 'labelExact');
      return;
    }
    if (elementText.includes(recordedText.trim()) || recordedText.includes(elementText)) {
      addScore(scorecard, 'labelLoose');
    }
  }
};

/** ATTRIBUTES scoring (Yt function) */
const scoreAttributesMatch = (scorecard: Scorecard, step: GuideStep, attributes: Record<string, any>): void => {
  const element = scorecard.element;
  const tagName = step.element_info?.tagName;

  // Tag name match
  if (tagName && element.tagName.toLowerCase() === tagName.toLowerCase()) {
    addScore(scorecard, 'attributesTagName');
  }

  // Simple attribute matches
  const simpleAttrs: Record<string, string> = {
    attributesType: 'type',
    attributesRole: 'role',
    attributesCols: 'cols',
    attributesRows: 'rows',
    attributesMinLength: 'minlength',
    attributesMaxLength: 'maxlength',
    attributesPlaceholder: 'placeholder',
    attributesName: 'name',
  };

  for (const [scoreKey, attrName] of Object.entries(simpleAttrs)) {
    if (attributes[attrName] && element.getAttribute(attrName) === attributes[attrName]) {
      addScore(scorecard, scoreKey);
    }
  }

  // ID (skip dynamic IDs)
  if (attributes.id && !isDynamicId(attributes.id) && element.getAttribute('id') === attributes.id) {
    addScore(scorecard, 'attributesId');
  }

  // Href handling
  const href = element.getAttribute('href');
  if (typeof attributes.href === 'string' && attributes.href.length > 2 && href) {
    if (href === attributes.href) {
      addScore(scorecard, 'attributesHref');
    } else if (href.includes(attributes.href) || attributes.href.includes(href)) {
      addScore(scorecard, 'attributesHrefPartial');
    }
  }

  // Value for checkboxes/radios
  if (tagName === 'input' && (attributes.type === 'checkbox' || attributes.type === 'radio')) {
    if (attributes.value && element.getAttribute('value') === attributes.value) {
      addScore(scorecard, 'attributesValue');
    }
  }

  // Empty attributes (no extra attributes)
  const recordedAttrs = Object.keys(attributes).filter(key => key !== 'style' && key !== 'class');
  const elementAttrs = element.getAttributeNames().filter(name => name !== 'style' && name !== 'class');
  if (recordedAttrs.length === 0 && elementAttrs.length === 0) {
    addScore(scorecard, 'attributesEmpty');
  }

  // Contenteditable
  if (element.getAttribute('contenteditable') === 'true') {
    addScore(scorecard, 'contenteditable');
  }

  // Class matching
  if (typeof attributes.class === 'string' && typeof (element as HTMLElement).className === 'string') {
    if (attributes.class === (element as HTMLElement).className) {
      addScore(scorecard, 'attributesClassExact');
    } else {
      const recordedClasses = attributes.class.split(' ');
      const elementClasses = (element as HTMLElement).className.split(' ');
      if (recordedClasses.some((cls: string) => elementClasses.includes(cls))) {
        addScore(scorecard, 'attributesClassPartial');
      }
    }
  }

  // Dataset attributes
  const dataAttrs = Object.keys(attributes).filter(key => key.startsWith('data-') && !key.startsWith('data-tango'));
  if (dataAttrs.length > 0) {
    const matchingDataAttrs = dataAttrs.filter(attr => attributes[attr] === element.getAttribute(attr));
    if (matchingDataAttrs.length === dataAttrs.length) {
      addScore(scorecard, 'attributesDatasetExact');
    } else if (matchingDataAttrs.length > 0) {
      addScore(scorecard, 'attributesDatasetPartial');
    }
  }

  // Automation ID
  const automationIdAttrs = ['data-automation-id', 'data-automationid', 'data-testid', 'data-test-id'];
  const hasAutomationId = automationIdAttrs.some(attr => typeof attributes[attr] === 'string');
  if (hasAutomationId && automationIdAttrs.every(attr => {
    const value = attributes[attr];
    return typeof value === 'string' ? value === element.getAttribute(attr) : true;
  })) {
    addScore(scorecard, 'automationIdExact');
  }
};

/** CSS_SELECTOR scoring (Cn function) — 2 pts */
const scoreCSSSelector = (scorecard: Scorecard, selectors: string[], searchRoot: Document | ShadowRoot): void => {
  for (const selector of selectors) {
    try {
      if (searchRoot.querySelector(selector) === scorecard.element) {
        addScore(scorecard, 'cssSelector');
        return;
      }
    } catch {
      // Invalid selector, skip
    }
  }
};

/** BOUNDS scoring (Pn function) — 2 pts exact, 1 pt loose */
const scoreBounds = (scorecard: Scorecard, step: GuideStep): void => {
  const elementRect = step.element_info?.elementRect;
  if (!elementRect) return;

  const rect = scorecard.element.getBoundingClientRect();
  const recordedWidth = elementRect.width;
  const recordedHeight = elementRect.height;

  if (Math.round(rect.width) === recordedWidth && Math.round(rect.height) === recordedHeight) {
    addScore(scorecard, 'boundsSizeExact');
  } else if (recordedWidth > 0 && recordedHeight > 0) {
    const widthDiff = Math.abs(rect.width - recordedWidth) / recordedWidth;
    const heightDiff = Math.abs(rect.height - recordedHeight) / recordedHeight;
    if (widthDiff < 0.1 && heightDiff < 0.1) {
      addScore(scorecard, 'boundsSizeLoose');
    }
  }
};

/** PARENT scoring (Tn function) */
const scoreParentMatch = (scorecard: Scorecard, step: GuideStep): void => {
  const parentText = step.element_info?.parentText;
  if (!parentText || !scorecard.element.parentElement) return;

  const actualParentText = scorecard.element.parentElement.textContent?.trim() || '';
  if (actualParentText === parentText) {
    addScore(scorecard, 'parentTextExact');
  } else if (actualParentText.includes(parentText.slice(0, 30))) {
    addScore(scorecard, 'parentTextPartial');
  }
};

// ── Build attributes object from step ────────────────────────────────

function buildAttributes(step: GuideStep): Record<string, any> {
  const info = step.element_info;
  if (!info) return {};

  const attrs: Record<string, any> = {};
  if (info.id) attrs.id = info.id;
  if (info.className) attrs.class = info.className;
  if (info.placeholder) attrs.placeholder = info.placeholder;
  if (info.ariaLabel) attrs['aria-label'] = info.ariaLabel;
  if (info.role) attrs.role = info.role;
  if (info.type) attrs.type = info.type;
  if (info.name) attrs.name = info.name;
  if (info.href) attrs.href = info.href;
  if (info.value) attrs.value = info.value;
  if (info.alt) attrs.alt = info.alt;
  if (info.cols) attrs.cols = info.cols;
  if (info.rows) attrs.rows = info.rows;
  if (info.minlength) attrs.minlength = info.minlength;
  if (info.maxlength) attrs.maxlength = info.maxlength;
  if (info.contenteditable) attrs.contenteditable = info.contenteditable;
  if (info.tagName) attrs.tagName = info.tagName;

  // Map testId to data-testid for automation ID scoring
  if (info.testId) attrs['data-testid'] = info.testId;

  // Include stableClassName as class fallback
  if (!attrs.class && info.stableClassName) attrs.class = info.stableClassName;

  return attrs;
}

// ── Collect CSS selectors from step ──────────────────────────────────

function collectSelectors(step: GuideStep): string[] {
  return unique<string>([
    ...(step.selector ? [step.selector] : []),
    ...(step.element_info?.selector ? [step.element_info.selector] : []),
    ...((step.element_info?.selectorSet || []) as string[]),
    ...((step.element_info?.selectorTree?.selectors || []) as string[]),
  ]);
}

// ── Tango Scoring Pipeline ───────────────────────────────────────────

function runTangoScoring(
  candidates: Element[],
  step: GuideStep,
  selectors: string[],
  attributes: Record<string, any>,
  searchRoot: Document | ShadowRoot,
): Scorecard | null {
  if (candidates.length === 0) return null;

  const scorecards = candidates.map(createScorecard);

  for (const sc of scorecards) {
    if (selectors.length > 0) scoreCSSSelector(sc, selectors, searchRoot);
    scoreAttributesMatch(sc, step, attributes);
    scoreLabelMatch(sc, step, attributes);
    scoreBounds(sc, step);
    scoreParentMatch(sc, step);
  }

  sortScorecards(scorecards);

  const best = scorecards[0];
  if (!best || best.score === 0) return null;

  // Apply Tango's threshold logic
  if (isLabelOnlyMatch(step, attributes)) {
    return best.wins.includes('labelExact') ? best : null;
  } else {
    return best.score > 4 ? best : null;
  }
}

// ── Main ElementFinder Class ─────────────────────────────────────────

export class ElementFinder {
  static find(step: GuideStep): FindResult | null {
    const roots = collectSearchRoots();
    const selectors = collectSelectors(step);
    const attributes = buildAttributes(step);

    // 1. Try CSS selectors first (fast, high confidence)
    for (const selector of selectors) {
      const direct = this.findBySelector(selector, roots, 'selector');
      if (direct) return direct;
    }

    // 2. Try testId attributes (high confidence)
    const testId = step.element_info?.testId;
    if (testId) {
      for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-hook', 'data-e2e', 'data-automation-id']) {
        const found = this.findBySelector(`[${attr}="${CSS.escape(testId)}"]`, roots, 'test-id');
        if (found) return found;
      }
    }

    // 3. Run Tango's full scoring system against semantically-typed candidates
    const elementType = classifyElementType(step);
    const candidateSelector = buildCandidateSelector(elementType);

    for (const { root, iframeOffset } of roots) {
      const candidates = Array.from(root.querySelectorAll(candidateSelector)).filter(isProbablyVisible);
      const winner = runTangoScoring(candidates, step, selectors, attributes, root);
      if (winner) {
        return {
          element: winner.element,
          confidence: Math.min(0.95, 0.5 + winner.score * 0.03),
          method: `tango-scoring:${elementType || 'fallback'}`,
          iframeOffset,
        };
      }
    }

    // 4. If typed query found nothing, try the interactive fallback selector
    if (elementType) {
      for (const { root, iframeOffset } of roots) {
        const candidates = Array.from(root.querySelectorAll(INTERACTIVE_FALLBACK_SELECTOR)).filter(isProbablyVisible);
        const winner = runTangoScoring(candidates, step, selectors, attributes, root);
        if (winner) {
          return {
            element: winner.element,
            confidence: Math.min(0.90, 0.45 + winner.score * 0.03),
            method: 'tango-scoring:broad-fallback',
            iframeOffset,
          };
        }
      }
    }

    return null;
  }

  private static findBySelector(selector: string, roots: SearchRoot[], method: string): FindResult | null {
    for (const { root, iframeOffset } of roots) {
      try {
        const elements = Array.from(root.querySelectorAll(selector)).filter(isProbablyVisible);
        if (elements.length === 1) {
          return { element: elements[0], confidence: 1, method, iframeOffset };
        }
      } catch {}
    }
    return null;
  }
}

// ── Rect helper ──────────────────────────────────────────────────────

export function getAdjustedRect(result: FindResult): AdjustedRect {
  if (result.rect) return result.rect;
  const rect = result.element!.getBoundingClientRect();
  const offset = result.iframeOffset || { x: 0, y: 0 };
  return {
    left: rect.left + offset.x,
    top: rect.top + offset.y,
    width: rect.width,
    height: rect.height,
    right: rect.right + offset.x,
    bottom: rect.bottom + offset.y,
  };
}
