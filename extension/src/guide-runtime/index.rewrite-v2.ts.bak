// Guide Runtime — Complete rewrite with hybrid architecture
// Event-driven ElementWatcher (Usertour pattern) + Multi-selector cascade (stept innovation)
// Light Tango-style overlay + Progressive search timing + URL monitoring
// MUST remain a single self-contained IIFE (Chrome extension requirement)

(function () {
  'use strict';

  // ═══ TYPE DEFINITIONS ═══

  interface ElementInfo {
    testId?: string;
    tagName?: string;
    parentChain?: ParentChainEntry[];
    selectorSet?: string[];
    selector?: string;
    xpath?: string;
  }

  interface ParentChainEntry {
    tag: string;
    id?: string;
    testId?: string;
    role?: string;
    ariaLabel?: string;
    className?: string;
  }

  interface GuideStep {
    id?: string;
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
    selectorSet?: string[];
  }

  interface Guide {
    steps?: GuideStep[];
    workflow_id?: string;
    workflowId?: string;
    id?: string;
  }

  interface FindResult {
    element: Element;
    confidence: number;
    method: string;
    iframeOffset?: { x: number; y: number };
  }

  interface IframeOffset {
    x: number;
    y: number;
  }

  interface SearchRoot {
    root: Document | ShadowRoot;
    iframeOffset: IframeOffset;
    depth: number;
  }

  type GuideState = 
    | { type: 'idle' }
    | { type: 'searching'; step: GuideStep; retryCount: number }
    | { type: 'found'; step: GuideStep; element: Element; confidence: number }
    | { type: 'notfound'; step: GuideStep; timeoutReached: boolean }
    | { type: 'completed' }
    | { type: 'stopped' };

  type GuideEvent =
    | { type: 'START_GUIDE'; guide: Guide; startIndex?: number }
    | { type: 'STOP_GUIDE' }
    | { type: 'ELEMENT_FOUND'; element: Element; confidence: number; method: string }
    | { type: 'ELEMENT_CHANGED'; element: Element }
    | { type: 'ELEMENT_TIMEOUT' }
    | { type: 'ACTION_COMPLETED' }
    | { type: 'URL_CHANGED'; oldUrl: string; newUrl: string }
    | { type: 'USER_SKIP' }
    | { type: 'MARK_COMPLETE' };

  // Extend Window
  interface SteptWindow extends Window {
    __steptGuideLoaded?: boolean;
    __steptGuideRunner?: GuideRunner | null;
    __steptGuideRuntime?: typeof GuideRunner;
  }

  const _window = window as unknown as SteptWindow;

  // ═══ DEDUPLICATION & CLEANUP ═══

  const DEDUP_EVENT = "stept_guide_remove_" + chrome.runtime.id;
  
  const cleanup = (): void => {
    if (_window.__steptGuideRunner) {
      _window.__steptGuideRunner.destroy();
      _window.__steptGuideRunner = null;
    }
    document.querySelectorAll('[data-stept-guide]').forEach(el => el.remove());
  };

  document.addEventListener(DEDUP_EVENT, cleanup);
  cleanup();
  document.dispatchEvent(new CustomEvent(DEDUP_EVENT));

  // ═══ EVENT EMITTER BASE CLASS ═══

  class EventEmitter {
    private listeners: Map<string, Function[]> = new Map();

    on(event: string, listener: Function): void {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event)!.push(listener);
    }

    off(event: string, listener?: Function): void {
      if (!listener) {
        this.listeners.delete(event);
        return;
      }
      const list = this.listeners.get(event);
      if (list) {
        const index = list.indexOf(listener);
        if (index > -1) list.splice(index, 1);
        if (list.length === 0) this.listeners.delete(event);
      }
    }

    emit(event: string, ...args: any[]): void {
      const list = this.listeners.get(event);
      if (list) {
        // Create a copy to avoid issues if listeners are removed during emission
        [...list].forEach(listener => {
          try {
            listener(...args);
          } catch (error) {
            console.error('EventEmitter listener error:', error);
          }
        });
      }
    }

    removeAllListeners(): void {
      this.listeners.clear();
    }
  }

  // ═══ ELEMENT FINDER ═══
  // Pure functions for element finding with multi-selector cascade

  class ElementFinder {
    private static CSS_ESCAPE_REGEX = /([!"#$%&'()*+,\-.\/:;<=>?@[\\\]^`{|}~])/g;

    private static cssEscape(value: string): string {
      return value.replace(this.CSS_ESCAPE_REGEX, '\\$1');
    }

    private static isUnique(selector: string, root: Document | ShadowRoot = document): boolean {
      try {
        return root.querySelectorAll(selector).length === 1;
      } catch {
        return false;
      }
    }

    // Main cascade function - tries all strategies in order
    static findInCascade(step: GuideStep, searchRoots: SearchRoot[] = []): FindResult | null {
      if (searchRoots.length === 0) {
        searchRoots = this.getSearchRoots();
      }

      // Strategy 1: selectorSet (0-200ms) - Our main innovation
      if (step.selectorSet && step.selectorSet.length > 0) {
        const result = this.trySelectorsSet(step.selectorSet, searchRoots);
        if (result) return { ...result, method: 'selectorSet', confidence: 0.95 };
      }

      // Strategy 2: Primary selector (200-300ms)
      if (step.selector) {
        const result = this.trySelector(step.selector, searchRoots);
        if (result) return { ...result, method: 'selector', confidence: 0.9 };
      }

      // Strategy 3: Element info selectors (300-400ms)
      if (step.element_info) {
        const result = this.tryElementInfoSelectors(step.element_info, searchRoots);
        if (result) return result;
      }

      // Strategy 4: Test ID variations (400-500ms)
      if (step.element_info?.testId) {
        const result = this.tryTestIdVariations(step.element_info.testId, searchRoots);
        if (result) return { ...result, method: 'testId', confidence: 0.8 };
      }

      // Strategy 5: Role + text matching (500-700ms)
      if (step.element_role && step.element_text) {
        const result = this.tryRoleTextMatch(step.element_role, step.element_text, searchRoots);
        if (result) return { ...result, method: 'roleText', confidence: 0.7 };
      }

      // Strategy 6: Tag + text fuzzy matching (700-900ms)
      if (step.element_info?.tagName && step.element_text) {
        const result = this.tryTagTextFuzzy(step.element_info.tagName, step.element_text, searchRoots);
        if (result) return { ...result, method: 'tagTextFuzzy', confidence: 0.6 };
      }

      // Strategy 7: XPath fallback (900-1000ms)
      if (step.xpath) {
        const result = this.tryXPath(step.xpath, searchRoots);
        if (result) return { ...result, method: 'xpath', confidence: 0.5 };
      }

      // Strategy 8: Parent chain context (1000-1500ms)
      if (step.element_info?.parentChain) {
        const result = this.tryParentChain(step, searchRoots);
        if (result) return { ...result, method: 'parentChain', confidence: 0.4 };
      }

      // Strategy 9: Title hint extraction (1500-2000ms)
      if (step.title || step.description) {
        const result = this.tryTitleHints(step.title || step.description || '', searchRoots);
        if (result) return { ...result, method: 'titleHint', confidence: 0.3 };
      }

      return null;
    }

    private static trySelectorsSet(selectors: string[], searchRoots: SearchRoot[]): FindResult | null {
      for (const selector of selectors) {
        const result = this.trySelector(selector, searchRoots);
        if (result) return result;
      }
      return null;
    }

    private static trySelector(selector: string, searchRoots: SearchRoot[]): FindResult | null {
      for (const { root, iframeOffset } of searchRoots) {
        try {
          const element = root.querySelector(selector);
          if (element && this.isVisible(element as HTMLElement)) {
            return { element, confidence: 0.9, method: 'selector', iframeOffset };
          }
        } catch (e) {
          continue;
        }
      }
      return null;
    }

    private static tryElementInfoSelectors(elementInfo: ElementInfo, searchRoots: SearchRoot[]): FindResult | null {
      // Try selectorSet first if available
      if (elementInfo.selectorSet) {
        const result = this.trySelectorsSet(elementInfo.selectorSet, searchRoots);
        if (result) return { ...result, method: 'elementInfo.selectorSet', confidence: 0.85 };
      }

      // Try primary selector
      if (elementInfo.selector) {
        const result = this.trySelector(elementInfo.selector, searchRoots);
        if (result) return { ...result, method: 'elementInfo.selector', confidence: 0.8 };
      }

      return null;
    }

    private static tryTestIdVariations(testId: string, searchRoots: SearchRoot[]): FindResult | null {
      const variations = [
        `[data-testid="${this.cssEscape(testId)}"]`,
        `[data-test="${this.cssEscape(testId)}"]`,
        `[data-cy="${this.cssEscape(testId)}"]`,
        `[data-qa="${this.cssEscape(testId)}"]`,
        `[data-automation-id="${this.cssEscape(testId)}"]`,
        `[data-e2e="${this.cssEscape(testId)}"]`,
      ];

      for (const selector of variations) {
        const result = this.trySelector(selector, searchRoots);
        if (result) return result;
      }
      return null;
    }

    private static tryRoleTextMatch(role: string, text: string, searchRoots: SearchRoot[]): FindResult | null {
      for (const { root, iframeOffset } of searchRoots) {
        try {
          const elements = root.querySelectorAll(`[role="${role}"]`);
          for (const el of elements) {
            if (this.textMatches(el, text, { fuzzy: false }) && this.isVisible(el as HTMLElement)) {
              return { element: el, confidence: 0.7, method: 'roleText', iframeOffset };
            }
          }
        } catch (e) {
          continue;
        }
      }
      return null;
    }

    private static tryTagTextFuzzy(tagName: string, text: string, searchRoots: SearchRoot[]): FindResult | null {
      for (const { root, iframeOffset } of searchRoots) {
        try {
          const elements = root.querySelectorAll(tagName.toLowerCase());
          for (const el of elements) {
            if (this.textMatches(el, text, { fuzzy: true }) && this.isVisible(el as HTMLElement)) {
              return { element: el, confidence: 0.6, method: 'tagTextFuzzy', iframeOffset };
            }
          }
        } catch (e) {
          continue;
        }
      }
      return null;
    }

    private static tryXPath(xpath: string, searchRoots: SearchRoot[]): FindResult | null {
      for (const { root, iframeOffset } of searchRoots) {
        try {
          if (root === document || (root as any).evaluate) {
            const doc = root === document ? document : (root as any).ownerDocument || document;
            const result = doc.evaluate(xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            if (result.singleNodeValue && this.isVisible(result.singleNodeValue as HTMLElement)) {
              return { 
                element: result.singleNodeValue as Element, 
                confidence: 0.5, 
                method: 'xpath', 
                iframeOffset 
              };
            }
          }
        } catch (e) {
          continue;
        }
      }
      return null;
    }

    private static tryParentChain(step: GuideStep, searchRoots: SearchRoot[]): FindResult | null {
      const parentChain = step.element_info?.parentChain;
      if (!parentChain || parentChain.length === 0) return null;

      for (const { root, iframeOffset } of searchRoots) {
        try {
          // Build selector from parent chain
          let selector = '';
          for (let i = parentChain.length - 1; i >= 0; i--) {
            const parent = parentChain[i];
            if (parent.id) {
              selector += `#${this.cssEscape(parent.id)} `;
            } else if (parent.testId) {
              selector += `[data-testid="${this.cssEscape(parent.testId)}"] `;
            } else if (parent.role) {
              selector += `[role="${parent.role}"] `;
            } else {
              selector += `${parent.tag} `;
            }
          }

          // Add target element selector
          if (step.element_info?.tagName) {
            selector += step.element_info.tagName.toLowerCase();
          }

          const elements = root.querySelectorAll(selector.trim());
          for (const el of elements) {
            if (step.element_text && !this.textMatches(el, step.element_text, { fuzzy: true })) {
              continue;
            }
            if (this.isVisible(el as HTMLElement)) {
              return { element: el, confidence: 0.4, method: 'parentChain', iframeOffset };
            }
          }
        } catch (e) {
          continue;
        }
      }
      return null;
    }

    private static tryTitleHints(titleText: string, searchRoots: SearchRoot[]): FindResult | null {
      // Extract action words and target text from title
      const actionWords = ['click', 'select', 'choose', 'press', 'tap', 'enter', 'type', 'fill'];
      const words = titleText.toLowerCase().split(/\s+/);
      
      let targetText = '';
      let foundAction = false;
      
      for (let i = 0; i < words.length; i++) {
        if (actionWords.some(action => words[i].includes(action))) {
          foundAction = true;
          // Look for quoted text after action word
          const remaining = words.slice(i + 1).join(' ');
          const quotedMatch = remaining.match(/["']([^"']+)["']/);
          if (quotedMatch) {
            targetText = quotedMatch[1];
            break;
          }
        }
      }

      if (!targetText || !foundAction) return null;

      // Search for elements with matching text
      for (const { root, iframeOffset } of searchRoots) {
        try {
          const elements = root.querySelectorAll('button, a, [role="button"], [role="link"], input[type="submit"], [onclick]');
          for (const el of elements) {
            if (this.textMatches(el, targetText, { fuzzy: true }) && this.isVisible(el as HTMLElement)) {
              return { element: el, confidence: 0.3, method: 'titleHint', iframeOffset };
            }
          }
        } catch (e) {
          continue;
        }
      }
      return null;
    }

    private static textMatches(element: Element, targetText: string, opts: { fuzzy?: boolean } = {}): boolean {
      const elementText = this.getElementText(element);
      if (!elementText || !targetText) return false;

      const normalize = (text: string) => text.toLowerCase().trim().replace(/\s+/g, ' ');
      const normalizedElement = normalize(elementText);
      const normalizedTarget = normalize(targetText);

      if (normalizedElement.includes(normalizedTarget)) return true;
      if (opts.fuzzy) {
        // Simple fuzzy matching - check if most words match
        const elementWords = normalizedElement.split(' ');
        const targetWords = normalizedTarget.split(' ');
        const matches = targetWords.filter(word => 
          elementWords.some(elWord => elWord.includes(word) || word.includes(elWord))
        );
        return matches.length >= Math.ceil(targetWords.length * 0.6);
      }
      return false;
    }

    private static getElementText(element: Element): string {
      return (element as HTMLElement).innerText || 
             element.textContent || 
             (element as HTMLInputElement).placeholder || 
             element.getAttribute('aria-label') || 
             element.getAttribute('title') || 
             '';
    }

    private static isVisible(element: HTMLElement): boolean {
      if (!element.isConnected) return false;
      
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }

      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    private static getSearchRoots(): SearchRoot[] {
      const roots: SearchRoot[] = [{ root: document, iframeOffset: { x: 0, y: 0 }, depth: 0 }];

      // Add shadow roots
      document.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) {
          roots.push({ root: el.shadowRoot, iframeOffset: { x: 0, y: 0 }, depth: 1 });
        }
      });

      // Add same-origin iframes
      try {
        document.querySelectorAll('iframe').forEach(iframe => {
          try {
            if (iframe.contentDocument) {
              const rect = iframe.getBoundingClientRect();
              roots.push({ 
                root: iframe.contentDocument, 
                iframeOffset: { x: rect.left, y: rect.top }, 
                depth: 1 
              });
            }
          } catch (e) {
            // Cross-origin iframe, skip
          }
        });
      } catch (e) {
        // Iframe access denied
      }

      return roots;
    }

    // Action-aware validation
    static validateElementForAction(element: Element, actionType: string): boolean {
      const el = element as HTMLElement;
      
      switch (actionType?.toLowerCase()) {
        case 'click':
          return this.isClickable(el);
        case 'type':
        case 'input':
          return this.isInput(el);
        case 'select':
          return el.tagName.toLowerCase() === 'select' || el.getAttribute('role') === 'combobox';
        default:
          return true; // Unknown action type, assume valid
      }
    }

    private static isClickable(element: HTMLElement): boolean {
      const tag = element.tagName.toLowerCase();
      if (['button', 'a', 'input'].includes(tag)) return true;
      if (element.getAttribute('role') === 'button') return true;
      if (element.onclick || element.getAttribute('onclick')) return true;
      if (window.getComputedStyle(element).cursor === 'pointer') return true;
      return false;
    }

    private static isInput(element: HTMLElement): boolean {
      const tag = element.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
      if (element.contentEditable === 'true') return true;
      return false;
    }
  }

  // ═══ ELEMENT WATCHER ═══
  // Event-driven element monitoring (Usertour pattern)

  class ElementWatcher extends EventEmitter {
    private step: GuideStep;
    private retryCount = 0;
    private timeoutHandle: number | null = null;
    private validationHandle: number | null = null;
    private element: Element | null = null;
    private readonly RETRY_DELAY = 200; // 200ms between attempts
    private readonly MAX_TIMEOUT = 10000; // 10 seconds max
    private readonly id: string;

    constructor(step: GuideStep) {
      super();
      this.step = step;
      this.id = `watcher-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    start(): void {
      this.retryCount = 0;
      this.findElement();
    }

    stop(): void {
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }
      if (this.validationHandle) {
        clearTimeout(this.validationHandle);
        this.validationHandle = null;
      }
      this.removeAllListeners();
    }

    private findElement(): void {
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }

      // Check timeout
      if (this.retryCount * this.RETRY_DELAY > this.MAX_TIMEOUT) {
        this.emit('timeout');
        return;
      }

      const result = ElementFinder.findInCascade(this.step);
      if (result) {
        // Validate element for action type if specified
        if (this.step.action_type && !ElementFinder.validateElementForAction(result.element, this.step.action_type)) {
          // Element found but not suitable for the action, keep searching
          this.scheduleRetry();
          return;
        }

        this.element = result.element;
        this.emit('found', result.element, result.confidence, result.method);
        this.startValidationLoop();
      } else {
        this.scheduleRetry();
      }
    }

    private scheduleRetry(): void {
      this.retryCount++;
      this.timeoutHandle = setTimeout(() => this.findElement(), this.RETRY_DELAY);
    }

    private startValidationLoop(): void {
      if (!this.element) return;

      const validate = () => {
        if (!this.element || !this.isElementValid()) {
          // Element became invalid, restart search
          this.element = null;
          this.retryCount = 0; // Reset retry count for re-search
          this.findElement();
        } else {
          // Element still valid, check again in 1 second
          this.validationHandle = setTimeout(validate, 1000);
        }
      };

      this.validationHandle = setTimeout(validate, 1000);
    }

    private isElementValid(): boolean {
      if (!this.element) return false;
      
      // Check if element is still in DOM
      if (!this.element.isConnected) return false;
      
      // Check if element is still visible
      if (!ElementFinder['isVisible'](this.element as HTMLElement)) return false;
      
      // For actions, check if element is still suitable
      if (this.step.action_type && !ElementFinder.validateElementForAction(this.element, this.step.action_type)) {
        return false;
      }

      return true;
    }

    getCurrentElement(): Element | null {
      return this.element;
    }
  }

  // ═══ URL WATCHER ═══
  // Monitors URL changes for SPA detection and multi-page workflows

  class URLWatcher extends EventEmitter {
    private currentUrl: string;
    private pollHandle: number | null = null;
    private readonly POLL_INTERVAL = 500; // 500ms SPA polling

    constructor() {
      super();
      this.currentUrl = window.location.href;
    }

    start(): void {
      this.bindEvents();
      this.startPolling();
    }

    stop(): void {
      this.unbindEvents();
      this.stopPolling();
      this.removeAllListeners();
    }

    private bindEvents(): void {
      window.addEventListener('popstate', this.handleURLChange);
      window.addEventListener('hashchange', this.handleURLChange);
    }

    private unbindEvents(): void {
      window.removeEventListener('popstate', this.handleURLChange);
      window.removeEventListener('hashchange', this.handleURLChange);
    }

    private handleURLChange = (): void => {
      this.checkURL();
    };

    private startPolling(): void {
      this.pollHandle = setInterval(() => this.checkURL(), this.POLL_INTERVAL);
    }

    private stopPolling(): void {
      if (this.pollHandle) {
        clearInterval(this.pollHandle);
        this.pollHandle = null;
      }
    }

    private checkURL(): void {
      const newUrl = window.location.href;
      if (newUrl !== this.currentUrl) {
        const oldUrl = this.currentUrl;
        this.currentUrl = newUrl;
        this.emit('url_changed', oldUrl, newUrl);
      }
    }

    getCurrentUrl(): string {
      return this.currentUrl;
    }
  }

  // ═══ OVERLAY RENDERER ═══
  // Light Tango-style overlay with dashed border and hint pill

  class OverlayRenderer {
    private overlayElement: HTMLDivElement | null = null;
    private hintElement: HTMLDivElement | null = null;
    private currentElement: Element | null = null;
    private resizeObserver: ResizeObserver | null = null;

    show(element: Element, step: GuideStep, confidence: number): void {
      this.hide(); // Clean up previous overlay
      this.currentElement = element;
      this.createOverlay(element, step, confidence);
      this.createHint(element, step, confidence);
      this.observeElement(element);
    }

    hide(): void {
      if (this.overlayElement) {
        this.overlayElement.remove();
        this.overlayElement = null;
      }
      if (this.hintElement) {
        this.hintElement.remove();
        this.hintElement = null;
      }
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      this.currentElement = null;
    }

    private createOverlay(element: Element, step: GuideStep, confidence: number): void {
      const rect = element.getBoundingClientRect();
      
      this.overlayElement = document.createElement('div');
      this.overlayElement.setAttribute('data-stept-guide', 'overlay');
      
      // Light dashed border style (Tango pattern)
      const borderColor = confidence > 0.8 ? '#2563eb' : confidence > 0.5 ? '#f59e0b' : '#ef4444';
      
      Object.assign(this.overlayElement.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        border: `2px dashed ${borderColor}`,
        backgroundColor: 'transparent',
        pointerEvents: 'none',
        zIndex: '999999',
        borderRadius: '4px',
        boxSizing: 'border-box',
        transition: 'all 0.2s ease-in-out'
      });

      // Shadow DOM isolation
      const shadowRoot = this.overlayElement.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = `
        :host {
          all: initial;
          contain: layout style paint;
        }
      `;
      shadowRoot.appendChild(style);
      
      document.body.appendChild(this.overlayElement);
    }

    private createHint(element: Element, step: GuideStep, confidence: number): void {
      const rect = element.getBoundingClientRect();
      
      this.hintElement = document.createElement('div');
      this.hintElement.setAttribute('data-stept-guide', 'hint');
      
      // Hint pill content
      const hintText = step.title || 'Next step';
      const confidenceIcon = confidence > 0.8 ? '●' : confidence > 0.5 ? '◐' : '○';
      
      Object.assign(this.hintElement.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top - 35}px`, // Above element
        backgroundColor: '#1f2937',
        color: '#ffffff',
        padding: '6px 12px',
        borderRadius: '16px',
        fontSize: '12px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        pointerEvents: 'none',
        zIndex: '1000000',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        maxWidth: '200px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        transition: 'all 0.2s ease-in-out'
      });
      
      this.hintElement.textContent = `${confidenceIcon} ${hintText}`;
      
      // Adjust position if hint goes off-screen
      const hintRect = this.hintElement.getBoundingClientRect();
      if (rect.top - 35 < 0) {
        // Show below if no room above
        this.hintElement.style.top = `${rect.bottom + 5}px`;
      }
      if (rect.left + hintRect.width > window.innerWidth) {
        // Adjust horizontal position
        this.hintElement.style.left = `${window.innerWidth - hintRect.width - 10}px`;
      }
      
      // Shadow DOM isolation
      const shadowRoot = this.hintElement.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = `
        :host {
          all: initial;
          contain: layout style paint;
        }
      `;
      shadowRoot.appendChild(style);
      
      document.body.appendChild(this.hintElement);
    }

    private observeElement(element: Element): void {
      // Update overlay position when element moves/resizes
      this.resizeObserver = new ResizeObserver(() => {
        if (this.currentElement && this.overlayElement && this.hintElement) {
          const rect = this.currentElement.getBoundingClientRect();
          
          // Update overlay
          Object.assign(this.overlayElement.style, {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`
          });
          
          // Update hint
          Object.assign(this.hintElement.style, {
            left: `${rect.left}px`,
            top: `${rect.top - 35}px`
          });
        }
      });
      
      this.resizeObserver.observe(element);
      this.resizeObserver.observe(document.body); // For viewport changes
    }

    updateConfidence(confidence: number): void {
      if (this.overlayElement) {
        const borderColor = confidence > 0.8 ? '#2563eb' : confidence > 0.5 ? '#f59e0b' : '#ef4444';
        this.overlayElement.style.borderColor = borderColor;
      }
      if (this.hintElement) {
        const confidenceIcon = confidence > 0.8 ? '●' : confidence > 0.5 ? '◐' : '○';
        const text = this.hintElement.textContent || '';
        this.hintElement.textContent = text.replace(/^[●◐○]\s/, `${confidenceIcon} `);
      }
    }
  }

  // ═══ GUIDE RUNNER ═══
  // State machine for guide execution

  class GuideRunner extends EventEmitter {
    private state: GuideState = { type: 'idle' };
    private guide: Guide | null = null;
    private currentStepIndex = 0;
    private elementWatcher: ElementWatcher | null = null;
    private urlWatcher: URLWatcher | null = null;
    private overlayRenderer: OverlayRenderer;
    private searchProgressTimer: number | null = null;

    constructor() {
      super();
      this.overlayRenderer = new OverlayRenderer();
    }

    // Public API
    startGuide(guide: Guide, startIndex: number = 0): void {
      this.stopGuide();
      this.guide = guide;
      this.currentStepIndex = startIndex;
      this.setState({ type: 'idle' });
      
      this.setupURLWatcher();
      this.executeStep(this.currentStepIndex);
      
      this.sendMessage('GUIDE_STEP_CHANGED', {
        stepIndex: this.currentStepIndex,
        totalSteps: guide.steps?.length || 0,
        step: this.getCurrentStep()
      });
    }

    stopGuide(): void {
      this.cleanup();
      this.setState({ type: 'stopped' });
      this.sendMessage('GUIDE_STOPPED', {});
    }

    skipStep(): void {
      this.advanceToNextStep();
    }

    markComplete(): void {
      this.emit('action_completed');
    }

    getCurrentState(): GuideState {
      return this.state;
    }

    getCurrentStep(): GuideStep | null {
      if (!this.guide?.steps || this.currentStepIndex >= this.guide.steps.length) {
        return null;
      }
      return this.guide.steps[this.currentStepIndex];
    }

    destroy(): void {
      this.cleanup();
      this.removeAllListeners();
    }

    // Private methods
    private setState(newState: GuideState): void {
      this.state = newState;
      this.emit('state_changed', newState);
    }

    private setupURLWatcher(): void {
      if (!this.urlWatcher) {
        this.urlWatcher = new URLWatcher();
        this.urlWatcher.on('url_changed', this.handleURLChange.bind(this));
        this.urlWatcher.start();
      }
    }

    private handleURLChange(oldUrl: string, newUrl: string): void {
      const currentStep = this.getCurrentStep();
      if (!currentStep) return;

      // Check if URL change is expected for current step
      if (this.urlMatches(newUrl, currentStep.expected_url)) {
        return; // Expected URL change, continue
      }

      // Check if URL matches a future step (user jumped ahead)
      if (this.guide?.steps) {
        for (let i = this.currentStepIndex + 1; i < this.guide.steps.length; i++) {
          const step = this.guide.steps[i];
          if (this.urlMatches(newUrl, step.expected_url)) {
            // User jumped ahead, skip to that step
            this.currentStepIndex = i;
            this.executeStep(this.currentStepIndex);
            return;
          }
        }
      }

      // Unexpected URL change - try to continue with current step
      if (this.state.type === 'searching' || this.state.type === 'found') {
        // Restart element search on new page
        this.executeStep(this.currentStepIndex);
      }
    }

    private urlMatches(currentUrl: string, expectedUrl?: string): boolean {
      if (!expectedUrl) return true;
      
      try {
        const current = new URL(currentUrl);
        const expected = new URL(expectedUrl);
        
        // Compare pathname and optionally search params
        return current.pathname === expected.pathname &&
               (!expected.search || current.search === expected.search);
      } catch (e) {
        // Fallback to simple string matching
        return currentUrl.includes(expectedUrl);
      }
    }

    private executeStep(stepIndex: number): void {
      const step = this.getCurrentStep();
      if (!step) {
        this.setState({ type: 'completed' });
        this.sendMessage('GUIDE_STEP_CHANGED', { completed: true });
        return;
      }

      this.cleanupCurrentStep();
      this.setState({ type: 'searching', step, retryCount: 0 });
      
      // Progressive search timing
      this.startProgressiveSearch(step);
      
      this.sendMessage('GUIDE_STEP_CHANGED', {
        stepIndex: this.currentStepIndex,
        totalSteps: this.guide?.steps?.length || 0,
        step
      });
    }

    private startProgressiveSearch(step: GuideStep): void {
      this.elementWatcher = new ElementWatcher(step);
      
      this.elementWatcher.on('found', (element: Element, confidence: number, method: string) => {
        this.handleElementFound(element, confidence, method);
      });
      
      this.elementWatcher.on('timeout', () => {
        this.handleElementTimeout();
      });
      
      // Start progressive search indicators
      this.scheduleSearchProgress();
      
      this.elementWatcher.start();
    }

    private scheduleSearchProgress(): void {
      // Show "searching..." indicator after 1 second
      this.searchProgressTimer = setTimeout(() => {
        if (this.state.type === 'searching') {
          this.sendMessage('GUIDE_STEP_HEALTH', {
            status: 'searching',
            message: 'Looking for element...',
            showScreenshot: false
          });
        }
      }, 1000);

      // Show screenshot fallback after 2 seconds
      setTimeout(() => {
        if (this.state.type === 'searching') {
          this.sendMessage('GUIDE_STEP_HEALTH', {
            status: 'not_found',
            message: 'Element not found. See screenshot for reference.',
            showScreenshot: true
          });
        }
      }, 2000);
    }

    private handleElementFound(element: Element, confidence: number, method: string): void {
      if (this.searchProgressTimer) {
        clearTimeout(this.searchProgressTimer);
        this.searchProgressTimer = null;
      }

      this.setState({ type: 'found', step: this.getCurrentStep()!, element, confidence });
      this.overlayRenderer.show(element, this.getCurrentStep()!, confidence);
      
      // Set up action completion detection
      this.setupActionDetection(element);
      
      this.sendMessage('GUIDE_STEP_HEALTH', {
        status: 'found',
        method,
        confidence,
        message: `Found via ${method} (${Math.round(confidence * 100)}% confidence)`
      });
    }

    private handleElementTimeout(): void {
      if (this.searchProgressTimer) {
        clearTimeout(this.searchProgressTimer);
        this.searchProgressTimer = null;
      }

      this.setState({ type: 'notfound', step: this.getCurrentStep()!, timeoutReached: true });
      
      this.sendMessage('GUIDE_STEP_HEALTH', {
        status: 'timeout',
        message: 'Could not find element after 10 seconds',
        showScreenshot: true,
        allowMarkComplete: true
      });
    }

    private setupActionDetection(element: Element): void {
      const step = this.getCurrentStep();
      if (!step) return;

      const actionType = step.action_type?.toLowerCase();
      
      if (actionType === 'click') {
        // Listen for click on the element
        const clickHandler = (e: Event) => {
          if (e.target === element) {
            element.removeEventListener('click', clickHandler);
            setTimeout(() => this.handleActionCompleted(), 100);
          }
        };
        element.addEventListener('click', clickHandler);
      } else if (actionType === 'type' || actionType === 'input') {
        // Listen for input events
        const inputHandler = (e: Event) => {
          if (e.target === element) {
            element.removeEventListener('input', inputHandler);
            setTimeout(() => this.handleActionCompleted(), 500);
          }
        };
        element.addEventListener('input', inputHandler);
      } else {
        // For unknown action types, listen for any interaction
        const interactionHandler = (e: Event) => {
          if (e.target === element) {
            element.removeEventListener('click', interactionHandler);
            setTimeout(() => this.handleActionCompleted(), 100);
          }
        };
        element.addEventListener('click', interactionHandler);
      }

      // Also listen for DOM mutations that might indicate completion
      const observer = new MutationObserver(() => {
        // Simple heuristic: if URL changes or new elements appear, action might be complete
        setTimeout(() => this.handleActionCompleted(), 1000);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      
      // Store observer for cleanup
      (element as any).__steptObserver = observer;
    }

    private handleActionCompleted(): void {
      this.advanceToNextStep();
    }

    private advanceToNextStep(): void {
      this.cleanupCurrentStep();
      this.currentStepIndex++;
      
      if (this.currentStepIndex < (this.guide?.steps?.length || 0)) {
        this.executeStep(this.currentStepIndex);
      } else {
        this.setState({ type: 'completed' });
        this.sendMessage('GUIDE_STEP_CHANGED', { completed: true });
      }
    }

    private cleanupCurrentStep(): void {
      if (this.elementWatcher) {
        this.elementWatcher.stop();
        this.elementWatcher = null;
      }
      
      if (this.searchProgressTimer) {
        clearTimeout(this.searchProgressTimer);
        this.searchProgressTimer = null;
      }
      
      this.overlayRenderer.hide();
      
      // Clean up any mutation observers
      document.querySelectorAll('*').forEach(el => {
        if ((el as any).__steptObserver) {
          (el as any).__steptObserver.disconnect();
          delete (el as any).__steptObserver;
        }
      });
    }

    private cleanup(): void {
      this.cleanupCurrentStep();
      
      if (this.urlWatcher) {
        this.urlWatcher.stop();
        this.urlWatcher = null;
      }
      
      this.overlayRenderer.hide();
    }

    private sendMessage(type: string, data: any): void {
      try {
        chrome.runtime.sendMessage({ type, data });
      } catch (e) {
        console.warn('Failed to send message to sidepanel:', e);
      }
    }
  }

  // ═══ MESSAGE HANDLER ═══
  // Chrome extension messaging

  class MessageHandler {
    private guideRunner: GuideRunner;

    constructor(guideRunner: GuideRunner) {
      this.guideRunner = guideRunner;
      this.bindMessages();
    }

    private bindMessages(): void {
      chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    }

    private handleMessage(
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ): boolean {
      try {
        switch (message.type) {
          case 'START_GUIDE':
            this.handleStartGuide(message.data, sendResponse);
            return true;

          case 'STOP_GUIDE':
            this.handleStopGuide(sendResponse);
            return true;

          case 'GUIDE_GOTO':
            this.handleGotoStep(message.data, sendResponse);
            return true;

          case 'SKIP_STEP':
            this.handleSkipStep(sendResponse);
            return true;

          case 'MARK_COMPLETE':
            this.handleMarkComplete(sendResponse);
            return true;

          case 'GET_STATUS':
            this.handleGetStatus(sendResponse);
            return true;

          default:
            return false;
        }
      } catch (error) {
        console.error('Message handler error:', error);
        sendResponse({ error: error.message });
        return true;
      }
    }

    private handleStartGuide(data: { guide: Guide; startIndex?: number }, sendResponse: (response?: any) => void): void {
      if (!data.guide || !data.guide.steps || data.guide.steps.length === 0) {
        sendResponse({ error: 'Invalid guide data' });
        return;
      }

      this.guideRunner.startGuide(data.guide, data.startIndex || 0);
      sendResponse({ success: true });
    }

    private handleStopGuide(sendResponse: (response?: any) => void): void {
      this.guideRunner.stopGuide();
      sendResponse({ success: true });
    }

    private handleGotoStep(data: { stepIndex: number }, sendResponse: (response?: any) => void): void {
      // Restart guide at specific step
      const currentGuide = (this.guideRunner as any).guide;
      if (currentGuide) {
        this.guideRunner.startGuide(currentGuide, data.stepIndex);
        sendResponse({ success: true });
      } else {
        sendResponse({ error: 'No active guide' });
      }
    }

    private handleSkipStep(sendResponse: (response?: any) => void): void {
      this.guideRunner.skipStep();
      sendResponse({ success: true });
    }

    private handleMarkComplete(sendResponse: (response?: any) => void): void {
      this.guideRunner.markComplete();
      sendResponse({ success: true });
    }

    private handleGetStatus(sendResponse: (response?: any) => void): void {
      const state = this.guideRunner.getCurrentState();
      const currentStep = this.guideRunner.getCurrentStep();
      sendResponse({
        state,
        currentStep,
        stepIndex: (this.guideRunner as any).currentStepIndex,
        totalSteps: ((this.guideRunner as any).guide?.steps?.length) || 0
      });
    }
  }

  // ═══ INITIALIZATION ═══

  if (!_window.__steptGuideLoaded) {
    _window.__steptGuideLoaded = true;
    
    const guideRunner = new GuideRunner();
    const messageHandler = new MessageHandler(guideRunner);
    
    _window.__steptGuideRunner = guideRunner;
    _window.__steptGuideRuntime = GuideRunner;
    
    console.log('Stept Guide Runtime initialized (v2.0 - hybrid architecture)');
  }

})();