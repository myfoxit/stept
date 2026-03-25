// Guide Runtime — injected on demand into pages.
// MUST remain a single self-contained IIFE.
// NO imports, NO React, NO module splitting.

(function () {
  'use strict';

  // ── Type Definitions ──────────────────────────────────────────────

  interface IframeOffset {
    x: number;
    y: number;
  }

  interface SearchRoot {
    root: Document | ShadowRoot;
    iframeOffset: IframeOffset;
    depth: number;
  }

  interface ElementInfo {
    testId?: string;
    tagName?: string;
    parentChain?: ParentChainEntry[];
    selectorTree?: any;
    selectorSet?: string[];
  }

  interface ParentChainEntry {
    id?: string;
    testId?: string;
    role?: string;
  }

  interface GuideStep {
    selector?: string;
    element_info?: ElementInfo;
    element_role?: string;
    element_text?: string;
    xpath?: string;
    title?: string;
    description?: string;
    action_type?: string;
    expected_url?: string;
    url?: string;
  }

  interface FindResult {
    element: Element;
    confidence: number;
    method: string;
    iframeOffset?: IframeOffset;
  }

  interface AdjustedRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  }

  interface Guide {
    steps?: GuideStep[];
    workflow_id?: string;
    workflowId?: string;
    id?: string;
  }

  interface FindByTextOpts {
    fuzzy?: boolean;
  }

  interface FrameFindResponse {
    found: boolean;
    rect?: { left: number; top: number; width: number; height: number };
    frameRect?: { left: number; top: number; width: number; height: number } | null;
    confidence?: number;
    method?: string;
  }

  enum GuideState {
    IDLE = 'idle',
    SEARCHING = 'searching',
    ACTIVE = 'active',
    NOT_FOUND = 'notfound',
    RECOVERING = 'recovering',
    ADVANCING = 'advancing',
    COMPLETED = 'completed'
  }

  // Extend Window to carry our globals
  interface SteptWindow extends Window {
    __steptGuideLoaded?: boolean;
    __steptGuideRunner?: GuideRunner | null;
    __steptGuideRuntime?: typeof GuideRunner;
  }

  // Chrome messaging types (minimal — no imports)
  type MessageSender = chrome.runtime.MessageSender;
  type SendResponse = (response?: unknown) => void;

  const _window = window as unknown as SteptWindow;

  // ── Deduplication ─────────────────────────────────────────────────

  // Deduplication: kill any previous instance via custom event (Tango pattern).
  // More reliable than checking window properties since the previous script
  // context may have been garbage collected.
  const DEDUP_EVENT = "stept_guide_remove_" + chrome.runtime.id;
  const cleanup = (): void => {
    document.removeEventListener(DEDUP_EVENT, cleanup);
    if (_window.__steptGuideRunner) {
      try {
        _window.__steptGuideRunner.stop();
      } catch {}
    }
  };
  // Fire event to kill previous instance
  document.dispatchEvent(new CustomEvent(DEDUP_EVENT));
  // Listen for future instances
  document.addEventListener(DEDUP_EVENT, cleanup);
  _window.__steptGuideLoaded = true;

  // ── Utility Functions ─────────────────────────────────────────────

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

  function collectSearchRoots(root: Document | ShadowRoot = document, depth: number = 0): SearchRoot[] {
    // Returns array of { root: Document|ShadowRoot, iframeOffset: {x,y} }
    const results: SearchRoot[] = [{ root, iframeOffset: { x: 0, y: 0 }, depth }];
    if (depth > 5) return results; // prevent infinite recursion

    try {
      // Traverse shadow roots
      root.querySelectorAll("*").forEach((el: Element) => {
        if (el.shadowRoot && el.id !== "stept-guide-overlay") {
          results.push(...collectSearchRoots(el.shadowRoot, depth + 1).map((r) => ({
            ...r,
            iframeOffset: results[0].iframeOffset, // same offset as parent
          })));
        }
      });

      // Traverse same-origin iframes
      root.querySelectorAll("iframe").forEach((iframe: HTMLIFrameElement) => {
        try {
          const doc = iframe.contentDocument;
          if (!doc) return; // cross-origin or not loaded
          const iframeRect = iframe.getBoundingClientRect();
          const parentOffset = results[0].iframeOffset;
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

  function safeQuerySelector(root: Document | ShadowRoot | Element, selector: string): Element | null {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  function isVisible(el: Element | null): boolean {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const win = (el as HTMLElement).ownerDocument?.defaultView || window;
    const style = win.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function normalizeText(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function isObstructed(element: Element): HTMLElement | null {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(cx, cy) as HTMLElement;
    if (!topEl || element === topEl || element.contains(topEl)) return null;
    
    // Fix #8: Check for the custom element tag name
    if (topEl.tagName.toLowerCase() === 'stept-guide-overlay') return null;
    
    // Check if obstructor is a modal/overlay that can be dismissed
    const style = getComputedStyle(topEl);
    if (style.position === "fixed" && parseInt(style.zIndex, 10) > 1000) return topEl;
    return null;
  }

  function needsIntermediateAction(element: Element): HTMLElement | null {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return null;
    
    // Element is not visible; check if it's inside a collapsed ancestor
    let parent = element.parentElement;
    while (parent) {
      const computedStyle = getComputedStyle(parent);
      const parentRect = parent.getBoundingClientRect();
      
      // Check for collapsed elements that might expand on interaction
      if (parentRect.width > 0 && parentRect.height > 0) {
        if (computedStyle.overflow === 'hidden' || 
            parent.hasAttribute('aria-expanded') ||
            parent.classList.contains('collapsed') ||
            parent.classList.contains('closed')) {
          return parent;
        }
      }
      parent = parent.parentElement;
    }
    return null;
  }

  function describeElement(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().substring(0, 30);
    const role = el.getAttribute('role') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    
    if (ariaLabel) return ariaLabel;
    if (text) return `${tag} "${text}"`;
    if (role) return `${tag}[${role}]`;
    return tag;
  }

  // ── Element Finding Functions ─────────────────────────────────────

  function findByText(candidates: Element[], text: string, opts: FindByTextOpts = {}): Element | null {
    if (!text || !candidates.length) return null;
    const target = normalizeText(text);
    let best: Element | null = null;
    let bestScore = Infinity;

    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const elText = normalizeText(el.textContent || "");
      // Also check aria-label and title attributes
      const ariaLabel = normalizeText(el.getAttribute('aria-label') || "");
      const title = normalizeText(el.getAttribute('title') || "");
      const placeholder = normalizeText((el as HTMLInputElement).placeholder || "");

      // Exact match (normalized)
      if (elText === target || ariaLabel === target || title === target) return el;
      
      // Contains match
      if (elText.includes(target) || ariaLabel.includes(target)) {
        const matchText = elText.includes(target) ? elText : ariaLabel;
        const score = Math.abs(matchText.length - target.length);
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      
      // Fuzzy: also check if target contains the element text (reverse contains)
      if (opts.fuzzy && target.includes(elText) && elText.length >= 3) {
        const score = Math.abs(elText.length - target.length) + 10; // +10 penalty for reverse match
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      
      // Fuzzy: check placeholder for input elements
      if (opts.fuzzy && placeholder && (placeholder.includes(target) || target.includes(placeholder))) {
        const score = Math.abs(placeholder.length - target.length) + 5;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
    }
    return best;
  }

  function findElementByTree(tree: any, content?: string): { element: Element | null, confidence: number, method: string } {
    if (!tree || !tree.selectors || tree.selectors.length === 0) {
      return { element: null, confidence: 0, method: 'no-tree' };
    }

    // 1. Try all selectors for the target, collect candidates with vote counting
    const votes = new Map<Element, number>();
    for (const sel of tree.selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) {
          votes.set(el, (votes.get(el) || 0) + 1);
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }

    // 2. Single candidate with all votes → definite match (confidence 1.0)
    if (votes.size === 1) {
      const elements = Array.from(votes.keys());
      return { element: elements[0], confidence: 1.0, method: 'selector-unanimous' };
    }

    // 3. Multiple candidates → disambiguate by parent chain
    if (votes.size > 1) {
      const elements = Array.from(votes.keys());
      const best = disambiguateByParentChain(elements, tree);
      if (best) return { element: best, confidence: 0.9, method: 'parent-chain' };
    }

    // 4. No candidates from tree → try content matching
    if (content) {
      const contentMatch = findByContent(content);
      if (contentMatch) return { element: contentMatch, confidence: 0.6, method: 'content-match' };
    }

    return { element: null, confidence: 0, method: 'not-found' };
  }

  function disambiguateByParentChain(candidates: Element[], tree: any): Element | null {
    let bestEl: Element | null = null;
    let bestScore = -1;

    for (const candidate of candidates) {
      let score = 0;
      let parentNode = tree.parent;
      let parentEl = candidate.parentElement;

      // Walk up the tree comparing parents
      while (parentNode && parentEl) {
        const parentSelectors = parentNode.selectors || [];
        let parentMatched = false;

        for (const sel of parentSelectors) {
          try {
            if (parentEl.matches(sel)) {
              parentMatched = true;
              score += 1;
              break;
            }
          } catch {}
        }

        if (!parentMatched) break;
        
        parentNode = parentNode.parent;
        parentEl = parentEl.parentElement;
      }

      if (score > bestScore) {
        bestScore = score;
        bestEl = candidate;
      }
    }

    return bestScore > 0 ? bestEl : null;
  }

  function findByContent(content: string): Element | null {
    const roots = collectSearchRoots();
    const allElements: Element[] = [];
    
    for (const { root } of roots) {
      try {
        allElements.push(...Array.from(root.querySelectorAll('*')));
      } catch {}
    }
    
    return findByText(allElements, content, { fuzzy: true });
  }

  function findInRoot(step: GuideStep, root: SearchRoot): FindResult | null {
    const { element_info, element_text, element_role } = step;

    // Layer 1: SelectorTree (deterministic)
    if (element_info?.selectorTree || element_info?.selectorSet) {
      const tree = element_info.selectorTree || { selectors: element_info.selectorSet };
      const result = findElementByTree(tree, element_text);
      if (result.element) {
        return {
          element: result.element,
          confidence: result.confidence,
          method: result.method,
          iframeOffset: root.iframeOffset
        };
      }
    }

    // Layer 2: Traditional selectors
    if (step.selector) {
      const el = safeQuerySelector(root.root, step.selector);
      if (el && isVisible(el)) {
        return { element: el, confidence: 0.8, method: 'css-selector', iframeOffset: root.iframeOffset };
      }
    }

    // Layer 3: Test ID
    if (element_info?.testId) {
      const el = safeQuerySelector(root.root, `[data-testid="${element_info.testId}"]`);
      if (el && isVisible(el)) {
        return { element: el, confidence: 0.9, method: 'test-id', iframeOffset: root.iframeOffset };
      }
    }

    // Layer 4: Role + Text
    if (element_role && element_text) {
      const candidates = Array.from(root.root.querySelectorAll(`[role="${element_role}"]`));
      const match = findByText(candidates, element_text);
      if (match) {
        return { element: match, confidence: 0.7, method: 'role-text', iframeOffset: root.iframeOffset };
      }
    }

    // Layer 5: Tag + Text
    if (element_info?.tagName && element_text) {
      const candidates = Array.from(root.root.querySelectorAll(element_info.tagName));
      const match = findByText(candidates, element_text);
      if (match) {
        return { element: match, confidence: 0.6, method: 'tag-text', iframeOffset: root.iframeOffset };
      }
    }

    // Layer 6: XPath
    if (step.xpath && 'evaluate' in root.root) {
      try {
        const doc = root.root as Document;
        const result = doc.evaluate(step.xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const el = result.singleNodeValue as Element;
        if (el && isVisible(el)) {
          return { element: el, confidence: 0.5, method: 'xpath', iframeOffset: root.iframeOffset };
        }
      } catch {}
    }

    // Layer 7: Full-text search (fallback)
    if (element_text) {
      const allElements = Array.from(root.root.querySelectorAll('*'));
      const match = findByText(allElements, element_text, { fuzzy: true });
      if (match) {
        return { element: match, confidence: 0.4, method: 'text-search', iframeOffset: root.iframeOffset };
      }
    }

    return null;
  }

  async function findGuideElement(step: GuideStep): Promise<FindResult | null> {
    const roots = collectSearchRoots();
    let bestResult: FindResult | null = null;

    for (const root of roots) {
      const result = findInRoot(step, root);
      if (result && (!bestResult || result.confidence > bestResult.confidence)) {
        bestResult = result;
        if (result.confidence >= 0.9) break; // Good enough, stop searching
      }
    }

    return bestResult;
  }

  // ── Cross-Origin Iframe Handler ───────────────────────────────────

  async function findInCrossOriginFrames(step: GuideStep): Promise<FindResult | null> {
    const iframes = Array.from(document.querySelectorAll('iframe'));
    for (const iframe of iframes) {
      try {
        // Test if this is cross-origin by trying to access contentDocument
        if (iframe.contentDocument) continue; // same-origin, already handled
        
        // For cross-origin frames, we need to inject the script
        const tabId = await new Promise<number>((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, resolve);
        });
        
        if (!tabId) continue;
        
        try {
          const response: FrameFindResponse = await chrome.runtime.sendMessage({
            type: 'GUIDE_FIND_IN_FRAME',
            step,
            frameUrl: iframe.src,
            tabId
          });
          
          if (response.found && response.rect && response.frameRect) {
            // Create a pseudo-element to represent the cross-origin target
            const pseudoEl = document.createElement('div');
            pseudoEl.style.cssText = `
              position: absolute;
              left: ${response.frameRect.left + response.rect.left}px;
              top: ${response.frameRect.top + response.rect.top}px;
              width: ${response.rect.width}px;
              height: ${response.rect.height}px;
              pointer-events: none;
              visibility: hidden;
            `;
            document.body.appendChild(pseudoEl);
            
            return {
              element: pseudoEl,
              confidence: response.confidence || 0.5,
              method: response.method || 'cross-origin',
              iframeOffset: { x: response.frameRect.left, y: response.frameRect.top }
            };
          }
        } catch {}
      } catch {}
    }
    return null;
  }

  // ── EventEmitter Base Class ───────────────────────────────────────

  class EventEmitter {
    private listeners: Map<string, Function[]> = new Map();

    on(event: string, listener: Function): void {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event)!.push(listener);
    }

    off(event: string, listener: Function): void {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        const index = eventListeners.indexOf(listener);
        if (index > -1) {
          eventListeners.splice(index, 1);
        }
      }
    }

    emit(event: string, ...args: any[]): void {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        eventListeners.forEach(listener => listener(...args));
      }
    }

    removeAllListeners(): void {
      this.listeners.clear();
    }
  }

  // ── ElementWatcher Class ──────────────────────────────────────────

  class ElementWatcher extends EventEmitter {
    private step: GuideStep;
    private timeoutMs: number;
    private mutationObserver: MutationObserver | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private timeoutId: number | null = null;
    private retryTimeouts: number[] = [];
    private lastElement: Element | null = null;
    private destroyed = false;

    constructor(step: GuideStep, options: { timeoutMs: number }) {
      super();
      this.step = step;
      this.timeoutMs = options.timeoutMs;
    }

    start(): void {
      if (this.destroyed) return;

      // Immediate check
      this.checkForElement();

      // Set up MutationObserver for DOM changes
      this.mutationObserver = new MutationObserver(() => {
        if (!this.destroyed) {
          this.checkForElement();
        }
      });

      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'id', 'style', 'data-testid', 'role', 'aria-label']
      });

      // Set timeout for overall failure
      this.timeoutId = window.setTimeout(() => {
        if (!this.destroyed) {
          this.emit('timeout');
        }
      }, this.timeoutMs);
    }

    private checkForElement(): void {
      if (this.destroyed) return;

      findGuideElement(this.step).then(result => {
        if (this.destroyed) return;

        if (result) {
          const element = result.element;
          
          // If this is a new element or first find, emit 'found'
          if (element !== this.lastElement) {
            this.lastElement = element;
            this.emit('found', result);
            this.setupResizeObserver(element);
            
            // Clear any pending retries
            this.clearRetryTimeouts();
          }
        } else if (!this.lastElement) {
          // No element found and no previous element - schedule retry with backoff
          this.scheduleRetry();
        }
      }).catch(() => {
        if (!this.destroyed) {
          this.scheduleRetry();
        }
      });
    }

    private scheduleRetry(): void {
      if (this.destroyed) return;

      const delays = [100, 200, 400]; // Exponential backoff
      const retryCount = this.retryTimeouts.length;
      
      if (retryCount < delays.length) {
        const delay = delays[retryCount];
        const timeoutId = window.setTimeout(() => {
          if (!this.destroyed) {
            this.checkForElement();
          }
        }, delay);
        this.retryTimeouts.push(timeoutId);
      }
    }

    private setupResizeObserver(element: Element): void {
      if (this.destroyed) return;
      
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.destroyed && element.isConnected) {
          this.emit('changed', element);
        } else if (!this.destroyed && !element.isConnected) {
          // Element was removed, need to re-find
          this.lastElement = null;
          this.checkForElement();
        }
      });
      this.resizeObserver.observe(element);
    }

    private clearRetryTimeouts(): void {
      this.retryTimeouts.forEach(id => clearTimeout(id));
      this.retryTimeouts = [];
    }

    destroy(): void {
      this.destroyed = true;
      this.mutationObserver?.disconnect();
      this.resizeObserver?.disconnect();
      if (this.timeoutId) clearTimeout(this.timeoutId);
      this.clearRetryTimeouts();
      this.removeAllListeners();
      this.mutationObserver = null;
      this.resizeObserver = null;
      this.timeoutId = null;
      this.lastElement = null;
    }
  }

  // ── OverlayRenderer Class ──────────────────────────────────────────

  class OverlayRenderer {
    private host: HTMLElement | null = null;
    private shadow: ShadowRoot | null = null;
    private highlight: HTMLDivElement | null = null;
    private tooltip: HTMLDivElement | null = null;
    private positionFrame: number | null = null;
    private trackingElement: Element | null = null;
    private zoomObserver: MutationObserver | null = null;

    constructor() {
      this.createHost();
      this.setupZoomTracking();
    }

    private createHost(): void {
      // Fix #8: Use custom element instead of div with id
      this.host = document.createElement('stept-guide-overlay');
      this.host.style.cssText = `
        position: absolute; top: 0; left: 0; width: 1px; height: 1px;
        pointer-events: none; z-index: 2147483640;
      `;

      this.shadow = this.host.attachShadow({ mode: 'closed' });
      this.shadow.innerHTML = `<style>${STYLES}</style>`;

      // Make overlay immune to page's inert attribute
      const protectFromInert = (): void => {
        if (this.host?.hasAttribute('inert')) {
          this.host.removeAttribute('inert');
        }
      };
      const inertObserver = new MutationObserver(protectFromInert);
      inertObserver.observe(document.documentElement, { attributes: true, subtree: true });
      protectFromInert();

      document.documentElement.appendChild(this.host);
    }

    private setupZoomTracking(): void {
      let currentZoom = getPageZoom();
      const updateZoom = (): void => {
        const newZoom = getPageZoom();
        if (Math.abs(newZoom - currentZoom) > 0.01) {
          currentZoom = newZoom;
          this.updatePositions();
        }
      };

      this.zoomObserver = new MutationObserver(updateZoom);
      this.zoomObserver.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
      this.zoomObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    }

    showHighlight(element: Element, iframeOffset?: IframeOffset): void {
      if (!this.shadow) return;

      if (!this.highlight) {
        this.highlight = document.createElement('div');
        this.highlight.className = 'guide-highlight';
        this.shadow.appendChild(this.highlight);
      }

      this.updateHighlightPosition(element, iframeOffset);
      this.highlight.style.display = '';
    }

    showTooltip(step: GuideStep, index: number, total: number, rect: AdjustedRect, options: {
      urlMismatch?: boolean;
      obstructor?: HTMLElement | null;
    } = {}): void {
      if (!this.shadow) return;

      if (!this.tooltip) {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'guide-tooltip';
        this.shadow.appendChild(this.tooltip);
      }

      const stepTitle = step.title || `Step ${index + 1}`;
      const stepDescription = step.description;
      const actionType = (step.action_type || '').toLowerCase();
      const progressPercent = Math.round(((index + 1) / total) * 100);
      
      // Fix #4: Match original tooltip structure
      let tooltipHtml = `
        <button class="guide-close-btn" data-action="close">&times;</button>
        <div class="guide-tooltip-title">${this.escapeHtml(stepTitle)}</div>
      `;
      
      // Show description if it differs from title
      if (stepDescription && stepDescription !== stepTitle) {
        tooltipHtml += `<div class="guide-tooltip-desc">${this.escapeHtml(stepDescription)}</div>`;
      }
      
      // Progress bar
      tooltipHtml += `
        <div class="guide-tooltip-progress">
          Step ${index + 1} of ${total}
          <div class="guide-tooltip-progress-bar">
            <div class="guide-tooltip-progress-fill" style="width: ${progressPercent}%"></div>
          </div>
        </div>
      `;

      if (options.urlMismatch && step.expected_url) {
        tooltipHtml += `
          <div class="guide-tooltip-warning">
            This step expects a different page.
            <button class="guide-navigate-btn" data-action="navigate">Navigate to page</button>
          </div>
        `;
      }

      if (options.obstructor) {
        tooltipHtml += `
          <div class="guide-tooltip-warning">
            Element is blocked by an overlay. Try closing any modals or popups.
          </div>
        `;
      }

      // Action buttons
      tooltipHtml += '<div class="guide-tooltip-actions">';
      
      if (index > 0) {
        tooltipHtml += '<button class="guide-btn guide-btn-secondary" data-action="back">Back</button>';
      }
      
      tooltipHtml += '<div class="guide-spacer"></div>';
      tooltipHtml += '<button class="guide-btn guide-btn-ghost" data-action="skip">Skip</button>';
      
      // "Done ✓" button for non-click steps
      if (!actionType.includes('click')) {
        tooltipHtml += '<button class="guide-btn guide-btn-done" data-action="done">Done ✓</button>';
      }
      
      // Next/Finish button
      const isLastStep = index >= total - 1;
      tooltipHtml += `<button class="guide-btn guide-btn-primary" data-action="next">${isLastStep ? 'Finish' : 'Next'}</button>`;
      
      tooltipHtml += '</div>';

      this.tooltip.innerHTML = tooltipHtml;

      // Position tooltip
      this.positionTooltip(rect);

      // Stop event propagation
      for (const evt of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
        this.tooltip.addEventListener(evt, (e: Event) => e.stopPropagation());
      }

      this.tooltip.style.display = '';
    }

    showNotFound(step: GuideStep, index: number, total: number, options: { urlMismatch?: boolean } = {}): void {
      if (!this.shadow) return;

      const panel = document.createElement('div');
      panel.className = 'guide-not-found';

      let notFoundHtml = `
        <div class="guide-not-found-title">Element not found</div>
        <div class="guide-not-found-desc">
          Could not locate the target element for step ${index + 1}.
          ${options.urlMismatch ? "This step expects a different page." : "The page may have changed."}
        </div>
      `;

      if (options.urlMismatch && step.expected_url) {
        notFoundHtml += `<div style="margin-bottom: 12px;">
          <button class="guide-navigate-btn" data-action="navigate">Navigate to page</button>
        </div>`;
      }

      notFoundHtml += `
        <div class="guide-tooltip-progress">Step ${index + 1} of ${total}</div>
        <div class="guide-tooltip-actions" style="justify-content: center;">
          ${index > 0 ? `<button class="guide-btn guide-btn-secondary" data-action="back">Back</button>` : ''}
          <button class="guide-btn guide-btn-ghost" data-action="skip">Skip</button>
          <button class="guide-btn guide-btn-primary" data-action="close">Close</button>
        </div>
      `;

      panel.innerHTML = notFoundHtml;
      
      // Stop event propagation
      for (const evt of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
        panel.addEventListener(evt, (e: Event) => e.stopPropagation());
      }

      this.shadow.appendChild(panel);
    }

    showRoadblock(step: GuideStep, index: number, total: number): void {
      if (!this.shadow) return;

      const panel = document.createElement('div');
      panel.className = 'guide-not-found';

      panel.innerHTML = `
        <div class="guide-roadblock-icon">⚠</div>
        <div class="guide-not-found-title">We hit a roadblock</div>
        <div class="guide-not-found-desc">
          This step involves a hover action that can't be automated.
          Try performing the action on the screen to move forward.
        </div>
        <div class="guide-roadblock-step-title">${this.escapeHtml(step.title || step.description || `Step ${index + 1}`)}</div>
        <div class="guide-tooltip-progress">Step ${index + 1} of ${total}</div>
        <div class="guide-tooltip-actions" style="justify-content: center;">
          ${index > 0 ? `<button class="guide-btn guide-btn-secondary" data-action="back">Back</button>` : ''}
          <button class="guide-btn guide-btn-ghost" data-action="skip">Skip</button>
          <button class="guide-btn guide-btn-done" data-action="done">✓ Mark as complete</button>
        </div>
      `;

      for (const evt of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
        panel.addEventListener(evt, (e: Event) => e.stopPropagation());
      }

      this.shadow.appendChild(panel);
    }

    showIntermediateHint(step: GuideStep, ancestor: HTMLElement, index: number, total: number): void {
      if (!this.shadow) return;

      // Highlight the ancestor
      this.showHighlight(ancestor);
      if (this.highlight) {
        this.highlight.style.borderColor = "#6366F1";
        this.highlight.style.boxShadow = "0 0 0 4px rgba(99, 102, 241, 0.25)";
      }

      const panel = document.createElement('div');
      panel.className = 'guide-not-found';

      const ancestorDesc = describeElement(ancestor);
      panel.innerHTML = `
        <div class="guide-intermediate-hint">
          First, open <strong>${this.escapeHtml(ancestorDesc)}</strong> to reveal the target element.
        </div>
        <div class="guide-not-found-title">${this.escapeHtml(step.title || step.description || `Step ${index + 1}`)}</div>
        <div class="guide-tooltip-progress">Step ${index + 1} of ${total}</div>
        <div class="guide-tooltip-actions" style="justify-content: center;">
          ${index > 0 ? `<button class="guide-btn guide-btn-secondary" data-action="back">Back</button>` : ''}
          <button class="guide-btn guide-btn-ghost" data-action="skip">Skip</button>
          <button class="guide-btn guide-btn-primary" data-action="retry">Check again</button>
        </div>
      `;

      for (const evt of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
        panel.addEventListener(evt, (e: Event) => e.stopPropagation());
      }

      this.shadow.appendChild(panel);
    }

    showUrlMismatch(currentUrl: string): void {
      if (!this.shadow) return;

      const panel = document.createElement('div');
      panel.className = 'guide-not-found';

      panel.innerHTML = `
        <div class="guide-not-found-title">Wrong page</div>
        <div class="guide-not-found-desc">
          This guide is designed for a different page.
          <br><br>
          Current: <code>${this.escapeHtml(currentUrl)}</code>
        </div>
        <div class="guide-tooltip-actions" style="justify-content: center;">
          <button class="guide-btn guide-btn-primary" data-action="close">Close</button>
        </div>
      `;

      for (const evt of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
        panel.addEventListener(evt, (e: Event) => e.stopPropagation());
      }

      this.shadow.appendChild(panel);
    }

    showImageModal(imageUrl: string): void {
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
      img.src = imageUrl;
      backdrop.appendChild(img);
      shadow.appendChild(backdrop);

      document.documentElement.appendChild(host);
    }

    startTracking(element: Element): void {
      this.trackingElement = element;
      this.updatePositions();
    }

    stopTracking(): void {
      this.trackingElement = null;
      if (this.positionFrame) {
        cancelAnimationFrame(this.positionFrame);
        this.positionFrame = null;
      }
    }

    hideAll(): void {
      if (this.highlight) {
        this.highlight.style.display = 'none';
      }
      if (this.tooltip) {
        this.tooltip.style.display = 'none';
      }
      
      // Remove all dynamic panels
      if (this.shadow) {
        const panels = this.shadow.querySelectorAll('.guide-not-found');
        panels.forEach(panel => panel.remove());
      }
      
      this.stopTracking();
    }

    destroy(): void {
      this.stopTracking();
      this.zoomObserver?.disconnect();
      if (this.host) {
        this.host.remove();
      }
      this.host = null;
      this.shadow = null;
      this.highlight = null;
      this.tooltip = null;
      this.trackingElement = null;
    }

    private updatePositions(): void {
      if (this.trackingElement && this.trackingElement.isConnected) {
        this.updateHighlightPosition(this.trackingElement);
        
        if (this.tooltip && this.highlight) {
          const rect = this.getAdjustedRect(this.trackingElement);
          this.positionTooltip(rect);
        }
      }
      
      if (this.trackingElement) {
        this.positionFrame = requestAnimationFrame(() => this.updatePositions());
      }
    }

    private updateHighlightPosition(element: Element, iframeOffset?: IframeOffset): void {
      if (!this.highlight) return;

      const rect = this.getAdjustedRect(element, iframeOffset);
      const pad = 6;

      this.highlight.style.left = `${rect.left - pad}px`;
      this.highlight.style.top = `${rect.top - pad}px`;
      this.highlight.style.width = `${rect.width + pad * 2}px`;
      this.highlight.style.height = `${rect.height + pad * 2}px`;
    }

    private getAdjustedRect(element: Element, iframeOffset?: IframeOffset): AdjustedRect {
      const rect = element.getBoundingClientRect();
      const zoom = getPageZoom();
      const offset = iframeOffset || { x: 0, y: 0 };

      return {
        left: (rect.left + offset.x) * zoom,
        top: (rect.top + offset.y) * zoom,
        right: (rect.right + offset.x) * zoom,
        bottom: (rect.bottom + offset.y) * zoom,
        width: rect.width * zoom,
        height: rect.height * zoom
      };
    }

    private positionTooltip(rect: AdjustedRect): void {
      if (!this.tooltip) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 12;

      // Measure tooltip
      requestAnimationFrame(() => {
        if (!this.tooltip) return;
        
        const tr = this.tooltip.getBoundingClientRect();
        const tw = tr.width || 300;
        const th = tr.height || 200;

        const spaceBelow = vh - rect.bottom;
        const spaceAbove = rect.top;
        const spaceRight = vw - rect.right;
        const spaceLeft = rect.left;

        let top: number, left: number;

        if (spaceBelow >= th + gap) {
          // Below
          top = rect.bottom + gap;
          left = Math.max(8, Math.min(rect.left, vw - tw - 8));
        } else if (spaceAbove >= th + gap) {
          // Above
          top = rect.top - th - gap;
          left = Math.max(8, Math.min(rect.left, vw - tw - 8));
        } else if (spaceRight >= tw + gap) {
          // Right
          top = Math.max(8, Math.min(rect.top, vh - th - 8));
          left = rect.right + gap;
        } else if (spaceLeft >= tw + gap) {
          // Left
          top = Math.max(8, Math.min(rect.top, vh - th - 8));
          left = rect.left - tw - gap;
        } else {
          // Fallback: center bottom
          top = Math.min(rect.bottom + gap, vh - th - 8);
          left = Math.max(8, (vw - tw) / 2);
        }

        this.tooltip!.style.top = `${top}px`;
        this.tooltip!.style.left = `${left}px`;
      });
    }

    private escapeHtml(text: string): string {
      if (!text) return "";
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // ── StepExecutor Class ─────────────────────────────────────────────

  class StepExecutor extends EventEmitter {
    private step: GuideStep;
    private index: number;
    private total: number;
    private renderer: OverlayRenderer;
    private watcher: ElementWatcher | null = null;
    private clickHandler: ((e: Event) => void) | null = null;
    private parentClickHandler: ((e: Event) => void) | null = null;
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private completionCleanup: (() => void) | null = null;
    private completionTimeout: number | null = null;
    private currentElement: Element | null = null;
    private abortController: AbortController | null = null;
    private resolvePromise: ((value: 'completed' | 'skipped' | 'timeout' | 'back') => void) | null = null;
    private resolved = false;
    private searchHint: HTMLElement | null = null;

    constructor(step: GuideStep, index: number, total: number, renderer: OverlayRenderer) {
      super();
      this.step = step;
      this.index = index;
      this.total = total;
      this.renderer = renderer;
    }

    async start(): Promise<'completed' | 'skipped' | 'timeout' | 'back'> {
      return new Promise((resolve) => {
        this.resolvePromise = resolve;
        this.resolved = false;
        this.abortController = new AbortController();

        // Check for special action types first
        const actionType = (this.step.action_type || '').toLowerCase();
        
        // Fix #5: Auto-handle navigate steps
        if (actionType === 'navigate') {
          this.showSearchHint('Navigating...');
          setTimeout(() => {
            chrome.runtime.sendMessage({
              type: 'GUIDE_STEP_HEALTH',
              workflowId: this.getCurrentGuide()?.workflow_id || '',
              stepIndex: this.index,
              finderMethod: 'auto-navigate',
              confidence: 1.0,
              urls: [window.location.href],
              found: true
            }).catch(() => {});
            this.safeResolve('completed');
          }, 1000);
          return;
        }
        
        // Fix #5: Handle hover steps with roadblock
        if (actionType.includes('hover')) {
          this.renderer.showRoadblock(this.step, this.index, this.total);
          this.setupActionHandlers('roadblock');
          return;
        }

        // Fix #11: Show search hint
        this.showSearchHint('Finding element...');
        
        // Create watcher
        this.watcher = new ElementWatcher(this.step, { timeoutMs: 2000 });
        
        this.watcher.on('found', (result: FindResult) => {
          this.handleElementFound(result);
        });
        
        this.watcher.on('changed', (element: Element) => {
          this.handleElementChanged(element);
        });
        
        this.watcher.on('timeout', () => {
          this.handleTimeout();
        });
        
        this.watcher.start();
      });
    }

    private async handleElementFound(result: FindResult): Promise<void> {
      this.currentElement = result.element;
      this.hideSearchHint();
      
      // Fix #10: Send GUIDE_STEP_HEALTH message
      chrome.runtime.sendMessage({
        type: 'GUIDE_STEP_HEALTH',
        workflowId: this.getCurrentGuide()?.workflow_id || '',
        stepIndex: this.index,
        finderMethod: result.method,
        confidence: result.confidence,
        urls: [window.location.href],
        found: true
      }).catch(() => {});
      
      // Check for URL mismatch
      const urlMismatch = this.checkUrlMismatch();
      
      // Check for intermediate action needed
      const intermediateAncestor = needsIntermediateAction(result.element);
      if (intermediateAncestor) {
        this.renderer.showIntermediateHint(this.step, intermediateAncestor, this.index, this.total);
        this.setupActionHandlers('intermediate');
        return;
      }
      
      // Check for obstructor
      const obstructor = isObstructed(result.element);
      
      // Scroll to element
      await this.scrollToElement(result);
      
      // Show overlay
      this.renderer.showHighlight(result.element, result.iframeOffset);
      
      const rect = this.renderer['getAdjustedRect'](result.element, result.iframeOffset);
      this.renderer.showTooltip(this.step, this.index, this.total, rect, { urlMismatch, obstructor });
      
      // Start position tracking
      this.renderer.startTracking(result.element);
      
      // Setup interaction handlers
      this.setupClickHandler(result.element);
      this.setupCompletionDetection(result.element);
      this.setupActionHandlers('active');
      
      // Notify state
      chrome.runtime.sendMessage({
        type: 'GUIDE_STEP_CHANGED',
        currentIndex: this.index,
        totalSteps: this.total,
        stepStatus: 'active'
      }).catch(() => {});
    }

    private handleElementChanged(element: Element): void {
      if (element.isConnected) {
        // Element position changed, update overlay
        this.renderer.showHighlight(element);
      } else {
        // Element was removed, need to re-find
        this.currentElement = null;
      }
    }

    private handleTimeout(): void {
      this.hideSearchHint();
      
      // Fix #10: Send GUIDE_STEP_HEALTH for timeout
      chrome.runtime.sendMessage({
        type: 'GUIDE_STEP_HEALTH',
        workflowId: this.getCurrentGuide()?.workflow_id || '',
        stepIndex: this.index,
        finderMethod: 'timeout',
        confidence: 0,
        urls: [window.location.href],
        found: false
      }).catch(() => {});
      
      // Try LLM recovery
      this.tryLlmRecovery().then(recovered => {
        if (recovered) {
          // LLM found it, continue as normal
          return;
        }
        
        // Show roadblock
        this.renderer.showRoadblock(this.step, this.index, this.total);
        this.setupActionHandlers('roadblock');
      }).catch(() => {
        // Show roadblock on error
        this.renderer.showRoadblock(this.step, this.index, this.total);
        this.setupActionHandlers('roadblock');
      });
    }

    private async tryLlmRecovery(): Promise<boolean> {
      try {
        // Show recovery indicator
        this.renderer.hideAll();
        const searchHint = document.createElement('div');
        searchHint.className = 'guide-search-hint';
        searchHint.textContent = '🔄 AI is looking...';
        searchHint.style.cssText = `
          position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
          z-index: 2147483642; background: #FFFFFF; color: #FF6B52;
          padding: 8px 18px; border-radius: 20px; font-size: 12px;
          border: 1px solid #E5E5E5; pointer-events: none;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        `;
        if (this.renderer['shadow']) {
          this.renderer['shadow'].appendChild(searchHint);
        }

        const pageElements = this.collectInteractiveElements();
        const targetInfo = this.buildTargetInfo();
        const recovery = await this.callRecoveryApi(targetInfo, pageElements);
        
        // Remove search hint
        searchHint.remove();
        
        if (recovery.found && recovery.element_index !== null) {
          const foundElement = pageElements[recovery.element_index];
          const domElement = this.findDomElementByInfo(foundElement);
          
          if (domElement && isVisible(domElement)) {
            const result: FindResult = {
              element: domElement,
              confidence: recovery.confidence,
              method: 'llm-recovery',
              iframeOffset: { x: 0, y: 0 }
            };
            
            // Simulate watcher found event
            this.watcher?.emit('found', result);
            return true;
          }
        }
      } catch {}
      
      return false;
    }

    private setupClickHandler(element: Element): void {
      if (this.clickHandler) {
        element.removeEventListener('click', this.clickHandler);
        document.removeEventListener('click', this.parentClickHandler!, { capture: true });
      }
      
      const actionType = (this.step.action_type || '').toLowerCase();
      if (!actionType.includes('click')) return;
      
      // Fix #2: Attach click handler directly to element, let click through naturally
      this.clickHandler = () => {
        // Call advance after the natural click completes
        setTimeout(() => this.advance(), 50);
      };
      element.addEventListener('click', this.clickHandler, { once: true });
      
      // Keep a parent element listener as backup for SPA re-renders
      if (element.parentElement) {
        this.parentClickHandler = (e: Event) => {
          if (e.target === element || element.contains(e.target as Node)) {
            // Don't prevent default or stop propagation
            setTimeout(() => this.advance(), 50);
          }
        };
        document.addEventListener('click', this.parentClickHandler, { capture: true, once: true });
      }
    }

    private setupCompletionDetection(element: Element): void {
      const actionType = (this.step.action_type || '').toLowerCase();
      
      if (actionType.includes('type')) {
        const onInput = () => {
          if (this.completionTimeout) clearTimeout(this.completionTimeout);
          this.completionTimeout = window.setTimeout(() => this.advance(), 1500);
        };
        
        const ac = new AbortController();
        const opts = { capture: true, signal: ac.signal };
        element.addEventListener('input', onInput, opts);
        element.addEventListener('change', onInput, opts);
        element.addEventListener('paste', onInput, opts);
        
        this.completionCleanup = () => ac.abort();
        
      } else if (actionType.includes('select')) {
        const onChange = () => {
          setTimeout(() => this.advance(), 500);
        };
        element.addEventListener('change', onChange, { once: true });
        this.completionCleanup = () => element.removeEventListener('change', onChange);
      }
    }

    private setupActionHandlers(context: string): void {
      if (this.keyHandler) {
        document.removeEventListener('keydown', this.keyHandler, { capture: true });
      }
      
      this.keyHandler = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
          e.preventDefault();
          e.stopPropagation();
          this.safeResolve('skipped');
        }
      };
      document.addEventListener('keydown', this.keyHandler, { capture: true });
      
      // Setup click handlers for tooltip buttons
      if (this.renderer['shadow']) {
        const handleClick = (e: Event) => {
          const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
          if (!action) return;
          
          switch (action) {
            case 'back':
              // Fix #3: Return 'back' for back button
              this.safeResolve('back');
              break;
            case 'skip':
              this.safeResolve('skipped');
              break;
            case 'close':
              this.safeResolve('timeout'); // Will be handled as stop
              break;
            case 'done':
              this.safeResolve('completed');
              break;
            case 'next':
              this.safeResolve('completed');
              break;
            case 'retry':
              // Restart this step
              this.destroy();
              this.start().then(result => this.safeResolve(result));
              break;
            case 'navigate':
              if (this.step.expected_url) {
                chrome.runtime.sendMessage({
                  type: 'GUIDE_NAVIGATE',
                  url: this.step.expected_url,
                  stepIndex: this.index
                });
              }
              break;
          }
        };
        
        this.renderer['shadow'].addEventListener('click', handleClick);
      }
    }

    private safeResolve(value: 'completed' | 'skipped' | 'timeout' | 'back'): void {
      if (!this.resolved && this.resolvePromise) {
        this.resolved = true;
        this.resolvePromise(value);
      }
    }

    private getCurrentGuide(): Guide | null {
      return _window.__steptGuideRunner?.guide || null;
    }

    private showSearchHint(text: string): void {
      this.hideSearchHint();
      
      this.searchHint = document.createElement('div');
      this.searchHint.className = 'guide-search-hint';
      this.searchHint.textContent = text;
      this.searchHint.style.cssText = `
        position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
        z-index: 2147483642; background: #FFFFFF; color: #FF6B52;
        padding: 8px 18px; border-radius: 20px; font-size: 12px;
        border: 1px solid #E5E5E5; pointer-events: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      `;
      
      if (this.renderer['shadow']) {
        this.renderer['shadow'].appendChild(this.searchHint);
      }
    }

    private hideSearchHint(): void {
      if (this.searchHint) {
        this.searchHint.remove();
        this.searchHint = null;
      }
    }

    private checkUrlMismatch(): boolean {
      if (!this.step.expected_url && !this.step.url) return false;
      const expectedUrl = this.step.expected_url || this.step.url;
      if (!expectedUrl) return false;
      
      try {
        const expected = new URL(expectedUrl);
        const current = new URL(window.location.href);
        return expected.hostname !== current.hostname || expected.pathname !== current.pathname;
      } catch {
        return false;
      }
    }

    private async scrollToElement(result: FindResult): Promise<void> {
      const element = result.element;
      const rect = element.getBoundingClientRect();
      
      // Check if element is already in view
      if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
        return;
      }
      
      // Smooth scroll to element
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center',
        inline: 'nearest'
      });
      
      // Wait for scroll to complete
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    private advance(): void {
      if (this.completionTimeout) {
        clearTimeout(this.completionTimeout);
        this.completionTimeout = null;
      }
      // Fix #1: Actually resolve the promise
      this.safeResolve('completed');
    }

    private collectInteractiveElements(): any[] {
      // Simplified version for LLM recovery
      const interactiveElements: any[] = [];
      const roots = collectSearchRoots();
      
      for (const { root } of roots) {
        try {
          const elements = root.querySelectorAll('button, input, select, textarea, a, [role="button"], [tabindex], [onclick]');
          elements.forEach((el, index) => {
            if (isVisible(el)) {
              interactiveElements.push({
                index,
                tagName: el.tagName,
                text: (el.textContent || '').trim().substring(0, 100),
                id: el.id,
                className: el.className,
                role: el.getAttribute('role'),
                ariaLabel: el.getAttribute('aria-label'),
                type: (el as HTMLInputElement).type,
                placeholder: (el as HTMLInputElement).placeholder
              });
            }
          });
        } catch {}
      }
      
      return interactiveElements;
    }

    private buildTargetInfo(): any {
      return {
        text: this.step.element_text || '',
        role: this.step.element_role || '',
        tagName: this.step.element_info?.tagName || '',
        description: this.step.description || '',
        action_type: this.step.action_type || ''
      };
    }

    private async callRecoveryApi(targetInfo: any, pageElements: any[]): Promise<any> {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'GUIDE_RECOVERY',
          targetInfo,
          pageElements,
          workflowId: '',
          stepIndex: this.index
        }, (response) => {
          resolve(response || { found: false });
        });
      });
    }

    private findDomElementByInfo(elementInfo: any): Element | null {
      const roots = collectSearchRoots();
      
      for (const { root } of roots) {
        try {
          const elements = root.querySelectorAll('*');
          let bestMatch: Element | null = null;
          let bestScore = 0;
          
          elements.forEach((el) => {
            if (!isVisible(el)) return;
            
            let score = 0;
            
            // Match by text content
            const text = (el.textContent || '').trim();
            if (elementInfo.text && text.includes(elementInfo.text)) score += 3;
            
            // Match by tag name
            if (elementInfo.tagName && el.tagName.toLowerCase() === elementInfo.tagName.toLowerCase()) score += 2;
            
            // Match by role
            if (elementInfo.role && el.getAttribute('role') === elementInfo.role) score += 2;
            
            // Match by ID
            if (elementInfo.id && el.id === elementInfo.id) score += 4;
            
            // Match by class
            if (elementInfo.className && el.className.includes(elementInfo.className)) score += 1;
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = el;
            }
          });
          
          if (bestMatch && bestScore >= 3) {
            return bestMatch;
          }
        } catch {}
      }
      
      return null;
    }

    destroy(): void {
      this.watcher?.destroy();
      this.renderer.stopTracking();
      
      if (this.clickHandler) {
        document.removeEventListener('click', this.clickHandler, { capture: true });
        this.clickHandler = null;
      }
      
      if (this.parentClickHandler) {
        document.removeEventListener('click', this.parentClickHandler, { capture: true });
        this.parentClickHandler = null;
      }
      
      if (this.keyHandler) {
        document.removeEventListener('keydown', this.keyHandler, { capture: true });
        this.keyHandler = null;
      }
      
      if (this.completionCleanup) {
        this.completionCleanup();
        this.completionCleanup = null;
      }
      
      if (this.completionTimeout) {
        clearTimeout(this.completionTimeout);
        this.completionTimeout = null;
      }
      
      this.abortController?.abort();
      this.removeAllListeners();
    }
  }

  // ── URLWatcher Class ───────────────────────────────────────────────

  class URLWatcher {
    private callback: (url: string) => void;
    private lastUrl: string;
    private pollInterval: number | null = null;
    private destroyed = false;

    constructor(callback: (url: string) => void) {
      this.callback = callback;
      this.lastUrl = window.location.href;
      this.setupWatching();
    }

    private setupWatching(): void {
      // Fix #6: Restore original URL watching pattern
      const checkUrl = () => {
        if (this.destroyed) return;
        const currentUrl = window.location.href;
        if (currentUrl !== this.lastUrl) {
          this.lastUrl = currentUrl;
          this.callback(currentUrl);
        }
      };

      // popstate listener for back/forward
      window.addEventListener('popstate', checkUrl);
      
      // hashchange listener
      window.addEventListener('hashchange', checkUrl);
      
      // 500ms setInterval polling for SPA pushState changes
      this.pollInterval = window.setInterval(checkUrl, 500);
    }

    destroy(): void {
      this.destroyed = true;
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
      // Note: event listeners will be cleaned up by browser
    }
  }

  // ── GuideRunner Class ──────────────────────────────────────────────

  class GuideRunner extends EventEmitter {
    public guide: Guide;
    public steps: GuideStep[];
    public currentIndex: number = 0;
    private state: GuideState = GuideState.IDLE;
    private renderer: OverlayRenderer | null = null;
    private currentExecutor: StepExecutor | null = null;
    private urlWatcher: URLWatcher | null = null;
    public _replacing = false;

    constructor(guide: Guide) {
      super();
      this.guide = guide;
      this.steps = guide.steps || [];
    }

    async start(startIndex: number = 0): Promise<void> {
      this.currentIndex = startIndex;
      this.transition(GuideState.IDLE);
      
      if (this.steps.length === 0) {
        this.showEmpty();
        return;
      }
      
      this.renderer = new OverlayRenderer();
      this.setupUrlWatcher();
      
      await this.runStep(startIndex);
    }

    stop(): void {
      this.transition(GuideState.COMPLETED);
      
      this.currentExecutor?.destroy();
      this.currentExecutor = null;
      
      this.renderer?.destroy();
      this.renderer = null;
      
      this.urlWatcher?.destroy();
      this.urlWatcher = null;
      
      // Fix #9: Only send GUIDE_STOPPED if not being replaced
      if (!this._replacing) {
        chrome.runtime.sendMessage({
          type: 'GUIDE_STOPPED'
        }).catch(() => {});
      }
      
      this.removeAllListeners();
    }

    public async showStep(index: number): Promise<void> {
      if (index < 0 || index >= this.steps.length) {
        this.stop();
        return;
      }
      
      this.currentIndex = index;
      await this.runStep(index);
    }

    private async runStep(index: number): Promise<void> {
      // Clean up previous executor
      this.currentExecutor?.destroy();
      this.currentExecutor = null;
      
      if (!this.renderer) {
        this.renderer = new OverlayRenderer();
      }
      
      this.renderer.hideAll();
      this.transition(GuideState.SEARCHING);
      
      // Notify step change
      chrome.runtime.sendMessage({
        type: 'GUIDE_STEP_CHANGED',
        currentIndex: this.currentIndex,
        totalSteps: this.steps.length,
        stepStatus: 'searching'
      }).catch(() => {});
      
      // Create and start step executor
      this.currentExecutor = new StepExecutor(this.steps[index], index, this.steps.length, this.renderer);
      
      try {
        const result = await this.currentExecutor.start();
        
        // Clean up current executor
        this.currentExecutor.destroy();
        this.currentExecutor = null;
        
        // Handle result
        switch (result) {
          case 'completed':
            this.transition(GuideState.ADVANCING);
            if (index >= this.steps.length - 1) {
              this.transition(GuideState.COMPLETED);
              this.stop();
            } else {
              await this.runStep(index + 1);
            }
            break;
            
          case 'skipped':
            this.transition(GuideState.ADVANCING);
            if (index >= this.steps.length - 1) {
              this.transition(GuideState.COMPLETED);
              this.stop();
            } else {
              await this.runStep(index + 1);
            }
            break;
            
          // Fix #3: Handle 'back' result
          case 'back':
            this.transition(GuideState.ADVANCING);
            if (index > 0) {
              await this.runStep(index - 1);
            }
            break;
            
          case 'timeout':
            this.transition(GuideState.NOT_FOUND);
            this.stop();
            break;
        }
      } catch (error) {
        console.error('Step execution failed:', error);
        this.stop();
      }
    }

    private transition(newState: GuideState): void {
      // Validate transition (basic state machine)
      const validTransitions: Record<GuideState, GuideState[]> = {
        [GuideState.IDLE]: [GuideState.SEARCHING, GuideState.COMPLETED],
        [GuideState.SEARCHING]: [GuideState.ACTIVE, GuideState.NOT_FOUND, GuideState.RECOVERING, GuideState.COMPLETED],
        [GuideState.ACTIVE]: [GuideState.ADVANCING, GuideState.COMPLETED],
        [GuideState.NOT_FOUND]: [GuideState.RECOVERING, GuideState.ADVANCING, GuideState.COMPLETED],
        [GuideState.RECOVERING]: [GuideState.ACTIVE, GuideState.NOT_FOUND, GuideState.COMPLETED],
        [GuideState.ADVANCING]: [GuideState.SEARCHING, GuideState.COMPLETED],
        [GuideState.COMPLETED]: []
      };
      
      if (!validTransitions[this.state].includes(newState)) {
        console.warn(`Invalid state transition: ${this.state} -> ${newState}`);
        return;
      }
      
      const oldState = this.state;
      this.state = newState;
      
      // Notify state change
      chrome.runtime.sendMessage({
        type: 'GUIDE_STATE_CHANGED',
        oldState,
        newState,
        currentIndex: this.currentIndex,
        workflowId: this.guide.workflow_id || this.guide.workflowId || this.guide.id
      }).catch(() => {});
    }

    private setupUrlWatcher(): void {
      // Fix #6: Use the new URLWatcher class
      this.urlWatcher = new URLWatcher((url) => {
        this.checkUrlChange();
      });
    }

    private checkUrlChange(): void {
      chrome.runtime.sendMessage({
        type: 'GUIDE_URL_CHANGED',
        url: window.location.href,
        currentIndex: this.currentIndex,
        workflowId: this.guide.workflow_id || this.guide.workflowId || this.guide.id
      }).catch(() => {});
    }

    private showEmpty(): void {
      if (!this.renderer) {
        this.renderer = new OverlayRenderer();
      }
      
      this.renderer.hideAll();
      
      const panel = document.createElement('div');
      panel.className = 'guide-not-found';
      panel.innerHTML = `
        <div class="guide-not-found-title">No steps in this guide</div>
        <div class="guide-not-found-desc">This guide has no steps to display.</div>
        <button class="guide-btn guide-btn-primary" data-action="close">Close</button>
      `;
      
      panel.addEventListener('click', (e: Event) => {
        if ((e.target as HTMLElement).closest('[data-action=close]')) {
          this.stop();
        }
      });
      
      if (this.renderer['shadow']) {
        this.renderer['shadow'].appendChild(panel);
      }
    }
  }

  // ── CSS Styles ─────────────────────────────────────────────────────

  const STYLES = `
    :host { all: initial !important; }
    * { box-sizing: border-box !important; }
    
    .guide-highlight {
      position: fixed; z-index: 2147483641; pointer-events: none;
      border: 3px solid #FF6B52; border-radius: 8px;
      box-shadow: 0 0 0 4px rgba(255, 107, 82, 0.25);
      transition: all 0.2s ease-out;
      animation: guide-highlight-in 0.3s ease-out;
    }
    
    @keyframes guide-highlight-in {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    
    .guide-tooltip {
      position: fixed; z-index: 2147483642;
      background: #FFFFFF; color: #1F2937;
      border: 1px solid #E5E5E5; border-radius: 12px;
      padding: 16px; min-width: 280px; max-width: 360px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      animation: guide-tooltip-in 0.2s ease-out;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px; line-height: 1.4;
      position: relative;
    }
    
    @keyframes guide-tooltip-in {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .guide-close-btn {
      position: absolute; top: 8px; right: 8px;
      background: none; border: none; font-size: 18px;
      color: #9CA3AF; cursor: pointer; padding: 4px;
      line-height: 1; width: 24px; height: 24px;
      display: flex; align-items: center; justify-content: center;
    }
    .guide-close-btn:hover {
      color: #374151;
    }
    
    .guide-tooltip-title {
      font-weight: 600; color: #111827; margin-bottom: 8px;
      font-size: 15px; line-height: 1.3; padding-right: 32px;
    }
    
    .guide-tooltip-desc {
      color: #6B7280; margin-bottom: 12px; font-size: 14px;
    }
    
    .guide-tooltip-progress {
      color: #6B7280; font-size: 12px; margin-bottom: 16px;
    }
    
    .guide-tooltip-progress-bar {
      background: #F3F4F6; height: 4px; border-radius: 2px;
      margin-top: 6px; overflow: hidden;
    }
    
    .guide-tooltip-progress-fill {
      background: #FF6B52; height: 100%; border-radius: 2px;
      transition: width 0.3s ease;
    }
    
    .guide-tooltip-actions {
      display: flex; gap: 8px; align-items: center;
    }
    
    .guide-spacer {
      flex: 1;
    }
    
    .guide-btn {
      padding: 8px 16px; border-radius: 8px; border: none;
      font-size: 13px; font-weight: 500; cursor: pointer;
      transition: all 0.15s ease;
    }
    
    .guide-btn-primary {
      background: #FF6B52; color: white;
    }
    .guide-btn-primary:hover {
      background: #E55A47;
    }
    
    .guide-btn-secondary {
      background: #F3F4F6; color: #374151;
    }
    .guide-btn-secondary:hover {
      background: #E5E7EB;
    }
    
    .guide-btn-ghost {
      background: transparent; color: #6B7280;
    }
    .guide-btn-ghost:hover {
      background: #F9FAFB; color: #374151;
    }
    
    .guide-btn-done {
      background: #059669; color: white;
    }
    .guide-btn-done:hover {
      background: #047857;
    }
    
    .guide-not-found {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 2147483643; background: #FFFFFF; color: #1F2937;
      border: 1px solid #E5E5E5; border-radius: 16px;
      padding: 24px; width: 400px; max-width: calc(100vw - 32px);
      box-shadow: 0 12px 48px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
    }
    
    .guide-not-found-title {
      font-size: 18px; font-weight: 600; color: #111827;
      margin-bottom: 12px;
    }
    
    .guide-not-found-desc {
      color: #6B7280; margin-bottom: 20px; line-height: 1.5;
    }
    
    .guide-roadblock-icon {
      font-size: 32px; margin-bottom: 16px;
    }
    
    .guide-roadblock-step-title {
      background: #F9FAFB; padding: 12px; border-radius: 8px;
      margin: 16px 0; font-weight: 500; color: #374151;
    }
    
    .guide-intermediate-hint {
      background: #EFF6FF; color: #1E40AF; padding: 12px;
      border-radius: 8px; margin-bottom: 16px; font-size: 14px;
    }
    
    .guide-navigate-btn {
      background: #3B82F6; color: white; border: none;
      padding: 8px 16px; border-radius: 6px; font-size: 13px;
      cursor: pointer; margin-top: 8px;
    }
    .guide-navigate-btn:hover {
      background: #2563EB;
    }
    
    .guide-tooltip-warning {
      background: #FEF3C7; color: #92400E; padding: 10px;
      border-radius: 6px; margin: 12px 0; font-size: 13px;
    }
    
    .guide-search-hint {
      animation: guide-tooltip-in 0.2s ease-out;
    }
    
    .guide-completion-indicator {
      animation: guide-tooltip-in 0.2s ease-out;
    }
  `;

  // ── Cross-origin Frame Handler (for child frames) ─────────────────

  // Fix #7: Handle child frames separately before main runner
  if (window !== window.top) {
    chrome.runtime.onMessage.addListener((message: any, _sender: MessageSender, sendResponse: SendResponse) => {
      if (message.type === "GUIDE_FIND_IN_FRAME") {
        // Fix #7: Extract step from message correctly
        const result = findInRoot(message.step, { root: document, iframeOffset: { x: 0, y: 0 }, depth: 0 });
        if (result) {
          const rect = result.element.getBoundingClientRect();
          sendResponse({
            found: true,
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            confidence: result.confidence,
            method: result.method
          });
        } else {
          sendResponse({ found: false });
        }
        return true; // Async response
      }
      return false;
    });
    
    // Child frames don't create overlay or register START_GUIDE handlers
    return;
  }

  // ── Active Runner Singleton ───────────────────────────────────────

  let activeRunner: GuideRunner | null = null;
  _window.__steptGuideRunner = null;

  // ── Image Modal ───────────────────────────────────────────────────

  function showImageModal(dataUrl: string): void {
    // Remove any existing modal
    const existing = document.getElementById('stept-image-modal');
    if (existing) existing.remove();

    const renderer = new OverlayRenderer();
    renderer.showImageModal(dataUrl);
  }

  // ── Message Handling ──────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message: { 
    type: string; 
    guide: Guide; 
    startIndex?: number; 
    stepIndex?: number;
    dataUrl?: string;
    step?: GuideStep;
  }, _sender: MessageSender, sendResponse: SendResponse) => {
    
    if (message.type === "START_GUIDE") {
      try {
        if (activeRunner) {
          // Fix #9: Set _replacing flag before stopping old runner
          activeRunner._replacing = true;
          activeRunner.stop();
        }
        const runner = new GuideRunner(message.guide);
        activeRunner = runner;
        _window.__steptGuideRunner = runner;
        const startAt = (typeof message.startIndex === "number" && message.startIndex > 0) ? message.startIndex : 0;
        runner.start(startAt);
        sendResponse({ success: true });
      } catch (e: unknown) {
        sendResponse({ success: false, error: (e as Error).message });
      }
    } 
    else if (message.type === "GUIDE_GOTO") {
      if (activeRunner && typeof message.stepIndex === "number") {
        activeRunner.showStep(message.stepIndex);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
    } 
    else if (message.type === "STOP_GUIDE") {
      if (activeRunner) {
        activeRunner.stop();
      }
      sendResponse({ success: true });
    } 
    else if (message.type === "GUIDE_SHOW_IMAGE") {
      if (message.dataUrl) {
        showImageModal(message.dataUrl);
      }
      sendResponse({ success: true });
    }
    else if (message.type === "GUIDE_FIND_IN_FRAME") {
      // Handle cross-origin frame element finding
      // Fix #7: Extract step from message correctly  
      findGuideElement(message.step!).then(result => {
        if (result) {
          const rect = result.element.getBoundingClientRect();
          sendResponse({
            found: true,
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            confidence: result.confidence,
            method: result.method
          });
        } else {
          sendResponse({ found: false });
        }
      });
      return true; // Async response
    }
    
    return false;
  });

  // ── Export Runtime Class ──────────────────────────────────────────

  _window.__steptGuideRuntime = GuideRunner;

})();