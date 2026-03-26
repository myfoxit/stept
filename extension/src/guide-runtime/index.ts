// Guide Runtime — injected on demand into pages.
// MUST remain a single self-contained IIFE.
// NO imports, NO React, NO module splitting.
// Faithfully ported from Tango's replay system.

(function () {
  'use strict';

  // ── Debug Logger — writes to chrome.storage.local for inspection ──
  const _logs: string[] = [];
  function log(...args: any[]): void {
    const ts = new Date().toISOString().slice(11, 23);
    const msg = `[${ts}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`;
    _logs.push(msg);
    console.log('[stept-guide]', ...args);
    // Persist to storage (last 200 entries)
    try {
      const keep = _logs.slice(-200);
      chrome.storage.local.set({ stept_guide_logs: keep });
    } catch {}
  }

  // ── Type Declarations ──────────────────────────────────────────────

  interface IframeOffset {
    x: number;
    y: number;
  }

  interface SearchRoot {
    root: Document | ShadowRoot;
    iframeOffset: IframeOffset;
    depth: number;
  }

  interface GuideStep {
    title?: string;
    description?: string;
    action_type?: string;
    expected_url?: string;
    step_number?: number;
    screenshot_url?: string;
    element_info?: {
      tagName?: string;
      text?: string;
      content?: string;
      id?: string;
      className?: string;
      placeholder?: string;
      ariaLabel?: string;
      role?: string;
      type?: string;
      name?: string;
      href?: string;
      testId?: string;
      elementRect?: { x: number; y: number; width: number; height: number };
      parentText?: string;
      selector?: string;
      selectorSet?: string[];
      selectorTree?: any;
      xpath?: string;
      computedName?: string;
      computedRole?: string;
      fingerprint?: string;
      stableClassName?: string;
    };
  }

  interface Guide {
    id?: string;
    title?: string;
    steps?: GuideStep[];
  }

  interface FindResult {
    element?: Element;
    confidence: number;
    method: string;
    iframeOffset?: IframeOffset;
    rect?: AdjustedRect;
    requiresManualInteraction?: boolean;
  }

  interface AdjustedRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  }

  // Extend Window to carry our globals
  interface SteptWindow extends Window {
    __steptGuideLoaded?: boolean;
    __steptGuideRunner?: GuideRunner | null;
    __steptGuideRuntime?: typeof GuideRunner;
  }

  const _window = window as unknown as SteptWindow;

  // ── Deduplication ─────────────────────────────────────────────────

  const DEDUP_EVENT = "stept_guide_remove_" + chrome.runtime.id;
  const cleanup = (): void => {
    document.removeEventListener(DEDUP_EVENT, cleanup);
    if (_window.__steptGuideRunner) {
      try {
        _window.__steptGuideRunner._replacing = true;
        _window.__steptGuideRunner.stop();
      } catch {}
    }
  };
  document.dispatchEvent(new CustomEvent(DEDUP_EVENT));
  document.addEventListener(DEDUP_EVENT, cleanup);
  _window.__steptGuideLoaded = true;

  // ── Tango's Point System (faithfully ported) ──────────────────────

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

  // ── Tango's Scorecard System ──────────────────────────────────────

  interface Scorecard {
    element: Element;
    score: number;
    wins: string[];
    isWinner: boolean;
  }

  // Create scorecard (xn function)
  const createScorecard = (element: Element): Scorecard => ({
    element,
    score: 0,
    wins: [],
    isWinner: false,
  });

  // Score adder (K function)
  const addScore = (scorecard: Scorecard, key: string): void => {
    scorecard.score += POINT_MAP[key] || 0;
    scorecard.wins.push(key);
  };

  // Sort scorecards by score descending (Sn function)
  const sortScorecards = (scorecards: Scorecard[]): void => {
    scorecards.sort((a, b) => b.score - a.score);
  };

  // ── CSS Zoom Compensation ─────────────────────────────────────────

  function getPageZoom(): number {
    let zoom = 1;
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      const z = (getComputedStyle(el) as CSSStyleDeclaration & { zoom?: string }).zoom;
      if (z && z !== "normal") {
        const n = parseFloat(z);
        if (!isNaN(n) && n > 0) zoom *= n;
      }
    }
    return zoom;
  }

  // ── Searchable Roots (document + shadow roots + same-origin iframes) ──

  function collectSearchRoots(root: Document | ShadowRoot = document, depth: number = 0): SearchRoot[] {
    const results: SearchRoot[] = [{ root, iframeOffset: { x: 0, y: 0 }, depth }];
    if (depth > 5) return results; // prevent infinite recursion

    try {
      // Traverse shadow roots
      root.querySelectorAll("*").forEach((el: Element) => {
        if (el && el.shadowRoot && el.id !== "stept-guide-overlay") {
          results.push(...collectSearchRoots(el.shadowRoot, depth + 1).map((r) => ({
            ...r,
            iframeOffset: results[0]?.iframeOffset || { x: 0, y: 0 }, // same offset as parent
          })));
        }
      });

      // Traverse same-origin iframes
      root.querySelectorAll("iframe").forEach((iframe: HTMLIFrameElement) => {
        try {
          const doc = iframe.contentDocument;
          if (!doc) return; // cross-origin or not loaded
          const iframeRect = iframe.getBoundingClientRect();
          const parentOffset = results[0]?.iframeOffset || { x: 0, y: 0 };
          const offset: IframeOffset = {
            x: parentOffset.x + iframeRect.left,
            y: parentOffset.y + iframeRect.top,
          };
          results.push(
            ...collectSearchRoots(doc, depth + 1).map((r) => ({
              ...r,
              iframeOffset: { x: offset.x + r.iframeOffset.x, y: offset.y + r.iframeOffset.y },
            }))
          );
        } catch {
          // cross-origin iframe — skip
        }
      });
    } catch {}

    return results;
  }

  // ── Tango's Element Finding System (faithfully ported) ────────────

  // Dynamic ID check (Qt function)
  const isDynamicId = (id: string | null | undefined): boolean => {
    return typeof id === 'string' ? /-\d+$/.test(id) : false;
  };

  // Check if element needs only label match (Bt function)
  const isLabelOnlyMatch = (step: GuideStep, attributes: Record<string, any>): boolean => {
    const ariaLabel = attributes['aria-label'];
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

  // Tango's 9-point visibility check (an function)
  const isElementVisible = (element: Element): { status: string; obscuringElements?: Element[]; obscuredRatio?: number } => {
    const doc = element.ownerDocument;
    const win = doc.defaultView || window;
    const rect = element.getBoundingClientRect();

    // Not in viewport
    if (rect.bottom < 0 || rect.top > win.innerHeight || rect.right < 0 || rect.left > win.innerWidth) {
      return { status: 'NotInViewport' };
    }

    const style = win.getComputedStyle(element);
    
    // Handle tiny input elements with labels
    let targetElement = element;
    let targetRect = rect;
    if (element instanceof HTMLInputElement && 
        ((rect.width < 5 && rect.height < 5) || 
         style.clip === 'rect(0px, 0px, 0px, 0px)' || 
         style.opacity === '0')) {
      const label = (element as HTMLInputElement).labels?.[0];
      if (label) {
        targetElement = label;
        targetRect = label.getBoundingClientRect();
      }
    }

    // Handle display:contents elements
    if (style.display === 'contents' && element.firstElementChild) {
      targetElement = element.firstElementChild;
      targetRect = targetElement.getBoundingClientRect();
    }

    if (targetRect.width === 0 || targetRect.height === 0) {
      return { status: 'Hidden' };
    }

    // 9-point grid sampling for occlusion check
    const checkPoints = [];
    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      checkPoints.push({
        x: targetRect.left + (targetRect.width * (col + 0.5)) / 3,
        y: targetRect.top + (targetRect.height * (row + 0.5)) / 3,
      });
    }

    const obscuringElements = checkPoints
      .map(point => doc.elementFromPoint(point.x, point.y))
      .filter((topElement): topElement is Element => {
        if (!topElement || topElement === targetElement) return false;
        
        // Ignore overlay elements
        if (topElement.tagName?.toLowerCase() === 'stept-guide-overlay') return false;
        
        // Element contains the top element (normal case)
        if (targetElement.contains(topElement)) {
          if (targetElement instanceof HTMLLabelElement) return false;
          return isInteractiveElement(topElement);
        }
        
        // Handle label/input relationships
        if (targetElement instanceof HTMLInputElement) {
          const labels = Array.from((targetElement as HTMLInputElement).labels || []);
          if (labels.some(label => label === topElement || label.contains(topElement))) return false;
        }
        
        if (topElement instanceof HTMLInputElement) {
          const topLabels = Array.from((topElement as HTMLInputElement).labels || []);
          return !topLabels.includes(targetElement as any);
        }
        
        return true;
      });

    const obscuredRatio = obscuringElements.length / 9;
    const uniqueObscurers = Array.from(new Set(obscuringElements));
    const isObscured = obscuredRatio >= 0.9;

    // Handle special case for small inputs
    let isSmallInputSpecialCase = false;
    if (isObscured && targetElement instanceof HTMLInputElement && targetRect.width < 20) {
      if (uniqueObscurers.every(el => Math.abs(el.clientHeight - targetElement.clientHeight) < 8)) {
        isSmallInputSpecialCase = true;
      }
    }

    const ignoredTags = ['html', 'head', 'body', 'script', 'style', 'meta', 'title', 'link'];
    const allIgnored = uniqueObscurers.every(el => ignoredTags.includes(el.tagName.toLowerCase()));

    if (isObscured && !isSmallInputSpecialCase && !allIgnored) {
      return { status: 'Obscured', obscuringElements: uniqueObscurers, obscuredRatio };
    }

    return { status: 'Visible', obscuringElements: uniqueObscurers, obscuredRatio };
  };

  // Check if element is interactive
  const isInteractiveElement = (element: Element): boolean => {
    const win = element.ownerDocument.defaultView || window;
    const tabindex = element.getAttribute('tabindex');
    if (tabindex === '-1') return false;
    
    if (element instanceof HTMLElement) {
      // Check for known interactive roles/tags
      const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
      const interactiveRoles = ['button', 'link', 'textbox', 'combobox', 'tab', 'menuitem'];
      
      if (interactiveTags.includes(element.tagName.toLowerCase())) return true;
      if (interactiveRoles.includes(element.getAttribute('role') || '')) return true;
    }
    
    return !!tabindex || element.hasAttribute('contenteditable');
  };

  // LABEL scoring (zt function)
  const scoreLabelMatch = (scorecard: Scorecard, step: GuideStep, attributes: Record<string, any>): void => {
    const element = scorecard.element;
    
    // Check aria-label first
    const ariaLabel = attributes['aria-label'];
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

  // ATTRIBUTES scoring (Yt function)
  const scoreAttributesMatch = (scorecard: Scorecard, step: GuideStep, attributes: Record<string, any>): void => {
    const element = scorecard.element;
    const tagName = step.element_info?.tagName;
    
    // Tag name match
    if (tagName && element.tagName.toLowerCase() === tagName.toLowerCase()) {
      addScore(scorecard, 'attributesTagName');
    }

    // Simple attribute matches
    const simpleAttrs: Record<string, string> = {
      'attributesType': 'type',
      'attributesRole': 'role',
      'attributesCols': 'cols',
      'attributesRows': 'rows',
      'attributesMinLength': 'minlength',
      'attributesMaxLength': 'maxlength',
      'attributesPlaceholder': 'placeholder',
      'attributesName': 'name',
    };

    for (const [scoreKey, attrName] of Object.entries(simpleAttrs)) {
      if (attributes[attrName] && element.getAttribute(attrName) === attributes[attrName]) {
        addScore(scorecard, scoreKey);
      }
    }

    // ID (but skip dynamic IDs)
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
    if (typeof attributes.class === 'string' && typeof element.className === 'string') {
      if (attributes.class === element.className) {
        addScore(scorecard, 'attributesClassExact');
      } else {
        const recordedClasses = attributes.class.split(' ');
        const elementClasses = element.className.split(' ');
        if (recordedClasses.some(cls => elementClasses.includes(cls))) {
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

  // CSS_SELECTOR scoring (Cn function)
  const scoreCSSSelector = (scorecard: Scorecard, selectors: string[]): void => {
    for (const selector of selectors) {
      try {
        if (document.querySelector(selector) === scorecard.element) {
          addScore(scorecard, 'cssSelector');
          return;
        }
      } catch {
        // Invalid selector, skip
      }
    }
  };

  // BOUNDS scoring (Pn function)
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

  // PARENT scoring (Tn function)  
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

  // Check for intermediate action needed (jn function equivalent)
  const needsIntermediateAction = (element: Element): HTMLElement | null => {
    let node: HTMLElement | null = element.parentElement;
    while (node && node !== document.documentElement) {
      if (node.getAttribute('aria-expanded') === 'false') return node;
      if (node.tagName === 'DETAILS' && !node.hasAttribute('open')) return node;
      node = node.parentElement;
    }
    return null;
  };

  // Main element finder (Mn function)
  const findElementByScoring = (step: GuideStep, searchRoot: ParentNode = document): Element | null => {
    const tagName = step.element_info?.tagName;
    if (!tagName) return null;

    // Get all candidates of the same tag inside the current search root
    const candidates = Array.from(searchRoot.querySelectorAll(tagName)).map(createScorecard);
    
    // Build attributes object from step
    const attributes: Record<string, any> = {
      ...step.element_info,
    };

    // Score all candidates
    for (const scorecard of candidates) {
      // CSS Selector scoring
      const selectors: string[] = [];
      if (step.element_info?.selector) selectors.push(step.element_info.selector);
      if (step.element_info?.selectorSet) selectors.push(...step.element_info.selectorSet);
      if (step.element_info?.selectorTree?.selectors) selectors.push(...step.element_info.selectorTree.selectors);
      if (selectors.length > 0) {
        scoreCSSSelector(scorecard, selectors);
      }

      // Attributes scoring
      scoreAttributesMatch(scorecard, step, attributes);

      // Label scoring
      scoreLabelMatch(scorecard, step, attributes);

      // Bounds scoring
      scoreBounds(scorecard, step);

      // Parent scoring
      scoreParentMatch(scorecard, step);
    }

    // Sort by score
    sortScorecards(candidates);

    const best = candidates[0];
    if (!best) return null;

    // Apply Tango's threshold logic
    if (isLabelOnlyMatch(step, attributes)) {
      // For label-only matches, require exact label match
      return best.wins.includes('labelExact') ? best.element : null;
    } else {
      // Normal threshold: score > 4
      return best.score > 4 ? best.element : null;
    }
  };

  // Main finder: searches document + all shadow roots + all same-origin iframes
  async function findGuideElement(step: GuideStep): Promise<FindResult | null> {
    const searchRoots = collectSearchRoots();
    let bestResult: FindResult | null = null;

    for (const { root, iframeOffset } of searchRoots) {
      const result = findElementByScoring(step, root);
      if (result) {
        const visibility = isElementVisible(result);
        if (visibility.status !== 'Visible') continue; // Skip invisible elements

        const findResult: FindResult = {
          element: result,
          confidence: 0.9, // High confidence for Tango's proven scoring
          method: 'tango-scoring',
          iframeOffset: iframeOffset
        };

        // Return immediately on any match (Tango style)
        return findResult;
      }
    }

    // Cross-frame fallback: ask the background script to query other frames.
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GUIDE_FIND_IN_FRAMES', step });
      if (resp && resp.found && resp.rect) {
        return {
          confidence: resp.confidence || 0.7,
          method: resp.method || 'frame-fallback',
          rect: {
            left: (resp.frameRect?.left || 0) + resp.rect.left,
            top: (resp.frameRect?.top || 0) + resp.rect.top,
            width: resp.rect.width,
            height: resp.rect.height,
            right: (resp.frameRect?.left || 0) + resp.rect.left + resp.rect.width,
            bottom: (resp.frameRect?.top || 0) + resp.rect.top + resp.rect.height,
          },
          requiresManualInteraction: true,
        };
      }
    } catch {}

    return bestResult;
  }

  // ── Cross-origin iframe child frame mode ──────────────────────────
  if (window !== window.top) {
    chrome.runtime.onMessage.addListener((message: { type: string; step: GuideStep }, _sender: any, sendResponse: (response?: any) => void) => {
      if (message.type === 'GUIDE_FIND_IN_FRAME') {
        const result = findElementByScoring(message.step, document);
        if (result) {
          const rect = result.getBoundingClientRect();
          let frameRect: DOMRect | null = null;
          try { 
            frameRect = (self as Window & { frameElement: Element | null }).frameElement?.getBoundingClientRect() ?? null; 
          } catch {}
          sendResponse({
            found: true,
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            frameRect: frameRect ? { left: frameRect.left, top: frameRect.top, width: frameRect.width, height: frameRect.height } : null,
            confidence: 0.9,
            method: 'tango-scoring',
          });
        } else {
          sendResponse({ found: false });
        }
      }
      return false;
    });
    return; // Do NOT create overlay or register START_GUIDE in child frames
  }

  // ── Overlay Renderer (Tango-style dark pill) ──────────────────────

  const STYLES = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 14px;
      color: #1A1A1A;
      pointer-events: none;
    }

    .guide-highlight {
      position: fixed;
      z-index: 2147483641;
      border: 2px solid #FF6B52;
      border-radius: 6px;
      box-shadow: 0 0 0 4px rgba(255, 107, 82, 0.15), 0 0 12px rgba(255, 107, 82, 0.3);
      pointer-events: none;
      transition: all 0.2s ease;
    }

    .guide-tooltip {
      position: fixed;
      z-index: 2147483642;
      background: #1A1A2E;
      border-radius: 20px;
      padding: 8px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: 300px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      pointer-events: auto;
      animation: guide-tooltip-in 0.2s ease-out;
    }

    .guide-tooltip-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #FF6B52;
      flex-shrink: 0;
    }

    .guide-tooltip-text {
      font-size: 12px;
      font-weight: 500;
      color: #FFFFFF;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-grow: 1;
    }

    .guide-tooltip-done {
      margin-left: 2px;
      padding: 1px 6px;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 8px;
      color: #FFFFFF;
      font-size: 10px;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    .guide-tooltip-done:hover { 
      background: rgba(255, 255, 255, 0.3); 
    }

    @keyframes guide-tooltip-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  // ── URL Watcher for Multi-Page Handling ─────────────────────────

  class URLWatcher {
    private _interval: ReturnType<typeof setInterval> | null = null;
    private _lastUrl: string;
    private _onUrlChange: (newUrl: string, oldUrl: string) => void;
    private _origPushState: History['pushState'] | null = null;
    private _origReplaceState: History['replaceState'] | null = null;

    constructor(onUrlChange: (newUrl: string, oldUrl: string) => void) {
      this._lastUrl = window.location.href;
      this._onUrlChange = onUrlChange;
    }

    start(): void {
      this.stop();

      window.addEventListener('popstate', this._handleUrlChange);
      window.addEventListener('hashchange', this._handleUrlChange);
      window.addEventListener('pageshow', this._handleUrlChange);
      document.addEventListener('visibilitychange', this._handleUrlChange);

      // Hook SPA navigations that do not emit popstate immediately.
      if (!this._origPushState) {
        this._origPushState = history.pushState.bind(history);
        history.pushState = ((...args: Parameters<History['pushState']>) => {
          const ret = this._origPushState!(...args);
          this._handleUrlChange();
          return ret;
        }) as History['pushState'];
      }
      if (!this._origReplaceState) {
        this._origReplaceState = history.replaceState.bind(history);
        history.replaceState = ((...args: Parameters<History['replaceState']>) => {
          const ret = this._origReplaceState!(...args);
          this._handleUrlChange();
          return ret;
        }) as History['replaceState'];
      }

      // Poll for URL changes (500ms like Tango)
      this._interval = setInterval(() => {
        this._checkUrlChange();
      }, 500);
    }

    stop(): void {
      if (this._interval) {
        clearInterval(this._interval);
        this._interval = null;
      }
      window.removeEventListener('popstate', this._handleUrlChange);
      window.removeEventListener('hashchange', this._handleUrlChange);
    }

    private _handleUrlChange = (): void => {
      setTimeout(() => this._checkUrlChange(), 100);
    };

    private _checkUrlChange(): void {
      const currentUrl = window.location.href;
      if (currentUrl !== this._lastUrl) {
        const oldUrl = this._lastUrl;
        this._lastUrl = currentUrl;
        this._onUrlChange(currentUrl, oldUrl);
      }
    }
  }

  // ── Guide Runner ──────────────────────────────────────────────────

  class GuideRunner {
    guide: Guide;
    steps: GuideStep[];
    currentIndex: number;
    host: HTMLElement | null;
    shadow: ShadowRoot | null;
    currentResult: FindResult | null;
    _stepSeq: number;
    _highlight: HTMLDivElement | null;
    _tooltip: HTMLDivElement | null;
    _replacing: boolean;
    _pollInterval: ReturnType<typeof setInterval> | null;
    _inertObserver: MutationObserver | null;
    _positionFrame: number | null;
    _urlWatcher: URLWatcher | null;
    _clickHandler: ((e: Event) => void) | null;
    _pointerDownHandler: ((e: Event) => void) | null = null;
    _clickElement: Element | null;

    constructor(guide: Guide) {
      this.guide = guide;
      this.steps = guide.steps || [];
      this.currentIndex = 0;
      this.host = null;
      this.shadow = null;
      this.currentResult = null;
      this._stepSeq = 0;
      this._highlight = null;
      this._tooltip = null;
      this._replacing = false;
      this._pollInterval = null;
      this._inertObserver = null;
      this._positionFrame = null;
      this._urlWatcher = null;
      this._clickHandler = null;
      this._clickElement = null;
    }

    async start(startIndex: number = 0): Promise<void> {
      this._createHost();
      
      this._urlWatcher = new URLWatcher((newUrl: string, oldUrl: string) => {
        this._handleUrlChange(newUrl, oldUrl);
      });
      this._urlWatcher.start();
      
      if (this.steps.length === 0) {
        this.stop();
        return;
      }
      await this.showStep(startIndex);
    }

    stop(): void {
      this._stopElementPolling();
      this._clearPositionTracking();
      this._removeClickHandler();
      if (this._inertObserver) {
        this._inertObserver.disconnect();
        this._inertObserver = null;
      }
      if (this._urlWatcher) {
        this._urlWatcher.stop();
        this._urlWatcher = null;
      }
      if (this.host) {
        this.host.remove();
        this.host = null;
        this.shadow = null;
      }
      this._highlight = null;
      this._tooltip = null;
      activeRunner = null;
      if (!this._replacing) {
        chrome.runtime.sendMessage({ type: 'GUIDE_STOPPED' }).catch(() => {});
      }
    }

    _createHost(): void {
      this.host = document.createElement("stept-guide-overlay");
      this.shadow = this.host.attachShadow({ mode: "closed" });

      const style = document.createElement("style");
      style.textContent = STYLES;
      this.shadow.appendChild(style);

      document.documentElement.appendChild(this.host);

      this._inertObserver = new MutationObserver(() => {
        if (this.host && this.host.hasAttribute("inert")) {
          this.host.removeAttribute("inert");
        }
      });
      this._inertObserver.observe(this.host, { attributes: true, attributeFilter: ["inert"] });
    }

    _clearOverlay(): void {
      this._stopElementPolling();
      this._clearPositionTracking();
      this._removeClickHandler();
      if (this._highlight) { this._highlight.remove(); this._highlight = null; }
      if (this._tooltip) { this._tooltip.remove(); this._tooltip = null; }
    }

    _stopElementPolling(): void {
      if (this._pollInterval) {
        clearInterval(this._pollInterval);
        this._pollInterval = null;
      }
    }

    _startElementPolling(step: GuideStep, seq: number, urlMismatch: boolean): void {
      this._stopElementPolling();
      let pollCount = 0;
      
      const poll = async (): Promise<void> => {
        if (this._stepSeq !== seq) { this._stopElementPolling(); return; }
        pollCount++;

        const result = await findGuideElement(step);
        if (this._stepSeq !== seq) return;

        if (result) {
          const tag = result.element?.tagName?.toLowerCase() || 'frame-target';
          const text = (result.element?.textContent || '').trim().slice(0, 30);
          log(`FOUND element for step ${this.currentIndex} after ${pollCount} polls: <${tag}> "${text}" (method=${result.method}, confidence=${result.confidence.toFixed(2)})`);
          this.currentResult = result;
          
          // Check for intermediate action
          if (result.element) {
            const intermediateAncestor = needsIntermediateAction(result.element);
            if (intermediateAncestor) {
              log(`Step ${this.currentIndex}: element needs intermediate action (hidden by ancestor)`);
              return;
            }
          }

          chrome.runtime.sendMessage({
            type: 'GUIDE_STEP_CHANGED',
            currentIndex: this.currentIndex,
            totalSteps: this.steps.length,
            stepStatus: 'active',
          }).catch(() => {});

          await this._scrollToElement(result);
          if (this._stepSeq !== seq) return;
          
          this._renderOverlay(step, result, urlMismatch);
          this._startPositionTracking(step, result);
          if (result.element && !result.requiresManualInteraction) {
            this._setupClickAdvance(result.element, step);
          } else if (result.requiresManualInteraction) {
            log(`Step ${this.currentIndex}: frame fallback active — waiting for manual interaction`);
          }
          this._stopElementPolling();
        } else if (pollCount === 1 || pollCount % 20 === 0) {
          // Log on first poll and every 3 seconds
          log(`Step ${this.currentIndex}: element NOT found (poll #${pollCount}, url=${window.location.href.slice(0,50)})`);
        }
      };

      log(`Starting element polling for step ${this.currentIndex} (urlMismatch=${urlMismatch})`);
      poll();
      this._pollInterval = setInterval(poll, 150);
    }

    _handleUrlChange(newUrl: string, oldUrl: string): void {
      const matchingStepIndex = this._findStepForUrl(newUrl);
      
      if (matchingStepIndex !== -1 && matchingStepIndex !== this.currentIndex) {
        chrome.runtime.sendMessage({
          type: 'GUIDE_URL_CHANGED',
          oldUrl,
          newUrl,
          fromStep: this.currentIndex,
          toStep: matchingStepIndex
        }).catch(() => {});
        
        this.showStep(matchingStepIndex);
      } else if (matchingStepIndex === -1) {
        this._clearOverlay();
        chrome.runtime.sendMessage({
          type: 'GUIDE_STEP_CHANGED',
          currentIndex: this.currentIndex,
          totalSteps: this.steps.length,
          stepStatus: 'url-mismatch',
          actualUrl: newUrl
        }).catch(() => {});
      }
    }

    _findStepForUrl(url: string): number {
      for (let i = this.currentIndex; i < this.steps.length; i++) {
        const step = this.steps[i];
        if (this._urlMatches(url, step.expected_url)) {
          return i;
        }
      }
      for (let i = 0; i < this.currentIndex; i++) {
        const step = this.steps[i];
        if (this._urlMatches(url, step.expected_url)) {
          return i;
        }
      }
      return -1;
    }

    _urlMatches(currentUrl: string, expectedUrl?: string | null): boolean {
      if (!expectedUrl) return true;
      
      try {
        const current = new URL(currentUrl);
        const expected = new URL(expectedUrl);
        return current.protocol === expected.protocol &&
               current.host === expected.host &&
               current.pathname === expected.pathname &&
               current.search === expected.search;
      } catch (e) {
        return currentUrl.includes(expectedUrl);
      }
    }

    async showStep(index: number): Promise<void> {
      log(`showStep(${index}) of ${this.steps.length}, url=${window.location.href.slice(0,60)}`);
      if (index < 0 || index >= this.steps.length) {
        log(`showStep(${index}) — OUT OF BOUNDS, stopping`);
        this.stop();
        return;
      }
      
      const seq = ++this._stepSeq;
      this.currentIndex = index;
      this._clearOverlay();

      const step = this.steps[index];
      const actionType = (step.action_type || '').toLowerCase();
      const ei = (step as any).element_info || {};
      log(`Step ${index}: type="${actionType}", tag=${ei.tagName || 'none'}, text="${(ei.content || ei.text || '').slice(0,40)}", expectedUrl=${(step.expected_url || '').slice(0,50)}`);

      // Navigate steps auto-advance
      if (actionType === 'navigate') {
        log(`Navigate step ${index} — auto-advancing to ${index + 1}`);
        const nextIndex = index + 1;
        chrome.runtime.sendMessage({
          type: 'GUIDE_STEP_CHANGED',
          currentIndex: nextIndex,
          totalSteps: this.steps.length,
          stepStatus: 'active',
        }).catch(() => {});
        
        await new Promise<void>((r) => setTimeout(r, 100));
        if (this._stepSeq !== seq) return;
        
        if (nextIndex >= this.steps.length) {
          this.stop();
          return;
        }
        this.showStep(nextIndex);
        return;
      }

      // Check URL mismatch
      let urlMismatch = false;
      if (step.expected_url) {
        try {
          const expected = new URL(step.expected_url);
          const current = new URL(window.location.href);
          urlMismatch =
            expected.origin !== current.origin ||
            expected.pathname !== current.pathname ||
            expected.search !== current.search;
        } catch {}
      }

      chrome.runtime.sendMessage({
        type: 'GUIDE_STEP_CHANGED',
        currentIndex: index,
        totalSteps: this.steps.length,
        stepStatus: 'active',
      }).catch(() => {});

      this._startElementPolling(step, seq, urlMismatch);
    }

    _scrollToElement(result: FindResult): Promise<void> {
      return new Promise<void>((resolve) => {
        const rect = this._getAdjustedRect(result);
        const targetTop = 100; // Leave room for headers
        const targetBottom = window.innerHeight - 150; // Leave room for tooltip

        if (rect.top >= targetTop && rect.bottom <= targetBottom) {
          resolve();
          return;
        }

        const scrollTarget = window.scrollY + rect.top - targetTop;
        window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });

        setTimeout(() => resolve(), 500);
      });
    }

    _getAdjustedRect(result: FindResult): AdjustedRect {
      const raw = result.element!.getBoundingClientRect();
      const offset = result.iframeOffset || { x: 0, y: 0 };
      const zoom = getPageZoom();
      return {
        left: (raw.left + offset.x) * zoom,
        top: (raw.top + offset.y) * zoom,
        right: (raw.right + offset.x) * zoom,
        bottom: (raw.bottom + offset.y) * zoom,
        width: raw.width * zoom,
        height: raw.height * zoom,
      };
    }

    _renderOverlay(step: GuideStep, result: FindResult, urlMismatch: boolean): void {
      const rect = this._getAdjustedRect(result);
      const pad = 4;

      // Create or update highlight ring
      if (!this._highlight) {
        this._highlight = document.createElement("div");
        this._highlight.className = "guide-highlight";
        this.shadow!.appendChild(this._highlight);
      }
      this._highlight.style.display = "";
      this._highlight.style.left = `${rect.left - pad}px`;
      this._highlight.style.top = `${rect.top - pad}px`;
      this._highlight.style.width = `${rect.width + pad * 2}px`;
      this._highlight.style.height = `${rect.height + pad * 2}px`;

      // Create tooltip
      if (this._tooltip) {
        this._tooltip.remove();
      }
      this._tooltip = this._createTooltip(step);
      this.shadow!.appendChild(this._tooltip);
      this._positionTooltip(this._tooltip, rect);
    }

    _createTooltip(step: GuideStep): HTMLDivElement {
      const tooltip = document.createElement("div");
      tooltip.className = "guide-tooltip";

      const stepText = step.title || step.description || `Step ${this.currentIndex + 1}`;
      tooltip.innerHTML = `
        <span class="guide-tooltip-dot"></span>
        <span class="guide-tooltip-text">${this._esc(stepText)}</span>
        <button class="guide-tooltip-done" type="button">✓</button>
      `;

      for (const evt of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
        tooltip.addEventListener(evt, (e: Event) => e.stopPropagation());
      }

      const doneBtn = tooltip.querySelector('.guide-tooltip-done');
      if (doneBtn) {
        doneBtn.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          const nextIndex = this.currentIndex + 1;
          this._removeClickHandler();
          chrome.runtime.sendMessage({
            type: 'GUIDE_STEP_CHANGED',
            currentIndex: nextIndex,
            totalSteps: this.steps.length,
            stepStatus: 'active',
          }).catch(() => {});
          if (nextIndex >= this.steps.length) {
            this.stop();
          } else {
            setTimeout(() => this.showStep(nextIndex), 100);
          }
        });
      }

      return tooltip;
    }

    _positionTooltip(tooltip: HTMLDivElement, rect: AdjustedRect): void {
      const gap = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      requestAnimationFrame(() => {
        const tr = tooltip.getBoundingClientRect();
        const tw = tr.width || 250;
        const th = tr.height || 40;

        const spaceBelow = vh - rect.bottom;
        const spaceAbove = rect.top;

        let top: number, left: number;

        if (spaceBelow >= th + gap) {
          top = rect.bottom + gap;
          left = Math.max(8, Math.min(rect.left, vw - tw - 8));
        } else if (spaceAbove >= th + gap) {
          top = rect.top - th - gap;
          left = Math.max(8, Math.min(rect.left, vw - tw - 8));
        } else {
          top = Math.min(rect.bottom + gap, vh - th - 8);
          left = Math.max(8, (vw - tw) / 2);
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
      });
    }

    _startPositionTracking(step: GuideStep, result: FindResult): void {
      const update = () => {
        if (!result.element || !result.element.isConnected) {
          this._positionFrame = null;
          return;
        }

        const rect = this._getAdjustedRect(result);
        const pad = 4;

        if (this._highlight) {
          this._highlight.style.left = `${rect.left - pad}px`;
          this._highlight.style.top = `${rect.top - pad}px`;
          this._highlight.style.width = `${rect.width + pad * 2}px`;
          this._highlight.style.height = `${rect.height + pad * 2}px`;
        }
        if (this._tooltip) {
          this._positionTooltip(this._tooltip, rect);
        }
        this._positionFrame = requestAnimationFrame(update);
      };
      this._positionFrame = requestAnimationFrame(update);
    }

    _clearPositionTracking(): void {
      if (this._positionFrame) {
        cancelAnimationFrame(this._positionFrame);
        this._positionFrame = null;
      }
    }

    _setupClickAdvance(element: Element, step: GuideStep): void {
      const isClickStep = step.action_type && step.action_type.toLowerCase().includes("click");
      if (!isClickStep) return;

      const nextIndex = this.currentIndex + 1;
      let advanced = false;
      const advance = (): void => {
        if (advanced) return;
        advanced = true;
        this._removeClickHandler();
        if (nextIndex >= this.steps.length) {
          this.stop();
          return;
        }
        chrome.runtime.sendMessage({
          type: 'GUIDE_STEP_CHANGED',
          currentIndex: nextIndex,
          totalSteps: this.steps.length,
          stepStatus: 'active',
        }).catch(() => {});

        setTimeout(() => this.showStep(nextIndex), 400);
      };

      const isNavigationTrigger =
        element instanceof HTMLAnchorElement ||
        (element instanceof HTMLButtonElement && element.type === 'submit') ||
        (element instanceof HTMLInputElement && element.type === 'submit') ||
        !!element.closest('a[href], button[type="submit"], input[type="submit"], [role="link"]');

      this._clickHandler = (_e: Event): void => advance();
      element.addEventListener("click", this._clickHandler, { capture: true, once: true });

      if (isNavigationTrigger) {
        this._pointerDownHandler = (_e: Event): void => advance();
        element.addEventListener("pointerdown", this._pointerDownHandler, { capture: true, once: true });
      }

      this._clickElement = element;
    }

    _removeClickHandler(): void {
      if (this._clickElement) {
        if (this._clickHandler) {
          this._clickElement.removeEventListener("click", this._clickHandler, { capture: true } as EventListenerOptions);
        }
        if (this._pointerDownHandler) {
          this._clickElement.removeEventListener("pointerdown", this._pointerDownHandler, { capture: true } as EventListenerOptions);
        }
      }
      this._clickHandler = null;
      this._pointerDownHandler = null;
      this._clickElement = null;
    }

    _esc(text: string): string {
      if (!text) return "";
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // ── Active Runner Singleton ───────────────────────────────────────

  let activeRunner: GuideRunner | null = null;
  _window.__steptGuideRunner = null;

  // ── Image Modal ──

  function _showImageModal(dataUrl: string): void {
    const existing = document.getElementById('stept-image-modal');
    if (existing) existing.remove();

    const host = document.createElement('div');
    host.id = 'stept-image-modal';
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .backdrop {
        position: fixed; inset: 0; z-index: 2147483647;
        background: rgba(0,0,0,0.7);
        display: flex; align-items: center; justify-content: center;
        cursor: zoom-out; padding: 24px;
      }
      .backdrop img {
        max-width: 90vw; max-height: 90vh;
        object-fit: contain; border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      }
    `;
    shadow.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    backdrop.addEventListener('click', () => host.remove());

    const img = document.createElement('img');
    img.src = dataUrl;
    backdrop.appendChild(img);
    shadow.appendChild(backdrop);

    document.documentElement.appendChild(host);
  }

  // ── Message Handling ──────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message: { type: string; guide: Guide; startIndex?: number; stepIndex?: number }, _sender: any, sendResponse: (response?: any) => void) => {
    if (message.type === "START_GUIDE") {
      log('>>> START_GUIDE received', { startIndex: message.startIndex, steps: message.guide?.steps?.length, url: window.location.href });
      try {
        if (activeRunner) {
          log('Stopping previous runner');
          activeRunner._replacing = true;
          activeRunner.stop();
        }
        const runner = new GuideRunner(message.guide);
        activeRunner = runner;
        _window.__steptGuideRunner = runner;
        const startAt = (typeof message.startIndex === "number" && message.startIndex > 0) ? message.startIndex : 0;
        log('Starting runner at step', startAt);
        runner.currentIndex = startAt;
        runner.start(startAt);
        sendResponse({ success: true });
      } catch (e: unknown) {
        log('START_GUIDE ERROR:', (e as Error).message);
        sendResponse({ success: false, error: (e as Error).message });
      }
    } else if (message.type === "GUIDE_GOTO") {
      log('>>> GUIDE_GOTO received', { stepIndex: message.stepIndex, hasRunner: !!activeRunner, url: window.location.href });
      if (activeRunner && typeof message.stepIndex === "number") {
        activeRunner.showStep(message.stepIndex);
        sendResponse({ success: true });
      } else {
        log('GUIDE_GOTO FAILED — no runner or invalid index');
        sendResponse({ success: false });
      }
    } else if (message.type === "PING") {
      sendResponse({ pong: true });
    } else if (message.type === "STOP_GUIDE") {
      if (activeRunner) activeRunner.stop();
      sendResponse({ success: true });
    } else if (message.type === "GUIDE_SHOW_IMAGE") {
      _showImageModal((message as any).dataUrl);
      sendResponse({ success: true });
    }
    return false;
  });
})();
