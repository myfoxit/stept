(function () {
  'use strict';

  interface IframeOffset { x: number; y: number; }
  interface SearchRoot { root: Document | ShadowRoot; iframeOffset: IframeOffset; }
  interface ParentChainEntry {
    tag?: string;
    id?: string | null;
    role?: string | null;
    ariaLabel?: string | null;
    testId?: string | null;
    className?: string | null;
  }
  interface SelectorTree {
    selectors?: string[];
    prevSiblingSelectors?: string[];
    nextSiblingSelectors?: string[];
    parent?: SelectorTree | null;
  }
  interface ElementInfo {
    tagName?: string;
    text?: string;
    content?: string;
    id?: string | null;
    className?: string | null;
    placeholder?: string | null;
    ariaLabel?: string | null;
    role?: string | null;
    type?: string | null;
    name?: string | null;
    href?: string | null;
    testId?: string | null;
    selector?: string | null;
    selectorSet?: string[] | null;
    selectorTree?: SelectorTree | null;
    xpath?: string | null;
    parentChain?: ParentChainEntry[] | null;
    parentText?: string | null;
    stableClassName?: string | null;
  }
  interface GuideStep {
    title?: string;
    description?: string;
    action_type?: string;
    expected_url?: string;
    step_number?: number;
    selector?: string;
    xpath?: string;
    element_role?: string;
    element_text?: string;
    element_info?: ElementInfo;
  }
  interface Guide {
    id?: string;
    title?: string;
    workflow_id?: string;
    workflowId?: string;
    steps?: GuideStep[];
  }
  interface RuntimeStartMessage {
    type: 'START_GUIDE';
    guide: Guide;
    startIndex?: number;
    sessionId?: string;
  }
  interface RuntimeReadyMessage {
    type: 'GUIDE_RUNTIME_READY';
    url: string;
    state: RuntimeState['type'];
    hasRunner: boolean;
    sessionId?: string | null;
  }
  interface RuntimeStepEventMessage {
    type: 'GUIDE_STEP_CHANGED';
    currentIndex: number;
    totalSteps: number;
    stepStatus: string;
    actualUrl?: string;
    sessionId?: string | null;
  }
  interface FindResult {
    element?: Element;
    rect?: AdjustedRect;
    iframeOffset?: IframeOffset;
    confidence: number;
    method: string;
    requiresManualInteraction?: boolean;
  }
  interface AdjustedRect {
    left: number; top: number; right: number; bottom: number; width: number; height: number;
  }
  type RuntimeState =
    | { type: 'idle' }
    | { type: 'booting'; sessionId: string | null }
    | { type: 'awaiting-navigation'; sessionId: string | null; currentIndex: number }
    | { type: 'searching'; sessionId: string | null; currentIndex: number; attempt: number }
    | { type: 'active'; sessionId: string | null; currentIndex: number; method: string }
    | { type: 'not-found'; sessionId: string | null; currentIndex: number }
    | { type: 'stopped' };

  interface SteptWindow extends Window {
    __steptGuideLoaded?: boolean;
    __steptGuideRunner?: GuideRunner | null;
  }

  const _window = window as unknown as SteptWindow;
  const DEDUP_EVENT = `stept_guide_remove_${chrome.runtime.id}`;
  const RUNTIME_READY_DELAY_MS = 0;
  const SEARCH_DEBOUNCE_MS = 120;
  const SEARCH_ATTEMPTS = [0, 150, 350, 750, 1500, 2500, 4000];

  const escapeHtml = (text: string): string => {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  };

  const normalizeText = (value: string | null | undefined): string =>
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

  function isProbablyVisible(element: Element): boolean {
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

  function collectSearchRoots(root: Document | ShadowRoot = document, offset: IframeOffset = { x: 0, y: 0 }): SearchRoot[] {
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

  class ElementFinder {
    static find(step: GuideStep): FindResult | null {
      const roots = collectSearchRoots();
      const candidates: FindResult[] = [];
      const selectors = unique<string>([
        ...(step.selector ? [step.selector] : []),
        ...(step.element_info?.selector ? [step.element_info.selector] : []),
        ...((step.element_info?.selectorSet || []) as string[]),
        ...((step.element_info?.selectorTree?.selectors || []) as string[]),
      ]);

      for (const selector of selectors) {
        const direct = this.findBySelector(selector, roots, 'selector');
        if (direct) candidates.push(direct);
      }

      const testId = step.element_info?.testId;
      if (testId) {
        for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-hook', 'data-e2e', 'data-automation-id']) {
          const found = this.findBySelector(`[${attr}="${CSS.escape(testId)}"]`, roots, 'test-id');
          if (found) candidates.push(found);
        }
      }

      const ariaLabel = step.element_info?.ariaLabel;
      if (ariaLabel) {
        const tag = (step.element_info?.tagName || '*').toLowerCase();
        const found = this.findBySelector(`${tag}[aria-label="${CSS.escape(ariaLabel)}"]`, roots, 'aria-label');
        if (found) candidates.push(found);
      }

      const role = step.element_role || step.element_info?.role;
      const text = step.element_text || step.element_info?.text || step.element_info?.content;
      if (role && text) {
        const found = this.findByText((root) => Array.from(root.querySelectorAll(`[role="${role}"]`)), text, roots, 'role-text');
        if (found) candidates.push(found);
      }

      if (step.element_info?.tagName && text) {
        const found = this.findByText((root) => Array.from(root.querySelectorAll(step.element_info!.tagName!)), text, roots, 'tag-text');
        if (found) candidates.push(found);
      }

      if (step.xpath || step.element_info?.xpath) {
        const found = this.findByXPath(step.xpath || step.element_info?.xpath || '', roots);
        if (found) candidates.push(found);
      }

      const contextual = this.findByContext(step, roots);
      if (contextual) candidates.push(contextual);

      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.confidence - a.confidence);
      return candidates[0] || null;
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

    private static findByText(query: (root: Document | ShadowRoot) => Element[], text: string, roots: SearchRoot[], method: string): FindResult | null {
      const expected = normalizeText(text);
      if (!expected) return null;
      for (const { root, iframeOffset } of roots) {
        const candidates = query(root)
          .filter(isProbablyVisible)
          .map((element) => ({ element, actual: normalizeText((element as HTMLElement).innerText || element.textContent || element.getAttribute('aria-label') || '') }))
          .filter(({ actual }) => actual && (actual === expected || actual.includes(expected) || expected.includes(actual)))
          .sort((a, b) => Math.abs(a.actual.length - expected.length) - Math.abs(b.actual.length - expected.length));
        if (candidates[0]) {
          return { element: candidates[0].element, confidence: candidates[0].actual === expected ? 0.86 : 0.72, method, iframeOffset };
        }
      }
      return null;
    }

    private static findByXPath(xpath: string, roots: SearchRoot[]): FindResult | null {
      for (const { root, iframeOffset } of roots) {
        try {
          const doc = root instanceof Document ? root : root.ownerDocument || document;
          const result = doc.evaluate(xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          if (result instanceof Element && isProbablyVisible(result)) {
            return { element: result, confidence: 0.64, method: 'xpath', iframeOffset };
          }
        } catch {}
      }
      return null;
    }

    private static findByContext(step: GuideStep, roots: SearchRoot[]): FindResult | null {
      const info = step.element_info;
      if (!info?.tagName) return null;
      const expectedText = normalizeText(info.text || info.content || step.element_text || '');
      const parentText = normalizeText(info.parentText || '');
      for (const { root, iframeOffset } of roots) {
        const candidates = Array.from(root.querySelectorAll(info.tagName)).filter(isProbablyVisible);
        let best: { element: Element; score: number } | null = null;
        for (const element of candidates) {
          let score = 0;
          const text = normalizeText((element as HTMLElement).innerText || element.textContent || '');
          if (expectedText && text) {
            if (text === expectedText) score += 4;
            else if (text.includes(expectedText) || expectedText.includes(text)) score += 2;
          }
          if (info.id && element.id === info.id) score += 5;
          if (info.name && element.getAttribute('name') === info.name) score += 2;
          if (info.placeholder && element.getAttribute('placeholder') === info.placeholder) score += 2;
          if (info.href && element.getAttribute('href') === info.href) score += 2;
          if (info.role && element.getAttribute('role') === info.role) score += 2;
          if (info.ariaLabel && element.getAttribute('aria-label') === info.ariaLabel) score += 3;
          if (info.stableClassName && typeof (element as HTMLElement).className === 'string') {
            const stable = normalizeText(info.stableClassName);
            if (stable && normalizeText((element as HTMLElement).className).includes(stable)) score += 1;
          }
          if (parentText && element.parentElement) {
            const actualParentText = normalizeText(element.parentElement.textContent || '');
            if (actualParentText === parentText) score += 2;
            else if (actualParentText.includes(parentText)) score += 1;
          }
          if (info.parentChain?.length) {
            let current = element.parentElement;
            for (const parent of info.parentChain) {
              if (!current) break;
              if (parent.id && current.id === parent.id) score += 2;
              if (parent.role && current.getAttribute('role') === parent.role) score += 1;
              if (parent.testId && [current.getAttribute('data-testid'), current.getAttribute('data-test')].includes(parent.testId)) score += 2;
              current = current.parentElement;
            }
          }
          if (!best || score > best.score) best = { element, score };
        }
        if (best && best.score >= 4) {
          return { element: best.element, confidence: Math.min(0.84, 0.45 + best.score * 0.05), method: 'context', iframeOffset };
        }
      }
      return null;
    }
  }

  class OverlayRenderer {
    host: HTMLElement;
    shadow: ShadowRoot;
    highlight: HTMLDivElement;
    tooltip: HTMLDivElement;

    constructor(onDone: () => void) {
      this.host = document.createElement('stept-guide-overlay');
      this.host.id = 'stept-guide-overlay-host';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = `
        :host { all: initial; }
        .guide-highlight { position: fixed; z-index: 2147483641; border: 2px solid #ff6b52; border-radius: 8px; box-shadow: 0 0 0 4px rgba(255,107,82,.12), 0 8px 24px rgba(255,107,82,.18); pointer-events:none; }
        .guide-tooltip { position: fixed; z-index: 2147483642; max-width: 340px; background: #111827; color: white; border-radius: 18px; padding: 10px 12px; display:flex; align-items:center; gap:8px; box-shadow: 0 8px 30px rgba(0,0,0,.28); font: 500 12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif; }
        .guide-dot { width: 7px; height: 7px; background:#ff6b52; border-radius:999px; flex:none; }
        .guide-text { min-width: 0; }
        .guide-text strong { display:block; font-size:12px; margin-bottom:2px; }
        .guide-text span { display:block; color: rgba(255,255,255,.82); }
        .guide-done { margin-left:auto; border:0; background: rgba(255,255,255,.12); color:white; border-radius:10px; padding: 4px 8px; font: inherit; cursor:pointer; }
      `;
      this.highlight = document.createElement('div');
      this.highlight.className = 'guide-highlight';
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'guide-tooltip';
      this.tooltip.innerHTML = `<span class="guide-dot"></span><div class="guide-text"></div><button class="guide-done" type="button">✓</button>`;
      this.tooltip.querySelector('.guide-done')?.addEventListener('click', (event) => { event.stopPropagation(); onDone(); });
      this.shadow.append(style, this.highlight, this.tooltip);
      document.documentElement.appendChild(this.host);
    }

    destroy(): void { this.host.remove(); }

    hide(): void {
      this.highlight.style.display = 'none';
      this.tooltip.style.display = 'none';
    }

    show(step: GuideStep, rect: AdjustedRect): void {
      const pad = 4;
      this.highlight.style.display = 'block';
      this.tooltip.style.display = 'flex';
      this.highlight.style.left = `${rect.left - pad}px`;
      this.highlight.style.top = `${rect.top - pad}px`;
      this.highlight.style.width = `${rect.width + pad * 2}px`;
      this.highlight.style.height = `${rect.height + pad * 2}px`;
      const text = this.tooltip.querySelector('.guide-text') as HTMLDivElement;
      const title = escapeHtml(step.title || `Step ${step.step_number || ''}`.trim() || 'Step');
      const description = escapeHtml(step.description || step.title || 'Follow this step');
      text.innerHTML = `<strong>${title}</strong><span>${description}</span>`;
      requestAnimationFrame(() => this.positionTooltip(rect));
    }

    private positionTooltip(rect: AdjustedRect): void {
      const bounds = this.tooltip.getBoundingClientRect();
      const gap = 12;
      let top = rect.bottom + gap;
      if (top + bounds.height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - bounds.height - gap);
      }
      let left = Math.min(Math.max(8, rect.left), window.innerWidth - bounds.width - 8);
      if (left < 8) left = 8;
      this.tooltip.style.top = `${top}px`;
      this.tooltip.style.left = `${left}px`;
    }
  }

  class GuideRunner {
    guide: Guide;
    steps: GuideStep[];
    currentIndex: number;
    sessionId: string | null;
    overlay: OverlayRenderer;
    state: RuntimeState;
    activeResult: FindResult | null;
    resolveTimer: number | null;
    mutationObserver: MutationObserver | null;
    positionFrame: number | null;
    clickCleanup: (() => void) | null;
    lastUrl: string;
    bootVersion: number;

    constructor() {
      this.guide = { steps: [] };
      this.steps = [];
      this.currentIndex = 0;
      this.sessionId = null;
      this.overlay = new OverlayRenderer(() => this.completeStep('manual-complete'));
      this.state = { type: 'idle' };
      this.activeResult = null;
      this.resolveTimer = null;
      this.mutationObserver = null;
      this.positionFrame = null;
      this.clickCleanup = null;
      this.lastUrl = location.href;
      this.bootVersion = 0;
    }

    start(message: RuntimeStartMessage): void {
      // Cancel any pending activateStep from a previous boot (e.g. completeStep's setTimeout)
      this.clearStepBindings();
      this.guide = message.guide || { steps: [] };
      this.steps = Array.isArray(this.guide.steps) ? this.guide.steps : [];
      this.currentIndex = Math.max(0, message.startIndex || 0);
      this.sessionId = message.sessionId || null;
      this.bootVersion += 1;
      if (!this.steps.length) {
        this.stop(false);
        return;
      }
      this.transition({ type: 'booting', sessionId: this.sessionId });
      this.activateStep(this.currentIndex, 'start');
    }

    stop(notify: boolean): void {
      this.clearStepBindings();
      this.overlay.hide();
      this.state = { type: 'stopped' };
      if (notify) chrome.runtime.sendMessage({ type: 'GUIDE_STOPPED', sessionId: this.sessionId }).catch(() => {});
    }

    private transition(next: RuntimeState): void {
      this.state = next;
      if (next.type === 'searching') {
        this.sendStepChanged('searching');
      } else if (next.type === 'active') {
        this.sendStepChanged('active');
      } else if (next.type === 'not-found') {
        this.sendStepChanged('notfound');
      } else if (next.type === 'awaiting-navigation') {
        this.sendStepChanged('url-mismatch');
      }
    }

    private activateStep(index: number, reason: string): void {
      if (index < 0 || index >= this.steps.length) {
        this.stop(true);
        return;
      }
      this.clearStepBindings();
      this.currentIndex = index;
      const step = this.steps[index];
      if (this.isNavigateLike(step)) {
        this.completeStep(`skip-${reason}`);
        return;
      }
      if (!this.urlMatchesStep(step)) {
        this.overlay.hide();
        this.transition({ type: 'awaiting-navigation', sessionId: this.sessionId, currentIndex: index });
        return;
      }
      this.installStepBindings();
      this.transition({ type: 'searching', sessionId: this.sessionId, currentIndex: index, attempt: 0 });
      this.scheduleResolve(0);
    }

    private installStepBindings(): void {
      this.lastUrl = location.href;
      this.mutationObserver = new MutationObserver(() => this.scheduleResolve(SEARCH_DEBOUNCE_MS));
      this.mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: false });
      window.addEventListener('scroll', this.handleViewportChange, true);
      window.addEventListener('resize', this.handleViewportChange, true);
    }

    private clearStepBindings(): void {
      if (this.resolveTimer != null) window.clearTimeout(this.resolveTimer);
      this.resolveTimer = null;
      if (this.mutationObserver) this.mutationObserver.disconnect();
      this.mutationObserver = null;
      window.removeEventListener('scroll', this.handleViewportChange, true);
      window.removeEventListener('resize', this.handleViewportChange, true);
      if (this.positionFrame != null) cancelAnimationFrame(this.positionFrame);
      this.positionFrame = null;
      if (this.clickCleanup) this.clickCleanup();
      this.clickCleanup = null;
      this.activeResult = null;
    }

    private scheduleResolve(delay: number): void {
      if (this.resolveTimer != null) window.clearTimeout(this.resolveTimer);
      this.resolveTimer = window.setTimeout(() => this.resolveCurrentStep(), delay);
    }

    private resolveCurrentStep(attempt: number = 0): void {
      if (this.currentIndex >= this.steps.length) return;
      const step = this.steps[this.currentIndex];
      if (!this.urlMatchesStep(step)) {
        this.transition({ type: 'awaiting-navigation', sessionId: this.sessionId, currentIndex: this.currentIndex });
        this.overlay.hide();
        return;
      }
      this.transition({ type: 'searching', sessionId: this.sessionId, currentIndex: this.currentIndex, attempt });
      const result = ElementFinder.find(step);
      if (result?.element) {
        this.attachResolvedStep(step, result);
        return;
      }
      if (attempt < SEARCH_ATTEMPTS.length - 1) {
        this.resolveTimer = window.setTimeout(() => this.resolveCurrentStep(attempt + 1), SEARCH_ATTEMPTS[attempt + 1]);
        return;
      }
      this.overlay.hide();
      this.transition({ type: 'not-found', sessionId: this.sessionId, currentIndex: this.currentIndex });
    }

    private attachResolvedStep(step: GuideStep, result: FindResult): void {
      this.activeResult = result;
      const rect = this.getAdjustedRect(result);
      this.overlay.show(step, rect);
      this.transition({ type: 'active', sessionId: this.sessionId, currentIndex: this.currentIndex, method: result.method });
      this.sendHealth(true, result.method, result.confidence);
      this.bindAdvanceIfNeeded(step, result.element!);
      this.trackPosition();
      this.scrollIntoView(result.element!);
    }

    private bindAdvanceIfNeeded(step: GuideStep, element: Element): void {
      if (this.clickCleanup) this.clickCleanup();
      const action = String(step.action_type || '').toLowerCase();
      if (!action.includes('click') && !action.includes('select')) return;
      let done = false;
      const complete = () => {
        if (done) return;
        done = true;
        this.completeStep('user-action');
      };
      const onPointerDown = () => complete();
      const onClick = () => complete();
      element.addEventListener('pointerdown', onPointerDown, { capture: true, once: true });
      element.addEventListener('click', onClick, { capture: true, once: true });
      this.clickCleanup = () => {
        element.removeEventListener('pointerdown', onPointerDown, { capture: true } as EventListenerOptions);
        element.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
      };
    }

    private completeStep(reason: string): void {
      this.sendHealth(!!this.activeResult?.element, this.activeResult?.method || reason, this.activeResult?.confidence || 0);
      const nextIndex = this.currentIndex + 1;
      if (nextIndex >= this.steps.length) {
        this.stop(true);
        return;
      }
      this.sendStepChanged('advancing');
      const boot = this.bootVersion;
      window.setTimeout(() => {
        // If start() was called (e.g. from background re-push), don't interfere
        if (this.bootVersion !== boot) return;
        this.activateStep(nextIndex, reason);
      }, 80);
    }

    private trackPosition(): void {
      if (!this.activeResult?.element) return;
      const update = () => {
        if (!this.activeResult?.element || !this.activeResult.element.isConnected) {
          this.scheduleResolve(SEARCH_DEBOUNCE_MS);
          return;
        }
        const rect = this.getAdjustedRect(this.activeResult);
        this.overlay.show(this.steps[this.currentIndex], rect);
        this.positionFrame = requestAnimationFrame(update);
      };
      this.positionFrame = requestAnimationFrame(update);
    }

    private scrollIntoView(element: Element): void {
      try { (element as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch {}
    }

    private getAdjustedRect(result: FindResult): AdjustedRect {
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

    private urlMatchesStep(step: GuideStep): boolean {
      if (!step.expected_url) return true;
      try {
        const expected = new URL(step.expected_url, location.href);
        const current = new URL(location.href);
        return expected.origin === current.origin && expected.pathname === current.pathname && expected.search === current.search;
      } catch {
        return location.href.includes(step.expected_url);
      }
    }

    private isNavigateLike(step: GuideStep): boolean {
      const action = String(step.action_type || '').toLowerCase();
      return action === 'navigate' || action === 'new-tab' || action === 'new_tab';
    }

    private sendStepChanged(stepStatus: string): void {
      const message: RuntimeStepEventMessage = {
        type: 'GUIDE_STEP_CHANGED',
        currentIndex: this.currentIndex,
        totalSteps: this.steps.length,
        stepStatus,
        actualUrl: location.href,
        sessionId: this.sessionId,
      };
      chrome.runtime.sendMessage(message).catch(() => {});
    }

    private sendHealth(elementFound: boolean, finderMethod: string, finderConfidence: number): void {
      chrome.runtime.sendMessage({
        type: 'GUIDE_STEP_HEALTH',
        workflowId: this.guide.workflow_id || this.guide.workflowId || this.guide.id,
        stepNumber: this.currentIndex + 1,
        elementFound,
        finderMethod,
        finderConfidence,
        expectedUrl: this.steps[this.currentIndex]?.expected_url,
        actualUrl: location.href,
        urlMatched: this.urlMatchesStep(this.steps[this.currentIndex]),
        timestamp: Date.now(),
        sessionId: this.sessionId,
      }).catch(() => {});
    }

    private handleViewportChange = (): void => {
      if (this.activeResult?.element) this.scheduleResolve(SEARCH_DEBOUNCE_MS);
    };
  }

  const cleanup = (): void => {
    if (_window.__steptGuideRunner) {
      _window.__steptGuideRunner.stop(false);
      _window.__steptGuideRunner.overlay.destroy();
      _window.__steptGuideRunner = null;
    }
  };

  document.dispatchEvent(new CustomEvent(DEDUP_EVENT));
  document.addEventListener(DEDUP_EVENT, cleanup);
  cleanup();
  _window.__steptGuideLoaded = true;

  if (window !== window.top) {
    chrome.runtime.onMessage.addListener((message: { type: string; step?: GuideStep }, _sender, sendResponse) => {
      if (message.type !== 'GUIDE_FIND_IN_FRAME' || !message.step) return false;
      const found = ElementFinder.find(message.step);
      if (!found?.element) {
        sendResponse({ found: false });
        return false;
      }
      const rect = found.element.getBoundingClientRect();
      sendResponse({ found: true, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, confidence: found.confidence, method: found.method });
      return false;
    });
    return;
  }

  const runner = new GuideRunner();
  _window.__steptGuideRunner = runner;

  const announceReady = (): void => {
    const message: RuntimeReadyMessage = {
      type: 'GUIDE_RUNTIME_READY',
      url: location.href,
      state: runner.state.type,
      hasRunner: true,
      sessionId: runner.sessionId,
    };
    chrome.runtime.sendMessage(message).catch(() => {});
  };

  chrome.runtime.onMessage.addListener((message: RuntimeStartMessage | { type: string; stepIndex?: number }, _sender, sendResponse) => {
    if (message.type === 'START_GUIDE') {
      runner.start(message as RuntimeStartMessage);
      sendResponse({ success: true, sessionId: runner.sessionId });
      return false;
    }
    if (message.type === 'PING') {
      sendResponse({ pong: true, state: runner.state.type, sessionId: runner.sessionId });
      return false;
    }
    if (message.type === 'STOP_GUIDE') {
      runner.stop(false);
      sendResponse({ success: true });
      return false;
    }
    return false;
  });

  window.setTimeout(announceReady, RUNTIME_READY_DELAY_MS);
})();
