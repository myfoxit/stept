/**
 * Stept Interactive Guide Runtime
 * Renders a step-by-step guided overlay on the page, highlighting elements
 * with tooltips and navigation controls.
 *
 * Injected on demand via chrome.scripting.executeScript from background.js.
 */
(function () {
  "use strict";

  // Allow re-injection: clean up previous instance without triggering GUIDE_STOPPED
  if (window.__steptGuideRunner) {
    try {
      window.__steptGuideRunner._replacing = true;
      window.__steptGuideRunner.stop();
    } catch {}
  }
  window.__steptGuideLoaded = true;

  // ── CSS Zoom Compensation ─────────────────────────────────────────

  function getPageZoom() {
    let zoom = 1;
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      const z = getComputedStyle(el).zoom;
      if (z && z !== "normal") {
        const n = parseFloat(z);
        if (!isNaN(n) && n > 0) zoom *= n;
      }
    }
    return zoom;
  }

  // ── Searchable Roots (document + shadow roots + same-origin iframes) ──

  function collectSearchRoots(root = document, depth = 0) {
    // Returns array of { root: Document|ShadowRoot, iframeOffset: {x,y} }
    const results = [{ root, iframeOffset: { x: 0, y: 0 }, depth }];
    if (depth > 5) return results; // prevent infinite recursion

    try {
      // Traverse shadow roots
      root.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot && el.id !== "stept-guide-overlay") {
          results.push(...collectSearchRoots(el.shadowRoot, depth + 1).map((r) => ({
            ...r,
            iframeOffset: results[0].iframeOffset, // same offset as parent
          })));
        }
      });

      // Traverse same-origin iframes
      root.querySelectorAll("iframe").forEach((iframe) => {
        try {
          const doc = iframe.contentDocument;
          if (!doc) return; // cross-origin or not loaded
          const iframeRect = iframe.getBoundingClientRect();
          const parentOffset = results[0].iframeOffset;
          const offset = {
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

  function safeQuerySelector(root, selector) {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const win = el.ownerDocument?.defaultView || window;
    const style = win.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function findByText(candidates, text, opts = {}) {
    if (!text || !candidates.length) return null;
    const target = text.trim().toLowerCase();
    let best = null;
    let bestScore = Infinity;

    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const elText = (el.textContent || "").trim().toLowerCase();
      if (elText === target) return el;
      if (opts.fuzzy && elText.includes(target)) {
        const score = Math.abs(elText.length - target.length);
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
    }
    return best;
  }

  // Search a single root for the step's element using all strategies
  function findInRoot(root, step) {
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
        const result = root.evaluate(step.xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const el = result.singleNodeValue;
        if (el && isVisible(el)) return { element: el, confidence: 0.6, method: "xpath" };
      } catch {}
    }

    // Parent chain context
    if (step.element_info?.parentChain?.length) {
      const chain = step.element_info.parentChain;
      for (const ancestor of chain) {
        let container = null;
        if (ancestor.id) {
          container = root.getElementById ? root.getElementById(ancestor.id) : root.querySelector(`#${CSS.escape(ancestor.id)}`);
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

    return null;
  }

  // ── Cross-origin iframe child frame mode (Feature 4) ──────────────
  if (window !== window.top) {
    // Running inside a child frame — only listen for element search requests
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'GUIDE_FIND_IN_FRAME') {
        const result = findInRoot(document, message.step);
        if (result) {
          const rect = result.element.getBoundingClientRect();
          let frameRect = null;
          try { frameRect = self.frameElement?.getBoundingClientRect(); } catch {}
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
  async function findGuideElement(step) {
    const searchRoots = collectSearchRoots();

    let bestResult = null;

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
        const [activeTab] = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
        if (activeTab?.id) {
          const resp = await chrome.runtime.sendMessage({
            type: 'GUIDE_FIND_IN_FRAMES',
            step,
            tabId: activeTab.id,
          });
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

  function isObstructed(el) {
    if (!el || !el.getBoundingClientRect) return null;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(centerX, centerY);
    if (!topEl) return null;
    if (topEl === el || el.contains(topEl)) return null;
    // Check if it's part of our overlay
    let node = topEl;
    while (node) {
      if (node.tagName && node.tagName.toLowerCase() === 'stept-guide-overlay') return null;
      node = node.parentElement;
    }
    return topEl;
  }

  // ── Intermediate Action Detection (Feature 8) ───────────────────

  function needsIntermediateAction(el) {
    let node = el.parentElement;
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

  function describeElement(el) {
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
      color: #E7E5E4;
    }

    .guide-backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483640;
      pointer-events: none;
    }

    .guide-backdrop-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      transition: clip-path 0.3s ease;
      pointer-events: none;
    }

    .guide-highlight {
      position: fixed;
      z-index: 2147483641;
      border: 2px solid #3AB08A;
      border-radius: 6px;
      box-shadow: 0 0 0 4px rgba(58, 176, 138, 0.25);
      pointer-events: none;
      transition: all 0.3s ease;
      animation: guide-pulse 2s ease-in-out infinite;
    }

    @keyframes guide-pulse {
      0%, 100% { box-shadow: 0 0 0 4px rgba(58, 176, 138, 0.25); }
      50% { box-shadow: 0 0 0 8px rgba(58, 176, 138, 0.15); }
    }

    .guide-tooltip {
      position: fixed;
      z-index: 2147483642;
      background: #1C1917;
      border: 1px solid #292524;
      border-radius: 12px;
      padding: 16px;
      max-width: 320px;
      min-width: 240px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      pointer-events: auto;
      animation: guide-tooltip-in 0.25s ease-out;
    }

    @keyframes guide-tooltip-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .guide-tooltip-title {
      font-size: 15px;
      font-weight: 600;
      color: #FAFAF9;
      margin: 0 0 6px 0;
      line-height: 1.3;
    }

    .guide-tooltip-desc {
      font-size: 13px;
      color: #A8A29E;
      margin: 0 0 14px 0;
      line-height: 1.5;
    }

    .guide-tooltip-progress {
      font-size: 11px;
      color: #78716C;
      margin-bottom: 12px;
    }

    .guide-tooltip-progress-bar {
      height: 3px;
      background: #292524;
      border-radius: 2px;
      margin-top: 6px;
      overflow: hidden;
    }

    .guide-tooltip-progress-fill {
      height: 100%;
      background: #3AB08A;
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
      background: #3AB08A;
      color: #fff;
    }

    .guide-btn-secondary {
      background: #292524;
      color: #D6D3D1;
    }

    .guide-btn-ghost {
      background: transparent;
      color: #78716C;
      padding: 8px 8px;
    }

    .guide-btn-ghost:hover { color: #D6D3D1; }

    .guide-spacer { flex: 1; }

    .guide-close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      color: #78716C;
      cursor: pointer;
      padding: 4px;
      line-height: 1;
      font-size: 18px;
      border-radius: 4px;
    }

    .guide-close-btn:hover { color: #D6D3D1; background: #292524; }

    .guide-btn-done {
      background: #059669;
      color: #fff;
    }

    .guide-obstruction-warning {
      background: #451A03;
      border: 1px solid #92400E;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #FDE68A;
      line-height: 1.4;
    }

    .guide-intermediate-hint {
      background: #1E1B4B;
      border: 1px solid #3730A3;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #C7D2FE;
      line-height: 1.4;
    }

    .guide-url-warning {
      background: #451A03;
      border: 1px solid #78350F;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #FDE68A;
      line-height: 1.4;
    }

    .guide-navigate-btn {
      display: inline-block;
      margin-top: 8px;
      padding: 6px 12px;
      background: #78350F;
      color: #FDE68A;
      border: 1px solid #92400E;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s ease;
    }

    .guide-navigate-btn:hover {
      background: #92400E;
    }

    .guide-not-found {
      background: #1C1917;
      border: 1px solid #292524;
      border-radius: 12px;
      padding: 20px;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2147483642;
      text-align: center;
      max-width: 300px;
      pointer-events: auto;
      animation: guide-tooltip-in 0.25s ease-out;
    }

    .guide-not-found-title {
      font-size: 15px;
      font-weight: 600;
      color: #FAFAF9;
      margin-bottom: 8px;
    }

    .guide-not-found-desc {
      font-size: 13px;
      color: #A8A29E;
      margin-bottom: 14px;
    }

    .guide-roadblock-icon {
      font-size: 28px;
      margin-bottom: 8px;
    }

    .guide-roadblock-step-title {
      font-size: 13px;
      font-weight: 500;
      color: #D6D3D1;
      margin-bottom: 10px;
      padding: 8px 12px;
      background: #292524;
      border-radius: 6px;
    }
  `;

  // ── Guide Runner ──────────────────────────────────────────────────

  class GuideRunner {
    constructor(guide) {
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
      this._backdrop = null;
      this._overlay = null;
      this._highlight = null;
      this._tooltip = null;
      this._notFoundPanel = null;
    }

    async start() {
      this._createHost();
      if (this.steps.length === 0) {
        this._showEmpty();
        return;
      }
      await this.showStep(0);
    }

    stop() {
      this._clearPositionTracking();
      this._removeClickHandler();
      this._disconnectCompletionObserver();
      if (this.host) {
        this.host.remove();
        this.host = null;
        this.shadow = null;
      }
      this._backdrop = null;
      this._overlay = null;
      this._highlight = null;
      this._tooltip = null;
      this._notFoundPanel = null;
      activeRunner = null;
      // Only notify background if this is a user-initiated stop (not a replacement)
      if (!this._replacing) {
        chrome.runtime.sendMessage({ type: 'GUIDE_STOPPED' }).catch(() => {});
      }
    }

    _createHost() {
      this.host = document.createElement("stept-guide-overlay");
      this.shadow = this.host.attachShadow({ mode: "closed" });

      const style = document.createElement("style");
      style.textContent = STYLES;
      this.shadow.appendChild(style);

      document.documentElement.appendChild(this.host);
    }

    _clearOverlay() {
      this._clearPositionTracking();
      this._removeClickHandler();
      this._disconnectCompletionObserver();
      // Remove all overlay elements to prevent artifacts across navigations
      if (this._highlight) { this._highlight.remove(); this._highlight = null; }
      if (this._tooltip) { this._tooltip.remove(); this._tooltip = null; }
      if (this._backdrop) { this._backdrop.remove(); this._backdrop = null; this._overlay = null; }
      if (this._notFoundPanel) { this._notFoundPanel.remove(); this._notFoundPanel = null; }
      if (this._intermediatePanel) { this._intermediatePanel.remove(); this._intermediatePanel = null; }
    }

    async showStep(index) {
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
        await new Promise((r) => setTimeout(r, 300));
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

      // Find element with retry (more attempts, longer waits for freshly loaded pages)
      let result = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (this._stepSeq !== seq) return; // another showStep started, abort
        result = await findGuideElement(step);
        if (result) break;
        await new Promise((r) => setTimeout(r, attempt < 2 ? 800 : 1500));
      }
      if (this._stepSeq !== seq) return; // abort if superseded

      this.currentResult = result;

      // ── Staleness Detection: report step health ──
      try {
        chrome.runtime.sendMessage({
          type: 'GUIDE_STEP_HEALTH',
          workflowId: this.guide.workflow_id || this.guide.workflowId || this.guide.id,
          stepNumber: index,
          elementFound: !!result,
          finderMethod: result?.method || null,
          finderConfidence: result?.confidence || 0,
          expectedUrl: step.expected_url || step.url || null,
          actualUrl: window.location.href,
          urlMatched: !(step.expected_url || step.url) || (() => {
            try {
              const exp = new URL(step.expected_url || step.url);
              const act = new URL(window.location.href);
              return exp.pathname === act.pathname;
            } catch { return false; }
          })(),
          timestamp: Date.now(),
        }).catch(() => {});
      } catch (_) { /* never break guide playback */ }

      // Determine step status for sidepanel
      let stepStatus = 'active';
      if (!result) stepStatus = 'notfound';

      // Notify background of step change
      chrome.runtime.sendMessage({
        type: 'GUIDE_STEP_CHANGED',
        currentIndex: index,
        totalSteps: this.steps.length,
        stepStatus,
      }).catch(() => {});

      if (result) {
        // Feature 8: Check if element needs intermediate action (hidden ancestor)
        const intermediateAncestor = needsIntermediateAction(result.element);
        if (intermediateAncestor) {
          chrome.runtime.sendMessage({
            type: 'GUIDE_STEP_CHANGED',
            currentIndex: index,
            totalSteps: this.steps.length,
            stepStatus: 'intermediate',
          }).catch(() => {});
          this._renderIntermediateHint(step, intermediateAncestor, urlMismatch);
          return;
        }

        // Feature 3: Check if element is obstructed
        const obstructor = isObstructed(result.element);

        this._scrollToElement(result);
        await new Promise((r) => setTimeout(r, 100)); // wait for scroll
        this._renderOverlay(step, result, urlMismatch, obstructor);
        this._startPositionTracking(step, result);
        this._setupClickAdvance(result.element, step);
        this._setupCompletionDetection(result.element, step);
      } else {
        this._renderNotFound(step, urlMismatch);
      }
    }

    _scrollToElement(result) {
      // Use adjusted rect (accounts for iframe offset) to check visibility
      const rect = this._getAdjustedRect(result);
      const inView = rect.top >= 0 && rect.bottom <= window.innerHeight
        && rect.left >= 0 && rect.right <= window.innerWidth;
      if (!inView) {
        result.element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    }

    // Get the element rect in top-frame coordinates (accounting for iframe offset + zoom)
    _getAdjustedRect(result) {
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

    _renderOverlay(step, result, urlMismatch, obstructor) {
      const rect = this._getAdjustedRect(result);
      const pad = 6;

      // Create or update backdrop with cutout (in-place)
      if (!this._backdrop) {
        this._backdrop = document.createElement("div");
        this._backdrop.className = "guide-backdrop";
        this._overlay = document.createElement("div");
        this._overlay.className = "guide-backdrop-overlay";
        this._backdrop.appendChild(this._overlay);
        this.shadow.appendChild(this._backdrop);
      }
      this._updateCutout(this._overlay, rect, pad);

      // Create or update highlight ring (in-place)
      if (!this._highlight) {
        this._highlight = document.createElement("div");
        this._highlight.className = "guide-highlight";
        this.shadow.appendChild(this._highlight);
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
      this.shadow.appendChild(this._tooltip);
      this._positionTooltip(this._tooltip, rect);
    }

    _updateCutout(overlay, rect, pad) {
      const x = rect.left - pad;
      const y = rect.top - pad;
      const w = rect.width + pad * 2;
      const h = rect.height + pad * 2;
      const r = 6;
      // Inset clip-path: full screen with a rounded rectangle cutout
      overlay.style.clipPath = `polygon(
        0% 0%, 0% 100%, ${x}px 100%, ${x}px ${y}px,
        ${x + w}px ${y}px, ${x + w}px ${y + h}px,
        ${x}px ${y + h}px, ${x}px 100%, 100% 100%, 100% 0%
      )`;
    }

    _createTooltip(step, urlMismatch, obstructor) {
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
        tooltip.addEventListener(evt, (e) => e.stopPropagation());
      }

      // Wire up action buttons
      tooltip.addEventListener("click", (e) => {
        const action = e.target.closest("[data-action]")?.dataset.action;
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
            const step = this.steps[this.currentIndex];
            if (step.expected_url) {
              chrome.runtime.sendMessage({
                type: 'GUIDE_NAVIGATE',
                url: step.expected_url,
                stepIndex: this.currentIndex,
              });
            }
            break;
          }
        }
      });

      return tooltip;
    }

    _positionTooltip(tooltip, rect) {
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

        let top, left;

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

    _renderNotFound(step, urlMismatch) {
      const idx = this.currentIndex;
      const total = this.steps.length;

      // Show backdrop without cutout
      if (!this._backdrop) {
        this._backdrop = document.createElement("div");
        this._backdrop.className = "guide-backdrop";
        this._overlay = document.createElement("div");
        this._overlay.className = "guide-backdrop-overlay";
        this._backdrop.appendChild(this._overlay);
        this.shadow.appendChild(this._backdrop);
      }
      this._overlay.style.clipPath = "none";

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
        panel.addEventListener(evt, (e) => e.stopPropagation());
      }

      panel.addEventListener("click", (e) => {
        const action = e.target.closest("[data-action]")?.dataset.action;
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
            const step = this.steps[this.currentIndex];
            if (step.expected_url) {
              chrome.runtime.sendMessage({
                type: 'GUIDE_NAVIGATE',
                url: step.expected_url,
                stepIndex: this.currentIndex,
              });
            }
            break;
          }
        }
      });

      this._notFoundPanel = panel;
      this.shadow.appendChild(panel);
    }

    _renderRoadblock(step) {
      const idx = this.currentIndex;
      const total = this.steps.length;

      // Show backdrop without cutout
      if (!this._backdrop) {
        this._backdrop = document.createElement("div");
        this._backdrop.className = "guide-backdrop";
        this._overlay = document.createElement("div");
        this._overlay.className = "guide-backdrop-overlay";
        this._backdrop.appendChild(this._overlay);
        this.shadow.appendChild(this._backdrop);
      }
      this._overlay.style.clipPath = "none";

      const panel = document.createElement("div");
      panel.className = "guide-not-found";

      panel.innerHTML = `
        <div class="guide-roadblock-icon">⚠</div>
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
        panel.addEventListener(evt, (e) => e.stopPropagation());
      }

      panel.addEventListener("click", (e) => {
        const action = e.target.closest("[data-action]")?.dataset.action;
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
      this.shadow.appendChild(panel);
    }

    _showEmpty() {
      this._clearOverlay();
      const panel = document.createElement("div");
      panel.className = "guide-not-found";
      panel.innerHTML = `
        <div class="guide-not-found-title">No steps in this guide</div>
        <div class="guide-not-found-desc">This guide has no steps to display.</div>
        <button class="guide-btn guide-btn-primary" data-action="close">Close</button>
      `;
      panel.addEventListener("click", (e) => {
        if (e.target.closest("[data-action=close]")) this.stop();
      });
      this.shadow.appendChild(panel);
    }

    _startPositionTracking(step, result) {
      this.positionInterval = setInterval(() => {
        if (!result.element || !result.element.isConnected) {
          // Element removed from DOM — try to re-find
          findGuideElement(step).then((newResult) => {
            if (newResult) {
              this.currentResult = newResult;
              result = newResult;
            }
          });
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
        if (this._overlay) {
          this._updateCutout(this._overlay, rect, pad);
        }
        if (this._tooltip) {
          this._positionTooltip(this._tooltip, rect);
        }
      }, 200);
    }

    _clearPositionTracking() {
      if (this.positionInterval) {
        clearInterval(this.positionInterval);
        this.positionInterval = null;
      }
    }

    _setupClickAdvance(element, step) {
      // For click steps: advance when user clicks the target element
      const isClickStep = step.action_type && step.action_type.toLowerCase().includes("click");
      if (!isClickStep) return;

      const advance = () => {
        this._removeClickHandler();
        if (this.currentIndex >= this.steps.length - 1) {
          this.stop();
        } else {
          setTimeout(() => this.showStep(this.currentIndex + 1), 400);
        }
      };

      // Handler directly on the target element (clicks in the cutout go to the page element)
      this._clickHandler = (e) => advance();
      element.addEventListener("click", this._clickHandler, { once: true });
      this._clickElement = element;

      // Also listen on parent in case the exact element gets replaced (SPAs)
      if (element.parentElement) {
        this._parentClickHandler = (e) => {
          if (e.target === element || element.contains(e.target)) {
            advance();
          }
        };
        element.parentElement.addEventListener("click", this._parentClickHandler, { once: true });
        this._clickParent = element.parentElement;
      }
    }

    _removeClickHandler() {
      if (this._clickHandler && this._clickElement) {
        this._clickElement.removeEventListener("click", this._clickHandler);
        this._clickHandler = null;
        this._clickElement = null;
      }
      if (this._parentClickHandler && this._clickParent) {
        this._clickParent.removeEventListener("click", this._parentClickHandler);
        this._parentClickHandler = null;
        this._clickParent = null;
      }
    }

    // Feature 5: Completion detection via MutationObserver and event listeners
    _setupCompletionDetection(element, step) {
      const actionType = (step.action_type || '').toLowerCase();
      const advance = () => {
        this._disconnectCompletionObserver();
        if (this.currentIndex >= this.steps.length - 1) {
          this.stop();
        } else {
          this.showStep(this.currentIndex + 1);
        }
      };

      if (actionType.includes('type')) {
        // Watch for value changes on input/textarea
        const onInput = () => {
          // Show subtle completion indicator then auto-advance
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
          clearTimeout(this._completionTimeout);
          this._completionTimeout = setTimeout(advance, 1500);
        };
        element.addEventListener('input', onInput);
        this._completionCleanup = () => element.removeEventListener('input', onInput);
      } else if (actionType.includes('click')) {
        // Watch for element removal from DOM after click (e.g. dropdown closing)
        if (element.parentElement) {
          this._completionObserver = new MutationObserver((mutations) => {
            if (!element.isConnected) {
              setTimeout(advance, 400);
            }
          });
          this._completionObserver.observe(element.parentElement, { childList: true, subtree: true });
        }
      } else if (actionType.includes('select')) {
        const onChange = () => {
          setTimeout(advance, 500);
        };
        element.addEventListener('change', onChange, { once: true });
        this._completionCleanup = () => element.removeEventListener('change', onChange);
      }
      // Navigate steps are auto-skipped — no detection needed
    }

    _disconnectCompletionObserver() {
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
    _renderIntermediateHint(step, ancestor, urlMismatch) {
      const idx = this.currentIndex;
      const total = this.steps.length;

      // Show backdrop without cutout
      if (!this._backdrop) {
        this._backdrop = document.createElement("div");
        this._backdrop.className = "guide-backdrop";
        this._overlay = document.createElement("div");
        this._overlay.className = "guide-backdrop-overlay";
        this._backdrop.appendChild(this._overlay);
        this.shadow.appendChild(this._backdrop);
      }

      // Try to highlight the ancestor if it's visible
      const ancestorRect = ancestor.getBoundingClientRect();
      if (ancestorRect.width > 0 && ancestorRect.height > 0) {
        const zoom = getPageZoom();
        const rect = {
          left: ancestorRect.left * zoom, top: ancestorRect.top * zoom,
          right: ancestorRect.right * zoom, bottom: ancestorRect.bottom * zoom,
          width: ancestorRect.width * zoom, height: ancestorRect.height * zoom,
        };
        const pad = 6;
        this._updateCutout(this._overlay, rect, pad);
        if (!this._highlight) {
          this._highlight = document.createElement("div");
          this._highlight.className = "guide-highlight";
          this.shadow.appendChild(this._highlight);
        }
        this._highlight.style.display = "";
        this._highlight.style.borderColor = "#6366F1";
        this._highlight.style.boxShadow = "0 0 0 4px rgba(99, 102, 241, 0.25)";
        this._highlight.style.left = `${rect.left - pad}px`;
        this._highlight.style.top = `${rect.top - pad}px`;
        this._highlight.style.width = `${rect.width + pad * 2}px`;
        this._highlight.style.height = `${rect.height + pad * 2}px`;
      } else {
        this._overlay.style.clipPath = "none";
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
        panel.addEventListener(evt, (e) => e.stopPropagation());
      }

      panel.addEventListener("click", (e) => {
        const action = e.target.closest("[data-action]")?.dataset.action;
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
      this.shadow.appendChild(panel);
    }

    _esc(text) {
      if (!text) return "";
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // ── Active Runner Singleton ───────────────────────────────────────

  let activeRunner = null;
  window.__steptGuideRunner = null;

  // ── Message Handling ──────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "START_GUIDE") {
      try {
        if (activeRunner) {
          activeRunner._replacing = true; // don't send GUIDE_STOPPED
          activeRunner.stop();
        }
        const runner = new GuideRunner(message.guide);
        activeRunner = runner;
        window.__steptGuideRunner = runner;
        if (typeof message.startIndex === "number" && message.startIndex > 0) {
          runner.start().then(() => runner.showStep(message.startIndex));
        } else {
          runner.start();
        }
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    } else if (message.type === "STOP_GUIDE") {
      if (activeRunner) activeRunner.stop();
      sendResponse({ success: true });
    }
    return false;
  });
})();
