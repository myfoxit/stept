// Guide Runtime — injected on demand into pages.
// MUST remain a single self-contained IIFE.
// NO imports, NO React, NO module splitting.

(function () {
  'use strict';

  // ── Inline Type Declarations ──────────────────────────────────────

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
        _window.__steptGuideRunner._replacing = true;
        _window.__steptGuideRunner.stop();
      } catch {}
    }
  };
  // Fire event to kill previous instance
  document.dispatchEvent(new CustomEvent(DEDUP_EVENT));
  // Listen for future instances
  document.addEventListener(DEDUP_EVENT, cleanup);
  _window.__steptGuideLoaded = true;

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

  // ── Element Finder ────────────────────────────────────────────────

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
      // e.g., step says "Submit Order" but element just says "Submit"
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

  /**
   * Find element by SelectorTree structure (Layer 1 - Deterministic).
   * Based on Usertour's finderX algorithm with parent chain verification.
   */
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
      return { element: [...votes.keys()][0], confidence: 1.0, method: 'selector-unanimous' };
    }

    // 3. Multiple candidates → disambiguate by parent chain
    if (votes.size > 1) {
      const best = disambiguateByParentChain([...votes.keys()], tree);
      if (best) return { element: best, confidence: 0.9, method: 'parent-chain' };
    }

    // 4. No candidates from tree → try content matching
    if (content) {
      const contentMatch = findByContent(content);
      if (contentMatch) return { element: contentMatch, confidence: 0.6, method: 'content-match' };
    }

    return { element: null, confidence: 0, method: 'not-found' };
  }

  /**
   * Disambiguate multiple candidates using parent chain verification.
   */
  function disambiguateByParentChain(candidates: Element[], tree: any): Element | null {
    let bestEl: Element | null = null;
    let bestScore = -1;

    for (const candidate of candidates) {
      let score = 0;
      let parentNode = tree.parent;
      let parentEl = candidate.parentElement;

      // Walk up the tree comparing parents
      while (parentNode && parentEl) {
        const parentMatches = parentNode.selectors.some((sel: string) => {
          try { 
            return parentEl === document.querySelector(sel); 
          } catch { 
            return false; 
          }
        });
        if (parentMatches) score++;

        // Also check siblings for bonus points
        if (parentNode.prevSiblingSelectors?.length) {
          const prevMatch = parentNode.prevSiblingSelectors.some((sel: string) => {
            try { 
              return parentEl!.previousElementSibling === document.querySelector(sel); 
            } catch { 
              return false; 
            }
          });
          if (prevMatch) score += 0.5;
        }

        parentNode = parentNode.parent;
        parentEl = parentEl.parentElement;
      }

      if (score > bestScore) {
        bestScore = score;
        bestEl = candidate;
      }
    }

    return bestEl;
  }

  /**
   * Find element by content/text matching.
   */
  function findByContent(content: string): Element | null {
    if (!content) return null;
    
    // Search all visible elements for matching text
    const allInteractive = document.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [tabindex]'
    );
    
    return findByText(Array.from(allInteractive), content, { fuzzy: true });
  }

  // Search a single root for the step's element using the NEW three-layer approach
  function findInRoot(root: Document | ShadowRoot, step: GuideStep): FindResult | null {
    // Layer 1: Try new SelectorTree structure first
    if ((step as any).element_info?.selectorTree) {
      const treeResult = findElementByTree((step as any).element_info.selectorTree, (step as any).element_info?.content);
      if (treeResult.element) {
        return { element: treeResult.element, confidence: treeResult.confidence, method: treeResult.method };
      }
    }

    // Fallback to existing strategies for backward compatibility

    // CSS selector
    if (step.selector) {
      const el = safeQuerySelector(root, step.selector);
      if (el && isVisible(el)) return { element: el, confidence: 1.0, method: "selector" };
    }

    // data-testid
    const testId = step.element_info?.testId;
    if (testId) {
      for (const attr of ["data-testid", "data-test", "data-cy"]) {
        try {
          const el = root.querySelector(`[${attr}="${CSS.escape(testId)}"]`);
          if (el && isVisible(el)) return { element: el, confidence: 0.95, method: "testid" };
        } catch {}
      }
    }

    // ARIA role + text
    if (step.element_role && step.element_text) {
      const candidates = root.querySelectorAll(`[role="${step.element_role}"]`);
      const match = findByText(Array.from(candidates), step.element_text);
      if (match) return { element: match, confidence: 0.85, method: "role+text" };
    }

    // Tag + text (fuzzy)
    if (step.element_info?.tagName && step.element_text) {
      const candidates = root.querySelectorAll(step.element_info.tagName);
      const match = findByText(Array.from(candidates), step.element_text, { fuzzy: true });
      if (match) return { element: match, confidence: 0.7, method: "tag+text" };
    }

    // XPath (only works on Document nodes, not ShadowRoot)
    if (step.xpath && root.nodeType === Node.DOCUMENT_NODE) {
      try {
        const result = (root as Document).evaluate(step.xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const el = result.singleNodeValue as Element | null;
        if (el && isVisible(el)) return { element: el, confidence: 0.6, method: "xpath" };
      } catch {}
    }

    // Parent chain context
    if (step.element_info?.parentChain?.length) {
      const chain = step.element_info.parentChain;
      for (const ancestor of chain) {
        let container: Element | null = null;
        if (ancestor.id) {
          container = (root as Document).getElementById ? (root as Document).getElementById(ancestor.id) : root.querySelector(`#${CSS.escape(ancestor.id)}`);
        } else if (ancestor.testId) {
          container = safeQuerySelector(root, `[data-testid="${CSS.escape(ancestor.testId)}"]`);
        } else if (ancestor.role) {
          const candidates = root.querySelectorAll(`[role="${ancestor.role}"]`);
          if (candidates.length === 1) container = candidates[0];
        }
        if (!container) continue;
        if (step.element_info?.tagName && step.element_text) {
          const els = container.querySelectorAll(step.element_info.tagName);
          const match = findByText(Array.from(els), step.element_text, { fuzzy: true });
          if (match) return { element: match, confidence: 0.5, method: "parent-context" };
        }
      }
    }

    // Level 7: Last resort — text search using step title/description as hint
    // This catches cases where the recording only captured a CSS selector (now broken)
    // but the step title describes the element (e.g., "Click the Submit button")
    if (step.title || step.description) {
      const hint = (step.title || step.description || '').toLowerCase();
      // Extract likely element text from the hint
      const textPatterns = [
        /click (?:the |on )?["']?([^"']+?)["']?\s*(?:button|link|tab|menu|option)?$/i,
        /type (?:in |into )?["']?([^"']+?)["']?/i,
        /select ["']?([^"']+?)["']?/i,
        /["']([^"']+?)["']/,  // Anything in quotes
      ];
      for (const pattern of textPatterns) {
        const match = hint.match(pattern);
        if (match && match[1]) {
          const searchText = match[1].trim();
          if (searchText.length >= 2) {
            const allInteractive = root.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick]');
            const candidate = findByText(Array.from(allInteractive), searchText, { fuzzy: true });
            if (candidate) return { element: candidate, confidence: 0.35, method: "title-hint" };
          }
        }
      }
    }

    return null;
  }

  // ── Cross-origin iframe child frame mode (Feature 4) ──────────────
  if (window !== window.top) {
    // Running inside a child frame — only listen for element search requests
    chrome.runtime.onMessage.addListener((message: { type: string; step: GuideStep }, _sender: MessageSender, sendResponse: SendResponse) => {
      if (message.type === 'GUIDE_FIND_IN_FRAME') {
        const result = findInRoot(document, message.step);
        if (result) {
          const rect = result.element.getBoundingClientRect();
          let frameRect: DOMRect | null = null;
          try { frameRect = (self as Window & { frameElement: Element | null }).frameElement?.getBoundingClientRect() ?? null; } catch {}
          sendResponse({
            found: true,
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            frameRect: frameRect ? { left: frameRect.left, top: frameRect.top, width: frameRect.width, height: frameRect.height } : null,
            confidence: result.confidence,
            method: result.method,
          });
        } else {
          sendResponse({ found: false });
        }
      }
      return false;
    });
    return; // Do NOT create overlay or register START_GUIDE in child frames
  }

  // Main finder: searches document + all shadow roots + all same-origin iframes
  async function findGuideElement(step: GuideStep): Promise<FindResult | null> {
    const searchRoots = collectSearchRoots();

    let bestResult: FindResult | null = null;

    for (const { root, iframeOffset } of searchRoots) {
      const result = findInRoot(root, step);
      if (result) {
        result.iframeOffset = iframeOffset;
        // Return immediately on high-confidence match
        if (result.confidence >= 0.85) return result;
        // Keep the best
        if (!bestResult || result.confidence > bestResult.confidence) {
          bestResult = result;
        }
      }
    }

    // Feature 4: If no high-confidence local result, try cross-origin frames via background
    if (!bestResult || bestResult.confidence < 0.85) {
      try {
        const [activeTab] = await new Promise<chrome.tabs.Tab[]>(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
        if (activeTab?.id) {
          const resp = await chrome.runtime.sendMessage({
            type: 'GUIDE_FIND_IN_FRAMES',
            step,
            tabId: activeTab.id,
          }) as FrameFindResponse | undefined;
          if (resp && resp.found && (!bestResult || (resp.confidence || 0) > bestResult.confidence)) {
            // Cross-origin match — we can't get the element directly, but return info
            // for now, prefer local results if any exist
            // (Cross-origin elements can't be directly manipulated from top frame)
          }
        }
      } catch {} // ignore errors from cross-origin search
    }

    return bestResult;
  }

  // ── Obstructed Element Detection (Feature 3) ─────────────────────

  function isObstructed(el: Element): Element | null {
    if (!el || !el.getBoundingClientRect) return null;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(centerX, centerY);
    if (!topEl) return null;
    if (topEl === el || el.contains(topEl)) return null;
    // Check if it's part of our overlay
    let node: Element | null = topEl;
    while (node) {
      if (node.tagName && node.tagName.toLowerCase() === 'stept-guide-overlay') return null;
      node = node.parentElement;
    }
    return topEl;
  }

  // ── Intermediate Action Detection (Feature 8) ───────────────────

  function needsIntermediateAction(el: Element): HTMLElement | null {
    let node: HTMLElement | null = (el as HTMLElement).parentElement;
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      if (style.display === 'none') return node;
      if (style.visibility === 'hidden') return node;
      if (node.getAttribute('aria-expanded') === 'false') return node;
      if (node.tagName === 'DETAILS' && !node.hasAttribute('open')) return node;
      node = node.parentElement;
    }
    return null;
  }

  function describeElement(el: Element): string {
    const tag = el.tagName?.toLowerCase() || 'element';
    const text = (el.textContent || '').trim().slice(0, 40);
    const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    if (label) return `${tag} "${label}"`;
    if (text) return `${tag} "${text}"`;
    return tag;
  }

  // ── Overlay Renderer ──────────────────────────────────────────────

  const STYLES = `
    :host {
      all: initial;
      font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      color: #1A1A1A;
    }

    .guide-highlight {
      position: fixed;
      z-index: 2147483641;
      border: 2px solid #FF6B52;
      border-radius: 6px;
      box-shadow: 0 0 0 4px rgba(255, 107, 82, 0.15);
      pointer-events: none;
      transition: all 0.3s ease;
    }

    .guide-tooltip {
      position: fixed;
      z-index: 2147483642;
      background: #FFFFFF;
      border: 1px solid #E5E5E5;
      border-radius: 14px;
      padding: 16px;
      max-width: 300px;
      min-width: 240px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08);
      pointer-events: auto;
      animation: guide-tooltip-in 0.25s ease-out;
      color: #1A1A1A;
    }

    @keyframes guide-tooltip-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .guide-tooltip-title {
      font-size: 15px;
      font-weight: 600;
      color: #1A1A1A;
      margin: 0 0 6px 0;
      line-height: 1.3;
    }

    .guide-tooltip-desc {
      font-size: 13px;
      color: #666666;
      margin: 0 0 14px 0;
      line-height: 1.5;
    }

    .guide-tooltip-progress {
      font-size: 11px;
      color: #999999;
      margin-bottom: 12px;
    }

    .guide-tooltip-progress-bar {
      height: 3px;
      background: #F0F0F0;
      border-radius: 2px;
      margin-top: 6px;
      overflow: hidden;
    }

    .guide-tooltip-progress-fill {
      height: 100%;
      background: #FF6B52;
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .guide-tooltip-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .guide-btn {
      border: none;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.15s ease;
      outline: none;
    }

    .guide-btn:hover { filter: brightness(1.1); }
    .guide-btn:active { transform: scale(0.97); }

    .guide-btn-primary {
      background: #FF6B52;
      color: #fff;
    }

    .guide-btn-secondary {
      background: #F5F5F5;
      color: #333;
      border: 1px solid #E0E0E0;
    }

    .guide-btn-ghost {
      background: transparent;
      color: #999;
      padding: 8px 8px;
    }

    .guide-btn-ghost:hover { color: #666; }

    .guide-spacer { flex: 1; }

    .guide-close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      color: #CCCCCC;
      cursor: pointer;
      padding: 4px;
      line-height: 1;
      font-size: 18px;
      border-radius: 4px;
    }

    .guide-close-btn:hover { color: #666; background: #F5F5F5; }

    .guide-btn-done {
      background: #10B981;
      color: #fff;
    }

    .guide-obstruction-warning {
      background: #FFFBEB;
      border: 1px solid #FDE68A;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #92400E;
      line-height: 1.4;
    }

    .guide-intermediate-hint {
      background: #EEF2FF;
      border: 1px solid #C7D2FE;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #4338CA;
      line-height: 1.4;
    }

    .guide-url-warning {
      background: #FFFBEB;
      border: 1px solid #FDE68A;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #92400E;
      line-height: 1.4;
    }

    .guide-navigate-btn {
      display: inline-block;
      margin-top: 8px;
      padding: 6px 12px;
      background: #FEF3C7;
      color: #92400E;
      border: 1px solid #FDE68A;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s ease;
    }

    .guide-navigate-btn:hover {
      background: #FDE68A;
    }

    .guide-not-found {
      background: #FFFFFF;
      border: 1px solid #E5E5E5;
      border-radius: 14px;
      padding: 20px;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2147483642;
      text-align: center;
      max-width: 300px;
      pointer-events: auto;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08);
      animation: guide-tooltip-in 0.25s ease-out;
    }

    .guide-not-found-title {
      font-size: 15px;
      font-weight: 600;
      color: #1A1A1A;
      margin-bottom: 8px;
    }

    .guide-not-found-desc {
      font-size: 13px;
      color: #666666;
      margin-bottom: 14px;
    }

    .guide-roadblock-icon {
      font-size: 24px;
      margin-bottom: 8px;
    }

    .guide-roadblock-step-title {
      font-size: 13px;
      font-weight: 500;
      color: #333;
      margin-bottom: 10px;
      padding: 8px 12px;
      background: #F5F5F5;
      border-radius: 6px;
    }
  `;

  // ── URL Watcher for Multi-Page Handling ─────────────────────────

  class URLWatcher {
    private _interval: ReturnType<typeof setInterval> | null = null;
    private _lastUrl: string;
    private _onUrlChange: (newUrl: string, oldUrl: string) => void;

    constructor(onUrlChange: (newUrl: string, oldUrl: string) => void) {
      this._lastUrl = window.location.href;
      this._onUrlChange = onUrlChange;
    }

    start(): void {
      this.stop(); // Ensure no duplicate intervals
      
      // Listen for browser navigation events
      window.addEventListener('popstate', this._handleUrlChange);
      window.addEventListener('hashchange', this._handleUrlChange);
      
      // Poll for URL changes (for SPA navigation that doesn't trigger events)
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
      // Small delay to ensure the page has processed the navigation
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
    positionInterval: ReturnType<typeof setInterval> | null;
    currentResult: FindResult | null;
    _clickHandler: ((e: Event) => void) | null;
    _stepSeq: number;
    // Persistent overlay elements for in-place updates
    _highlight: HTMLDivElement | null;
    _tooltip: HTMLDivElement | null;
    _notFoundPanel: HTMLDivElement | null;
    _intermediatePanel: HTMLDivElement | null;
    // Internal state
    _replacing: boolean;
    _pollInterval: ReturnType<typeof setInterval> | null;
    _inertObserver: MutationObserver | null;
    _zoomObserver: MutationObserver | null;
    _clickElement: Element | null;
    _clickEventType: string | null;
    _parentClickHandler: ((e: Event) => void) | null;
    _clickParent: Element | null;
    _keyHandler: ((e: KeyboardEvent) => void) | null;
    _completionObserver: MutationObserver | null;
    _completionCleanup: (() => void) | null;
    _completionTimeout: ReturnType<typeof setTimeout> | null;
    // Position tracking via rAF
    _positionFrame: number | null;
    // Multi-page handling
    _urlWatcher: URLWatcher | null;
    _lastKnownUrl: string;

    constructor(guide: Guide) {
      this.guide = guide;
      this.steps = guide.steps || [];
      this.currentIndex = 0;
      this.host = null;
      this.shadow = null;
      this.positionInterval = null;
      this.currentResult = null;
      this._clickHandler = null;
      this._stepSeq = 0; // concurrency guard: increments on each showStep call
      // Persistent overlay elements for in-place updates
      this._highlight = null;
      this._tooltip = null;
      this._notFoundPanel = null;
      this._intermediatePanel = null;
      // Internal state
      this._replacing = false;
      this._pollInterval = null;
      this._inertObserver = null;
      this._zoomObserver = null;
      this._clickElement = null;
      this._clickEventType = null;
      this._parentClickHandler = null;
      this._clickParent = null;
      this._keyHandler = null;
      this._completionObserver = null;
      this._completionCleanup = null;
      this._completionTimeout = null;
      // Position tracking via rAF
      this._positionFrame = null;
      // Multi-page handling
      this._urlWatcher = null;
      this._lastKnownUrl = window.location.href;
    }

    async start(startIndex: number = 0): Promise<void> {
      this._createHost();
      
      // Start URL watching for multi-page handling
      this._urlWatcher = new URLWatcher((newUrl: string, oldUrl: string) => {
        this._handleUrlChange(newUrl, oldUrl);
      });
      this._urlWatcher.start();
      
      if (this.steps.length === 0) {
        this._showEmpty();
        return;
      }
      await this.showStep(startIndex);
    }

    stop(): void {
      this._stopElementPolling();
      this._clearPositionTracking();
      this._removeClickHandler();
      this._disconnectCompletionObserver();
      if (this._inertObserver) {
        this._inertObserver.disconnect();
        this._inertObserver = null;
      }
      if (this._zoomObserver) {
        this._zoomObserver.disconnect();
        this._zoomObserver = null;
      }
      if (this._positionFrame) {
        cancelAnimationFrame(this._positionFrame);
        this._positionFrame = null;
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
      this._notFoundPanel = null;
      activeRunner = null;
      // Only notify background if this is a user-initiated stop (not a replacement)
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

      // Protect overlay from being made inert by the page (modals/dialogs
      // often set inert on everything outside themselves).
      this._inertObserver = new MutationObserver(() => {
        if (this.host && this.host.hasAttribute("inert")) {
          this.host.removeAttribute("inert");
        }
      });
      this._inertObserver.observe(this.host, { attributes: true, attributeFilter: ["inert"] });

      // Zoom compensation: counteract page zoom so our overlay stays pixel-perfect.
      const updateZoom = (): void => {
        if (!this.host || this.host.parentElement !== document.documentElement) return;
        const bodyZoom = parseFloat((getComputedStyle(document.body) as CSSStyleDeclaration & { zoom?: string }).zoom || '1') || 1;
        const htmlZoom = parseFloat((getComputedStyle(document.documentElement) as CSSStyleDeclaration & { zoom?: string }).zoom || '1') || 1;
        const totalZoom = bodyZoom * htmlZoom;
        this.host.style.zoom = totalZoom === 1 ? "" : String(1 / totalZoom);
      };
      updateZoom();
      this._zoomObserver = new MutationObserver(updateZoom);
      this._zoomObserver.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
      this._zoomObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    }

    _clearOverlay(): void {
      this._stopElementPolling();
      this._clearPositionTracking();
      this._removeClickHandler();
      this._disconnectCompletionObserver();
      // Remove all overlay elements to prevent artifacts across navigations
      if (this._highlight) { this._highlight.remove(); this._highlight = null; }
      if (this._tooltip) { this._tooltip.remove(); this._tooltip = null; }
      if (this._notFoundPanel) { this._notFoundPanel.remove(); this._notFoundPanel = null; }
      if (this._intermediatePanel) { this._intermediatePanel.remove(); this._intermediatePanel = null; }
    }

    _stopElementPolling(): void {
      if (this._pollInterval) {
        clearInterval(this._pollInterval);
        this._pollInterval = null;
      }
    }

    _startElementPolling(step: GuideStep, seq: number, urlMismatch: boolean): void {
      this._stopElementPolling();
      let tickCount = 0;
      const POLL_MS = 150;       // Slightly slower polling to reduce CPU
      const TIMEOUT_TICKS = 13;  // ~2 seconds before showing roadblock (was 3s)
      let lastStatus: string | null = null;
      let healthReported = false;

      // Show a subtle "searching..." indicator immediately so user knows we're working
      if (this.shadow) {
        const searchHint = document.createElement('div');
        searchHint.className = 'guide-search-hint';
        searchHint.setAttribute('data-search-hint', 'true');
        searchHint.textContent = 'Finding element...';
        // Style it as a small pill at the top
        searchHint.style.cssText = `
          position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
          z-index: 2147483642; background: #FFFFFF; color: #999;
          padding: 6px 16px; border-radius: 20px; font-size: 12px;
          border: 1px solid #E5E5E5; pointer-events: none;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          animation: guide-tooltip-in 0.2s ease-out;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        `;
        this.shadow.appendChild(searchHint);
      }

      const poll = async (): Promise<void> => {
        if (this._stepSeq !== seq) { this._stopElementPolling(); return; }

        const result = await findGuideElement(step);

        if (this._stepSeq !== seq) return; // another showStep started

        if (result) {
          tickCount = 0;  // reset on success
          this.currentResult = result;

          // Report health once on first find
          if (!healthReported) {
            healthReported = true;
            try {
              chrome.runtime.sendMessage({
                type: 'GUIDE_STEP_HEALTH',
                workflowId: this.guide.workflow_id || this.guide.workflowId || this.guide.id,
                stepNumber: this.currentIndex,
                elementFound: true,
                finderMethod: result.method || null,
                finderConfidence: result.confidence || 0,
                expectedUrl: step.expected_url || step.url || null,
                actualUrl: window.location.href,
                urlMatched: true,
                timestamp: Date.now(),
              }).catch(() => {});
            } catch (_) {}
          }

          // Check intermediate action
          const intermediateAncestor = needsIntermediateAction(result.element);
          if (intermediateAncestor) {
            if (lastStatus !== 'intermediate') {
              lastStatus = 'intermediate';
              this._stopElementPolling();
              chrome.runtime.sendMessage({
                type: 'GUIDE_STEP_CHANGED',
                currentIndex: this.currentIndex,
                totalSteps: this.steps.length,
                stepStatus: 'intermediate',
              }).catch(() => {});
              this._renderIntermediateHint(step, intermediateAncestor, urlMismatch);
            }
            return;
          }

          if (lastStatus !== 'found') {
            lastStatus = 'found';
            // Clear search hint and any previous not-found UI
            if (this.shadow) {
              const hint = this.shadow.querySelector('[data-search-hint]');
              if (hint) hint.remove();
            }
            if (this._notFoundPanel) { this._notFoundPanel.remove(); this._notFoundPanel = null; }

            chrome.runtime.sendMessage({
              type: 'GUIDE_STEP_CHANGED',
              currentIndex: this.currentIndex,
              totalSteps: this.steps.length,
              stepStatus: 'active',
            }).catch(() => {});

            const obstructor = isObstructed(result.element);
            await this._scrollToElement(result);
            if (this._stepSeq !== seq) return;
            this._renderOverlay(step, result, urlMismatch, obstructor);
            this._startPositionTracking(step, result);
            this._setupClickAdvance(result.element, step);
            this._setupCompletionDetection(result.element, step);
            // Stop polling once element is found and handlers are set up
            this._stopElementPolling();
          }
        } else {
          tickCount++;
          // First try LLM recovery after timeout threshold
          if (tickCount >= TIMEOUT_TICKS && lastStatus !== 'recovery' && lastStatus !== 'notfound') {
            lastStatus = 'recovery';
            this._stopElementPolling();
            await this._tryLlmRecovery(step, seq, urlMismatch);
          }
        }
      };

      // Immediate first poll, then every 100ms
      poll();
      this._pollInterval = setInterval(poll, POLL_MS);
    }

    async _tryLlmRecovery(step: GuideStep, seq: number, urlMismatch: boolean): Promise<void> {
      // Show "AI is looking..." indicator
      if (this.shadow) {
        const hint = this.shadow.querySelector('[data-search-hint]');
        if (hint) hint.remove();
        
        const recoveryHint = document.createElement('div');
        recoveryHint.className = 'guide-search-hint';
        recoveryHint.setAttribute('data-search-hint', 'recovery');
        recoveryHint.textContent = '🔄 AI is looking...';
        recoveryHint.style.cssText = `
          position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
          z-index: 2147483642; background: #FFFFFF; color: #FF6B52;
          padding: 8px 18px; border-radius: 20px; font-size: 12px;
          border: 1px solid #E5E5E5; pointer-events: none;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          animation: guide-tooltip-in 0.2s ease-out;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        `;
        this.shadow.appendChild(recoveryHint);
      }

      try {
        // Collect all interactive elements on the page  
        const pageElements = this._collectInteractiveElements();
        
        // Build target info from step
        const targetInfo = this._buildTargetInfo(step);
        
        // Call recovery API
        const recovery = await this._callRecoveryApi(targetInfo, pageElements);
        
        if (this._stepSeq !== seq) return; // Step changed during recovery
        
        // Remove recovery hint
        if (this.shadow) {
          const hint = this.shadow.querySelector('[data-search-hint="recovery"]');
          if (hint) hint.remove();
        }
        
        if (recovery.found && recovery.element_index !== null) {
          // Recovery successful - highlight the found element
          const foundElement = pageElements[recovery.element_index];
          const domElement = this._findDomElementByInfo(foundElement);
          
          if (domElement && isVisible(domElement)) {
            const result: FindResult = {
              element: domElement,
              confidence: recovery.confidence,
              method: 'llm-recovery',
              iframeOffset: { x: 0, y: 0 }
            };
            
            this.currentResult = result;
            
            // Report successful recovery
            chrome.runtime.sendMessage({
              type: 'GUIDE_STEP_HEALTH',
              workflowId: this.guide.workflow_id || this.guide.workflowId || this.guide.id,
              stepNumber: this.currentIndex,
              elementFound: true,
              finderMethod: 'llm-recovery',
              finderConfidence: recovery.confidence,
              expectedUrl: step.expected_url || step.url || null,
              actualUrl: window.location.href,
              urlMatched: !urlMismatch,
              timestamp: Date.now(),
            }).catch(() => {});
            
            chrome.runtime.sendMessage({
              type: 'GUIDE_STEP_CHANGED',
              currentIndex: this.currentIndex,
              totalSteps: this.steps.length,
              stepStatus: 'found',
            }).catch(() => {});
            
            // Render overlay and set up interactions
            const obstructor = isObstructed(result.element);
            this._renderOverlay(step, result, urlMismatch, obstructor);
            this._startPositionTracking(step, result);
            this._setupClickAdvance(result.element, step);
            this._setupCompletionDetection(result.element, step);
            
            return; // Success!
          }
        }
        
        // Recovery failed - show original not-found UI
        this._showRecoveryFailed(step, urlMismatch, recovery.error);
        
      } catch (error: any) {
        if (this._stepSeq !== seq) return; // Step changed during recovery
        
        // Remove recovery hint on error
        if (this.shadow) {
          const hint = this.shadow.querySelector('[data-search-hint="recovery"]');
          if (hint) hint.remove();
        }
        
        console.warn('LLM recovery failed:', error);
        this._showRecoveryFailed(step, urlMismatch, error.message);
      }
    }

    _collectInteractiveElements(): any[] {
      // Similar to the stept-engine DOM extraction but simpler for browser runtime
      const interactiveSelectors = [
        'a[href]', 'button', 'input', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="textbox"]',
        '[role="combobox"]', '[role="checkbox"]', '[role="radio"]',
        '[role="tab"]', '[role="menuitem"]', '[role="option"]',
        '[onclick]', '[tabindex]:not([tabindex="-1"])',
        'label[for]', '[contenteditable="true"]'
      ];
      
      const elements: any[] = [];
      const seen = new Set<string>();
      
      document.querySelectorAll(interactiveSelectors.join(', ')).forEach((el: Element, index: number) => {
        if (!isVisible(el)) return;
        
        const rect = el.getBoundingClientRect();
        const text = (el.textContent || '').trim();
        
        // Deduplicate by position + text
        const dedupeKey = `${Math.round(rect.x)},${Math.round(rect.y)},${text.slice(0, 20)}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        
        const elementData = {
          index: elements.length,
          tagName: el.tagName.toLowerCase(),
          text: text.slice(0, 200),
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label'),
          type: el.getAttribute('type'),
          name: el.getAttribute('name'),
          placeholder: el.getAttribute('placeholder'),
          id: el.id || null,
          href: (el.tagName === 'A' && (el as HTMLAnchorElement).href) ? (el as HTMLAnchorElement).href : null,
          value: (el as any).value || null,
          disabled: (el as any).disabled || false,
          checked: (el as any).checked || false,
          focused: document.activeElement === el,
          testId: el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy') || null,
          parentText: el.parentElement?.textContent?.slice(0, 100) || null
        };
        
        elements.push(elementData);
      });
      
      return elements;
    }

    _buildTargetInfo(step: GuideStep): any {
      const info: any = {
        step_title: step.title,
        step_description: step.description,
        action_type: step.action_type
      };
      
      // Add element info if available
      if ((step as any).element_info) {
        const ei = (step as any).element_info;
        Object.assign(info, {
          content: ei.content,
          text: ei.text || step.element_text,
          tagName: ei.tagName,
          role: ei.role || step.element_role,
          ariaLabel: ei.ariaLabel,
          placeholder: ei.placeholder,
          type: ei.type,
          title: ei.title
        });
      } else {
        // Fallback to legacy fields
        info.text = step.element_text;
        info.role = step.element_role;
      }
      
      return info;
    }

    async _callRecoveryApi(targetInfo: any, pageElements: any[]): Promise<any> {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: 'GUIDE_RECOVER_ELEMENT',
            target: targetInfo,
            pageElements: pageElements,
            workflowId: this.guide.workflow_id || this.guide.workflowId || this.guide.id,
            stepIndex: this.currentIndex,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!response || response.error) {
              reject(new Error(response?.error || 'Recovery API failed'));
              return;
            }
            resolve(response);
          }
        );
      });
    }

    _findDomElementByInfo(elementInfo: any): Element | null {
      // Try to find the DOM element that matches the elementInfo from the API response
      // This uses the same logic as the collection phase
      const selectors = [
        'a[href]', 'button', 'input', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="textbox"]',
        '[role="combobox"]', '[role="checkbox"]', '[role="radio"]',
        '[role="tab"]', '[role="menuitem"]', '[role="option"]',
        '[onclick]', '[tabindex]:not([tabindex="-1"])',
        'label[for]', '[contenteditable="true"]'
      ];
      
      const candidates = Array.from(document.querySelectorAll(selectors.join(', ')));
      let elementIndex = 0;
      
      for (const el of candidates) {
        if (!isVisible(el)) continue;
        
        const rect = el.getBoundingClientRect();
        const text = (el.textContent || '').trim();
        
        // Skip duplicates (same logic as collection)
        const dedupeKey = `${Math.round(rect.x)},${Math.round(rect.y)},${text.slice(0, 20)}`;
        
        if (elementIndex === elementInfo.index) {
          // Additional verification - check key attributes match
          if (elementInfo.tagName === el.tagName.toLowerCase() &&
              (elementInfo.text || '').slice(0, 50) === text.slice(0, 50)) {
            return el;
          }
        }
        
        elementIndex++;
      }
      
      return null;
    }

    _showRecoveryFailed(step: GuideStep, urlMismatch: boolean, error?: string): void {
      // Report health
      try {
        chrome.runtime.sendMessage({
          type: 'GUIDE_STEP_HEALTH',
          workflowId: this.guide.workflow_id || this.guide.workflowId || this.guide.id,
          stepNumber: this.currentIndex,
          elementFound: false,
          finderMethod: 'llm-recovery',
          finderConfidence: 0,
          expectedUrl: step.expected_url || step.url || null,
          actualUrl: window.location.href,
          urlMatched: !urlMismatch,
          timestamp: Date.now(),
          errorMessage: error || 'LLM recovery failed',
        }).catch(() => {});
      } catch {}
      
      chrome.runtime.sendMessage({
        type: 'GUIDE_STEP_CHANGED',
        currentIndex: this.currentIndex,
        totalSteps: this.steps.length,
        stepStatus: 'notfound',
      }).catch(() => {});
      
      // Show enhanced not-found panel with recovery info
      this._renderNotFound(step, urlMismatch);
    }

    _handleUrlChange(newUrl: string, oldUrl: string): void {
      console.log('URL changed from', oldUrl, 'to', newUrl);
      
      // Update tracking
      this._lastKnownUrl = newUrl;
      
      // Check if any step expects this URL
      const matchingStepIndex = this._findStepForUrl(newUrl);
      
      if (matchingStepIndex !== -1 && matchingStepIndex !== this.currentIndex) {
        // Auto-advance to the matching step
        console.log(`Auto-advancing to step ${matchingStepIndex} for URL: ${newUrl}`);
        
        // Report the URL navigation
        chrome.runtime.sendMessage({
          type: 'GUIDE_URL_CHANGED',
          oldUrl,
          newUrl,
          fromStep: this.currentIndex,
          toStep: matchingStepIndex
        }).catch(() => {});
        
        this.showStep(matchingStepIndex);
      } else if (matchingStepIndex === -1) {
        // No step matches this URL - pause the guide
        console.log(`No step matches URL ${newUrl}, pausing guide`);
        
        this._clearOverlay();
        this._showUrlMismatchPanel(newUrl);
        
        chrome.runtime.sendMessage({
          type: 'GUIDE_STEP_CHANGED',
          currentIndex: this.currentIndex,
          totalSteps: this.steps.length,
          stepStatus: 'url-mismatch',
          actualUrl: newUrl
        }).catch(() => {});
      }
      // If matchingStepIndex === this.currentIndex, we're already on the right step
    }

    _findStepForUrl(url: string): number {
      // Find the step that expects this URL
      for (let i = 0; i < this.steps.length; i++) {
        const step = this.steps[i];
        if (this._urlMatches(url, step.expected_url || step.url)) {
          return i;
        }
      }
      return -1; // No matching step found
    }

    _urlMatches(currentUrl: string, expectedUrl?: string | null): boolean {
      if (!expectedUrl) return true; // No URL constraint
      
      try {
        const current = new URL(currentUrl);
        const expected = new URL(expectedUrl);
        
        // Match protocol, host, and pathname
        return (
          current.protocol === expected.protocol &&
          current.host === expected.host &&
          current.pathname === expected.pathname
        );
        // Note: We don't match search params or hash to be more flexible
      } catch (e) {
        // Fallback to simple string comparison if URL parsing fails
        return currentUrl.includes(expectedUrl);
      }
    }

    _showUrlMismatchPanel(currentUrl: string): void {
      if (!this.shadow) return;
      
      // Clear existing panels
      this._clearOverlay();

      const panel = document.createElement("div");
      panel.className = "guide-not-found";
      
      panel.innerHTML = `
        <div class="guide-not-found-title">Unexpected page</div>
        <div class="guide-not-found-desc">
          The guide is paused because you navigated to an unexpected page.
          <br><br>
          Current: ${this._esc(currentUrl.length > 60 ? currentUrl.slice(0, 60) + '...' : currentUrl)}
        </div>
        <div class="guide-tooltip-actions" style="justify-content: center;">
          <button class="guide-btn guide-btn-secondary" data-action="retry">Check again</button>
          <button class="guide-btn guide-btn-ghost" data-action="close">Close guide</button>
        </div>
      `;
      
      panel.addEventListener("click", (e: Event) => {
        const target = e.target as HTMLElement;
        const action = target.closest("[data-action]")?.getAttribute("data-action");
        
        switch (action) {
          case "retry":
            // Re-check current URL and try to continue
            this._handleUrlChange(window.location.href, this._lastKnownUrl);
            break;
          case "close":
            this.stop();
            break;
        }
      });
      
      this.shadow.appendChild(panel);
    }

    async showStep(index: number): Promise<void> {
      if (index < 0 || index >= this.steps.length) {
        this.stop();
        return;
      }
      // Concurrency guard: if another showStep starts, this one aborts
      const seq = ++this._stepSeq;
      this.currentIndex = index;
      this._clearOverlay();

      const step = this.steps[index];
      const actionType = (step.action_type || '').toLowerCase();

      // Navigate / new-tab steps have no element to highlight — auto-advance
      const isNavigateStep = actionType === 'navigate';
      if (isNavigateStep) {
        chrome.runtime.sendMessage({
          type: 'GUIDE_STEP_CHANGED',
          currentIndex: index,
          totalSteps: this.steps.length,
          stepStatus: 'completed',
        }).catch(() => {});
        // Small delay so the sidepanel can update, then advance
        await new Promise<void>((r) => setTimeout(r, 300));
        if (this._stepSeq !== seq) return;
        this.showStep(index + 1);
        return;
      }

      // Hover steps can't be guided — treat as roadblock
      const isHoverStep = actionType.includes('hover') || actionType.includes('mouseover');
      if (isHoverStep) {
        chrome.runtime.sendMessage({
          type: 'GUIDE_STEP_CHANGED',
          currentIndex: index,
          totalSteps: this.steps.length,
          stepStatus: 'roadblock',
        }).catch(() => {});
        this._renderRoadblock(step);
        return;
      }

      // Check URL mismatch
      let urlMismatch = false;
      if (step.expected_url) {
        try {
          const expected = new URL(step.expected_url);
          const current = new URL(window.location.href);
          urlMismatch = expected.pathname !== current.pathname;
        } catch {}
      }

      // Notify sidepanel we're searching
      chrome.runtime.sendMessage({
        type: 'GUIDE_STEP_CHANGED',
        currentIndex: index,
        totalSteps: this.steps.length,
        stepStatus: 'active',
      }).catch(() => {});

      // Continuous polling for element (like Tango's 100ms Automatix pattern).
      // Instead of 5 retries with long waits, poll every 100ms and show
      // roadblock only after 30 ticks (3s). Element positions update in real-time.
      this._startElementPolling(step, seq, urlMismatch);
    }

    _scrollToElement(result: FindResult): Promise<void> {
      return new Promise<void>((resolve) => {
        const rect = this._getAdjustedRect(result);

        // Detect fixed/sticky headers
        let headerOffset = 0;
        const fixedEls = document.querySelectorAll('header, nav, [role="banner"], [role="navigation"]');
        fixedEls.forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'sticky') {
            const bottom = el.getBoundingClientRect().bottom;
            if (bottom > 0 && bottom < window.innerHeight / 3) {
              headerOffset = Math.max(headerOffset, bottom);
            }
          }
        });

        const viewportHeight = window.innerHeight;
        const targetTop = headerOffset + 80; // 80px breathing room below headers
        const targetBottom = viewportHeight - 120; // leave room for tooltip below

        // Already well-positioned?
        if (rect.top >= targetTop && rect.bottom <= targetBottom) {
          resolve();
          return;
        }

        // Calculate scroll target: place element in top-third of usable viewport
        const usableTop = headerOffset + 80;
        const scrollTarget = window.scrollY + rect.top - usableTop;

        // Smooth scroll
        window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });

        // Wait for scroll to settle (check position stability over 3 rAF frames)
        let lastY = window.scrollY;
        let stableFrames = 0;
        const checkSettled = () => {
          if (Math.abs(window.scrollY - lastY) < 1) {
            stableFrames++;
            if (stableFrames >= 3) {
              resolve();
              return;
            }
          } else {
            stableFrames = 0;
          }
          lastY = window.scrollY;
          requestAnimationFrame(checkSettled);
        };
        requestAnimationFrame(checkSettled);

        // Safety timeout: don't wait forever
        setTimeout(resolve, 1000);
      });
    }

    // Get the element rect in top-frame coordinates (accounting for iframe offset + zoom)
    _getAdjustedRect(result: FindResult): AdjustedRect {
      const raw = result.element.getBoundingClientRect();
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

    _renderOverlay(step: GuideStep, result: FindResult, urlMismatch: boolean, obstructor: Element | null): void {
      const rect = this._getAdjustedRect(result);
      const pad = 6;

      // Create or update highlight ring (in-place) — no backdrop/dimming
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

      // Recreate tooltip (content changes each step)
      if (this._tooltip) {
        this._tooltip.remove();
      }
      this._tooltip = this._createTooltip(step, urlMismatch, obstructor);
      this.shadow!.appendChild(this._tooltip);
      this._positionTooltip(this._tooltip, rect);
    }

    _createTooltip(step: GuideStep, urlMismatch: boolean, obstructor: Element | null): HTMLDivElement {
      const total = this.steps.length;
      const idx = this.currentIndex;
      const progressPct = ((idx + 1) / total) * 100;

      const tooltip = document.createElement("div");
      tooltip.className = "guide-tooltip";

      let html = `<button class="guide-close-btn" data-action="close">&times;</button>`;

      if (urlMismatch) {
        html += `<div class="guide-url-warning">
          This step expects a different page.
          <br><button class="guide-navigate-btn" data-action="navigate">Navigate to page</button>
        </div>`;
      }

      // Feature 3: Obstruction warning
      if (obstructor) {
        const obDesc = describeElement(obstructor);
        html += `<div class="guide-obstruction-warning">
          This element is behind another element. You may need to close a dialog or scroll.
          <br><small>Obstructed by: &lt;${this._esc(obDesc)}&gt;</small>
        </div>`;
      }

      // Feature 2: Determine if this is a non-click step (Type, Key, Select, Navigate)
      const actionType = (step.action_type || '').toLowerCase();
      const isNonClickStep = actionType.includes('type') || actionType.includes('key') || actionType.includes('select') || actionType.includes('navigate');

      html += `
        <div class="guide-tooltip-title">${this._esc(step.title || step.description || `Step ${idx + 1}`)}</div>
        ${step.description && step.description !== step.title ? `<div class="guide-tooltip-desc">${this._esc(step.description)}</div>` : ""}
        <div class="guide-tooltip-progress">
          Step ${idx + 1} of ${total}
          <div class="guide-tooltip-progress-bar">
            <div class="guide-tooltip-progress-fill" style="width: ${progressPct}%"></div>
          </div>
        </div>
        <div class="guide-tooltip-actions">
          ${idx > 0 ? `<button class="guide-btn guide-btn-secondary" data-action="back">Back</button>` : ""}
          <div class="guide-spacer"></div>
          <button class="guide-btn guide-btn-ghost" data-action="skip">Skip</button>
          ${isNonClickStep ? `<button class="guide-btn guide-btn-done" data-action="done">&#10003; Step Done</button>` : ""}
          <button class="guide-btn guide-btn-primary" data-action="next">${idx === total - 1 ? "Finish" : "Next"}</button>
        </div>
      `;

      tooltip.innerHTML = html;

      // Stop ALL events on the tooltip from reaching the document.
      // In shadow DOM, stopPropagation prevents crossing the shadow boundary,
      // so modal "outside click" handlers on document never see these clicks.
      for (const evt of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
        tooltip.addEventListener(evt, (e: Event) => e.stopPropagation());
      }

      // Wire up action buttons
      tooltip.addEventListener("click", (e: Event) => {
        const action = (e.target as HTMLElement).closest("[data-action]")?.getAttribute("data-action");
        if (!action) return;
        switch (action) {
          case "next":
            if (this.currentIndex >= this.steps.length - 1) {
              this.stop();
            } else {
              this.showStep(this.currentIndex + 1);
            }
            break;
          case "back":
            this.showStep(this.currentIndex - 1);
            break;
          case "done":
            if (this.currentIndex >= this.steps.length - 1) {
              this.stop();
            } else {
              this.showStep(this.currentIndex + 1);
            }
            break;
          case "skip":
            if (this.currentIndex >= this.steps.length - 1) {
              this.stop();
            } else {
              this.showStep(this.currentIndex + 1);
            }
            break;
          case "close":
            this.stop();
            break;
          case "navigate": {
            const navStep = this.steps[this.currentIndex];
            if (navStep.expected_url) {
              chrome.runtime.sendMessage({
                type: 'GUIDE_NAVIGATE',
                url: navStep.expected_url,
                stepIndex: this.currentIndex,
              });
            }
            break;
          }
        }
      });

      return tooltip;
    }

    _positionTooltip(tooltip: HTMLDivElement, rect: AdjustedRect): void {
      // Determine best position: bottom, top, right, left
      const gap = 14;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Measure tooltip (approximate, will refine after render)
      requestAnimationFrame(() => {
        const tr = tooltip.getBoundingClientRect();
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

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
      });
    }

    _renderNotFound(step: GuideStep, urlMismatch: boolean): void {
      const idx = this.currentIndex;
      const total = this.steps.length;

      const panel = document.createElement("div");
      panel.className = "guide-not-found";

      let notFoundHtml = `
        <div class="guide-not-found-title">Element not found</div>
        <div class="guide-not-found-desc">
          Could not locate the target element for step ${idx + 1}.
          ${urlMismatch ? "This step expects a different page." : "The page may have changed."}
        </div>
      `;

      if (urlMismatch && step.expected_url) {
        notFoundHtml += `<div style="margin-bottom: 12px;">
          <button class="guide-navigate-btn" data-action="navigate">Navigate to page</button>
        </div>`;
      }

      notFoundHtml += `
        <div class="guide-tooltip-progress">
          Step ${idx + 1} of ${total}
        </div>
        <div class="guide-tooltip-actions" style="justify-content: center;">
          ${idx > 0 ? `<button class="guide-btn guide-btn-secondary" data-action="back">Back</button>` : ""}
          <button class="guide-btn guide-btn-ghost" data-action="skip">Skip</button>
          <button class="guide-btn guide-btn-primary" data-action="close">Close</button>
        </div>
      `;

      panel.innerHTML = notFoundHtml;

      // Stop events from reaching document (same as tooltip)
      for (const evt of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
        panel.addEventListener(evt, (e: Event) => e.stopPropagation());
      }

      panel.addEventListener("click", (e: Event) => {
        const action = (e.target as HTMLElement).closest("[data-action]")?.getAttribute("data-action");
        if (!action) return;
        switch (action) {
          case "back":
            this.showStep(this.currentIndex - 1);
            break;
          case "skip":
            this.showStep(this.currentIndex + 1);
            break;
          case "close":
            this.stop();
            break;
          case "navigate": {
            const navStep = this.steps[this.currentIndex];
            if (navStep.expected_url) {
              chrome.runtime.sendMessage({
                type: 'GUIDE_NAVIGATE',
                url: navStep.expected_url,
                stepIndex: this.currentIndex,
              });
            }
            break;
          }
        }
      });

      this._notFoundPanel = panel;
      this.shadow!.appendChild(panel);
    }

    _renderRoadblock(step: GuideStep): void {
      const idx = this.currentIndex;
      const total = this.steps.length;

      const panel = document.createElement("div");
      panel.className = "guide-not-found";

      panel.innerHTML = `
        <div class="guide-roadblock-icon">\u26A0</div>
        <div class="guide-not-found-title">We hit a roadblock</div>
        <div class="guide-not-found-desc">
          This step involves a hover action that can't be automated.
          Try performing the action on the screen to move forward.
        </div>
        <div class="guide-roadblock-step-title">${this._esc(step.title || step.description || `Step ${idx + 1}`)}</div>
        <div class="guide-tooltip-progress">
          Step ${idx + 1} of ${total}
        </div>
        <div class="guide-tooltip-actions" style="justify-content: center;">
          ${idx > 0 ? `<button class="guide-btn guide-btn-secondary" data-action="back">Back</button>` : ""}
          <button class="guide-btn guide-btn-ghost" data-action="skip">Skip</button>
          <button class="guide-btn guide-btn-done" data-action="done">&#10003; Mark as complete</button>
        </div>
      `;

      for (const evt of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
        panel.addEventListener(evt, (e: Event) => e.stopPropagation());
      }

      panel.addEventListener("click", (e: Event) => {
        const action = (e.target as HTMLElement).closest("[data-action]")?.getAttribute("data-action");
        if (!action) return;
        switch (action) {
          case "back":
            this.showStep(this.currentIndex - 1);
            break;
          case "skip":
          case "done":
            if (this.currentIndex >= this.steps.length - 1) {
              this.stop();
            } else {
              this.showStep(this.currentIndex + 1);
            }
            break;
        }
      });

      this._notFoundPanel = panel;
      this.shadow!.appendChild(panel);
    }

    _showEmpty(): void {
      this._clearOverlay();
      const panel = document.createElement("div");
      panel.className = "guide-not-found";
      panel.innerHTML = `
        <div class="guide-not-found-title">No steps in this guide</div>
        <div class="guide-not-found-desc">This guide has no steps to display.</div>
        <button class="guide-btn guide-btn-primary" data-action="close">Close</button>
      `;
      panel.addEventListener("click", (e: Event) => {
        if ((e.target as HTMLElement).closest("[data-action=close]")) this.stop();
      });
      this.shadow!.appendChild(panel);
    }

    _startPositionTracking(step: GuideStep, result: FindResult): void {
      const update = () => {
        if (!result.element || !result.element.isConnected) {
          // Element removed from DOM — try to re-find
          findGuideElement(step).then((newResult) => {
            if (newResult) {
              this.currentResult = newResult;
              result = newResult;
            }
          });
          this._positionFrame = requestAnimationFrame(update);
          return;
        }

        const rect = this._getAdjustedRect(result);
        const pad = 6;

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
      if (this.positionInterval) {
        clearInterval(this.positionInterval);
        this.positionInterval = null;
      }
      if (this._positionFrame) {
        cancelAnimationFrame(this._positionFrame);
        this._positionFrame = null;
      }
    }

    _setupClickAdvance(element: Element, step: GuideStep): void {
      // For click steps: advance when user clicks the target element
      const isClickStep = step.action_type && step.action_type.toLowerCase().includes("click");
      if (!isClickStep) return;

      const nextIndex = this.currentIndex + 1;
      const isLinkClick = element.tagName === 'A' || !!(element as HTMLElement).closest('a');
      const isOption = element.tagName === 'OPTION' || (element as HTMLElement).role === 'option';

      const advance = (): void => {
        this._removeClickHandler();
        if (nextIndex >= this.steps.length) {
          this.stop();
          return;
        }
        // Notify background IMMEDIATELY so it has the right index
        // before any page navigation destroys this context.
        chrome.runtime.sendMessage({
          type: 'GUIDE_STEP_CHANGED',
          currentIndex: nextIndex,
          totalSteps: this.steps.length,
          stepStatus: 'active',
        }).catch(() => {});

        // For link/option clicks that may navigate away, don't try to show
        // the next step locally — the page will unload and background
        // will re-inject.
        if (isLinkClick || isOption) return;

        setTimeout(() => this.showStep(nextIndex), 400);
      };

      // Always use click event. The Tango pointerdown approach for links causes
      // premature advancement when navigation doesn't actually happen (SPAs).
      // For actual page navigations, the background script will handle
      // re-injection at the correct step index.
      const eventType = "click";

      this._clickHandler = (_e: Event): void => advance();
      element.addEventListener(eventType, this._clickHandler, { once: true });
      this._clickElement = element;
      this._clickEventType = eventType;

      // Also listen on parent in case the exact element gets replaced (SPAs)
      if (element.parentElement) {
        this._parentClickHandler = (e: Event): void => {
          if (e.target === element || element.contains(e.target as Node)) {
            advance();
          }
        };
        element.parentElement.addEventListener(eventType, this._parentClickHandler, { once: true });
        this._clickParent = element.parentElement;
      }

      // Keyboard shortcuts for step advancement (Tango pattern):
      // Enter on input fields, Tab, or Ctrl/Cmd+E
      this._keyHandler = (e: KeyboardEvent): void => {
        // Ctrl/Cmd+E: manual step advance shortcut
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
          e.preventDefault();
          e.stopImmediatePropagation();
          advance();
        }
        // NOTE: Tab and Enter removed — they caused false step advances.
        // Tab is normal field navigation, Enter submits forms. Neither means
        // "I completed this guide step." Users advance via clicking the target
        // element or pressing the Next button in the tooltip.
      };
      document.addEventListener('keydown', this._keyHandler, { capture: true });
    }

    _removeClickHandler(): void {
      const eventType = this._clickEventType || "click";
      if (this._clickHandler && this._clickElement) {
        this._clickElement.removeEventListener(eventType, this._clickHandler);
        this._clickHandler = null;
        this._clickElement = null;
      }
      if (this._parentClickHandler && this._clickParent) {
        this._clickParent.removeEventListener(eventType, this._parentClickHandler);
        this._parentClickHandler = null;
        this._clickParent = null;
      }
      if (this._keyHandler) {
        document.removeEventListener('keydown', this._keyHandler, { capture: true });
        this._keyHandler = null;
      }
      this._clickEventType = null;
    }

    // Feature 5: Completion detection via MutationObserver and event listeners
    _setupCompletionDetection(element: Element, step: GuideStep): void {
      const actionType = (step.action_type || '').toLowerCase();
      const advance = (): void => {
        this._disconnectCompletionObserver();
        if (this.currentIndex >= this.steps.length - 1) {
          this.stop();
        } else {
          this.showStep(this.currentIndex + 1);
        }
      };

      if (actionType.includes('type')) {
        // Watch for value changes on input/textarea via input, change, and paste
        const onInput = (): void => {
          if (this._tooltip) {
            const indicator = this._tooltip.querySelector('.guide-completion-indicator');
            if (!indicator) {
              const div = document.createElement('div');
              div.className = 'guide-completion-indicator';
              div.style.cssText = 'color:#059669;font-size:12px;margin-top:6px;';
              div.textContent = 'Step completed \u2713';
              this._tooltip.appendChild(div);
            }
          }
          if (this._completionTimeout) clearTimeout(this._completionTimeout);
          this._completionTimeout = setTimeout(advance, 1500);
        };
        const ac = new AbortController();
        const opts: AddEventListenerOptions & { signal: AbortSignal } = { capture: true, signal: ac.signal };
        element.addEventListener('input', onInput, opts);
        element.addEventListener('change', onInput, opts);
        element.addEventListener('paste', onInput, opts);
        // Also listen on document for events that bubble (covers iframes)
        document.addEventListener('input', (e: Event) => {
          if (e.target === element || element.contains(e.target as Node)) onInput();
        }, opts);
        this._completionCleanup = (): void => ac.abort();
      } else if (actionType.includes('click')) {
        // Click advancement is handled by _setupClickAdvance — do NOT add a
        // MutationObserver here. The previous implementation watched for element
        // removal from DOM which caused double-advance (step jumping) because
        // both the click handler AND the mutation observer would fire advance().
        // SPA re-renders also falsely triggered this when the parent subtree
        // was replaced, causing random step skips.
      } else if (actionType.includes('select')) {
        const onChange = (): void => {
          setTimeout(advance, 500);
        };
        element.addEventListener('change', onChange, { once: true });
        this._completionCleanup = (): void => element.removeEventListener('change', onChange);
      }
      // Navigate steps are auto-skipped — no detection needed
    }

    _disconnectCompletionObserver(): void {
      if (this._completionObserver) {
        this._completionObserver.disconnect();
        this._completionObserver = null;
      }
      if (this._completionCleanup) {
        this._completionCleanup();
        this._completionCleanup = null;
      }
      if (this._completionTimeout) {
        clearTimeout(this._completionTimeout);
        this._completionTimeout = null;
      }
    }

    // Feature 8: Intermediate action hint (element hidden behind collapsed ancestor)
    _renderIntermediateHint(step: GuideStep, ancestor: HTMLElement, urlMismatch: boolean): void {
      const idx = this.currentIndex;
      const total = this.steps.length;

      // Try to highlight the ancestor if it's visible
      const ancestorRect = ancestor.getBoundingClientRect();
      if (ancestorRect.width > 0 && ancestorRect.height > 0) {
        const zoom = getPageZoom();
        const rect: AdjustedRect = {
          left: ancestorRect.left * zoom, top: ancestorRect.top * zoom,
          right: ancestorRect.right * zoom, bottom: ancestorRect.bottom * zoom,
          width: ancestorRect.width * zoom, height: ancestorRect.height * zoom,
        };
        const pad = 6;
        if (!this._highlight) {
          this._highlight = document.createElement("div");
          this._highlight.className = "guide-highlight";
          this.shadow!.appendChild(this._highlight);
        }
        this._highlight.style.display = "";
        this._highlight.style.borderColor = "#6366F1";
        this._highlight.style.boxShadow = "0 0 0 4px rgba(99, 102, 241, 0.25)";
        this._highlight.style.left = `${rect.left - pad}px`;
        this._highlight.style.top = `${rect.top - pad}px`;
        this._highlight.style.width = `${rect.width + pad * 2}px`;
        this._highlight.style.height = `${rect.height + pad * 2}px`;
      }

      const panel = document.createElement("div");
      panel.className = "guide-not-found";

      const ancestorDesc = describeElement(ancestor);
      panel.innerHTML = `
        <div class="guide-intermediate-hint">
          First, open <strong>${this._esc(ancestorDesc)}</strong> to reveal the target element.
        </div>
        <div class="guide-not-found-title">${this._esc(step.title || step.description || `Step ${idx + 1}`)}</div>
        <div class="guide-tooltip-progress">Step ${idx + 1} of ${total}</div>
        <div class="guide-tooltip-actions" style="justify-content: center;">
          ${idx > 0 ? `<button class="guide-btn guide-btn-secondary" data-action="back">Back</button>` : ""}
          <button class="guide-btn guide-btn-ghost" data-action="skip">Skip</button>
          <button class="guide-btn guide-btn-primary" data-action="retry">Check again</button>
        </div>
      `;

      for (const evt of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
        panel.addEventListener(evt, (e: Event) => e.stopPropagation());
      }

      panel.addEventListener("click", (e: Event) => {
        const action = (e.target as HTMLElement).closest("[data-action]")?.getAttribute("data-action");
        if (!action) return;
        switch (action) {
          case "retry":
            this.showStep(this.currentIndex);
            break;
          case "back":
            this.showStep(this.currentIndex - 1);
            break;
          case "skip":
            if (this.currentIndex >= this.steps.length - 1) {
              this.stop();
            } else {
              this.showStep(this.currentIndex + 1);
            }
            break;
        }
      });

      this._intermediatePanel = panel;
      this.shadow!.appendChild(panel);
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

  // ── Image Modal (shown on page when user clicks screenshot in sidepanel) ──

  function _showImageModal(dataUrl: string): void {
    // Remove any existing modal
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

  chrome.runtime.onMessage.addListener((message: { type: string; guide: Guide; startIndex?: number; stepIndex?: number }, _sender: MessageSender, sendResponse: SendResponse) => {
    if (message.type === "START_GUIDE") {
      try {
        if (activeRunner) {
          activeRunner._replacing = true; // don't send GUIDE_STOPPED
          activeRunner.stop();
        }
        const runner = new GuideRunner(message.guide);
        activeRunner = runner;
        _window.__steptGuideRunner = runner;
        const startAt = (typeof message.startIndex === "number" && message.startIndex > 0) ? message.startIndex : 0;
        runner.currentIndex = startAt;
        runner.start(startAt);
        sendResponse({ success: true });
      } catch (e: unknown) {
        sendResponse({ success: false, error: (e as Error).message });
      }
    } else if (message.type === "GUIDE_GOTO") {
      // Lightweight step jump — don't restart the runner
      if (activeRunner && typeof message.stepIndex === "number") {
        activeRunner.showStep(message.stepIndex);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
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
