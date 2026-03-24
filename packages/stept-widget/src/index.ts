/**
 * Stept Embeddable Widget
 * 
 * Add interactive guides to any web app with one script tag:
 * <script src="https://your-stept.com/widget/stept-widget.js" 
 *         data-project="proj_xxx" data-api-key="pk_xxx" async></script>
 *
 * The widget:
 * 1. Fetches guide configuration from the stept API
 * 2. Monitors URL changes and element visibility for trigger rules
 * 3. Shows guides, tooltips, beacons, checklists, and announcements
 * 4. Reports analytics events back to the API
 * 5. All UI is Shadow DOM isolated — won't affect host page styles
 */

// ── Types ────────────────────────────────────────────────────────

interface SteptConfig {
  projectId: string;
  apiKey: string;
  apiBase: string;
  userId?: string;
  userAttributes?: Record<string, string>;
}

interface GuideConfig {
  id: string;
  name: string;
  trigger: TriggerRule;
  steps: GuideStep[];
  audience?: AudienceRule;
  frequency?: string;
  priority?: number;
}

interface GuideStep {
  selector?: string;
  selectorSet?: string[];
  element_info?: Record<string, any>;
  element_role?: string;
  element_text?: string;
  xpath?: string;
  title?: string;
  description?: string;
  action_type?: string;
  expected_url?: string;
  url?: string;
}

interface TriggerRule {
  type: 'url_match' | 'element_visible' | 'manual' | 'auto';
  pattern?: string;
  elementSelector?: string;
  delay?: number;
}

interface AudienceRule {
  roles?: string[];
  attributes?: Record<string, string>;
}

interface TooltipConfig {
  id: string;
  targetSelector: string;
  content: string;
  trigger: 'hover' | 'visible' | 'manual';
}

interface BeaconConfig {
  id: string;
  targetSelector: string;
  tooltip?: string;
  guideId?: string;
  color?: string;
  dismissKey?: string;
}

interface ChecklistConfig {
  id: string;
  title: string;
  tasks: { label: string; guideId?: string; completed?: boolean }[];
  position?: string;
}

interface AnnouncementConfig {
  id: string;
  title: string;
  body: string;
  cta?: { label: string; guideId?: string; url?: string };
  dismissKey?: string;
  image?: string;
}

interface WidgetConfig {
  guides: GuideConfig[];
  tooltips: TooltipConfig[];
  beacons: BeaconConfig[];
  checklists: ChecklistConfig[];
  announcements: AnnouncementConfig[];
  helpWidget?: { enabled: boolean; position: string; placeholder: string };
  settings?: { theme: string; accentColor: string; zIndex: number };
}

interface AnalyticsEvent {
  type: string;
  guideId?: string;
  stepIndex?: number;
  widgetId?: string;
  data?: Record<string, any>;
  timestamp: number;
  sessionId: string;
  userId?: string;
  pageUrl: string;
}

// ── Constants ────────────────────────────────────────────────────

const STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    color: #E7E5E4;
  }

  .stept-guide-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483640;
    pointer-events: none;
  }

  .stept-guide-backdrop-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    transition: clip-path 0.3s ease;
    pointer-events: none;
  }

  .stept-guide-highlight {
    position: fixed;
    z-index: 2147483641;
    border: 3px solid #3AB08A;
    border-radius: 6px;
    box-shadow: 0 0 0 6px rgba(58, 176, 138, 0.25);
    pointer-events: none;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    animation: stept-pulse 2s ease-in-out infinite;
  }

  @keyframes stept-pulse {
    0%, 100% { box-shadow: 0 0 0 6px rgba(58, 176, 138, 0.25); }
    50% { box-shadow: 0 0 0 12px rgba(58, 176, 138, 0.10); }
  }

  .stept-tooltip {
    position: fixed;
    z-index: 2147483642;
    background: #1C1917;
    border: 1px solid #292524;
    border-radius: 14px;
    padding: 16px;
    max-width: 340px;
    min-width: 240px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05);
    pointer-events: auto;
    animation: stept-in 0.25s ease-out;
  }

  @keyframes stept-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .stept-tooltip-title {
    font-size: 15px;
    font-weight: 600;
    color: #FAFAF9;
    margin: 0 0 6px 0;
    line-height: 1.3;
  }

  .stept-tooltip-desc {
    font-size: 13px;
    color: #A8A29E;
    margin: 0 0 14px 0;
    line-height: 1.5;
  }

  .stept-progress {
    font-size: 12px;
    font-weight: 500;
    color: #78716C;
    margin-bottom: 4px;
  }

  .stept-progress-bar {
    height: 3px;
    background: #292524;
    border-radius: 2px;
    margin-bottom: 8px;
    overflow: hidden;
  }

  .stept-progress-fill {
    height: 100%;
    background: #3AB08A;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .stept-dots {
    display: flex;
    gap: 4px;
    margin-bottom: 12px;
    justify-content: center;
  }

  .stept-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #44403C;
    transition: all 0.2s ease;
  }

  .stept-dot-done { background: #3AB08A; }
  .stept-dot-current { background: #3AB08A; transform: scale(1.3); }

  .stept-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stept-btn {
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

  .stept-btn:hover { filter: brightness(1.1); }
  .stept-btn:active { transform: scale(0.97); }

  .stept-btn-primary { background: #3AB08A; color: #fff; }
  .stept-btn-secondary { background: #292524; color: #D6D3D1; }
  .stept-btn-ghost { background: transparent; color: #78716C; padding: 8px; }
  .stept-btn-ghost:hover { color: #D6D3D1; }

  .stept-spacer { flex: 1; }

  .stept-close {
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    color: #78716C;
    cursor: pointer;
    padding: 6px;
    line-height: 1;
    font-size: 20px;
    border-radius: 6px;
  }

  .stept-close:hover { color: #D6D3D1; background: #292524; }

  /* Beacon */
  .stept-beacon {
    position: fixed;
    z-index: 2147483639;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #3AB08A;
    cursor: pointer;
    animation: stept-beacon-pulse 2s ease-in-out infinite;
    pointer-events: auto;
  }

  @keyframes stept-beacon-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(58, 176, 138, 0.4); }
    50% { box-shadow: 0 0 0 10px rgba(58, 176, 138, 0); }
  }

  /* Help Widget */
  .stept-help-btn {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483638;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #3AB08A;
    color: white;
    border: none;
    cursor: pointer;
    font-size: 20px;
    font-weight: bold;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    transition: transform 0.2s ease;
    pointer-events: auto;
  }

  .stept-help-btn:hover { transform: scale(1.1); }

  .stept-help-panel {
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 2147483639;
    width: 320px;
    max-height: 400px;
    background: #1C1917;
    border: 1px solid #292524;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: stept-in 0.2s ease-out;
    pointer-events: auto;
  }

  .stept-help-search {
    padding: 12px;
    border-bottom: 1px solid #292524;
  }

  .stept-help-input {
    width: 100%;
    background: #292524;
    border: 1px solid #44403C;
    border-radius: 8px;
    padding: 8px 12px;
    color: #FAFAF9;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
  }

  .stept-help-input:focus { border-color: #3AB08A; }

  .stept-help-results {
    max-height: 300px;
    overflow-y: auto;
    padding: 8px;
  }

  .stept-help-item {
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    color: #D6D3D1;
    font-size: 13px;
    transition: background 0.1s;
  }

  .stept-help-item:hover { background: #292524; }

  .stept-help-item-title {
    font-weight: 500;
    margin-bottom: 2px;
  }

  .stept-help-item-desc {
    font-size: 12px;
    color: #78716C;
  }

  .stept-help-empty {
    padding: 20px;
    text-align: center;
    color: #78716C;
    font-size: 13px;
  }

  /* Checklist */
  .stept-checklist {
    position: fixed;
    bottom: 20px;
    right: 80px;
    z-index: 2147483638;
    width: 280px;
    background: #1C1917;
    border: 1px solid #292524;
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    pointer-events: auto;
    animation: stept-in 0.2s ease-out;
  }

  .stept-checklist-header {
    padding: 14px 16px;
    border-bottom: 1px solid #292524;
    font-weight: 600;
    color: #FAFAF9;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stept-checklist-progress {
    font-size: 12px;
    color: #3AB08A;
    font-weight: 500;
  }

  .stept-checklist-items {
    padding: 8px;
  }

  .stept-checklist-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    color: #D6D3D1;
    font-size: 13px;
    transition: background 0.1s;
  }

  .stept-checklist-item:hover { background: #292524; }

  .stept-checklist-check {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid #44403C;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .stept-checklist-check-done {
    background: #3AB08A;
    border-color: #3AB08A;
    color: white;
    font-size: 11px;
  }

  /* Announcement */
  .stept-announcement-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 2147483643;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    animation: stept-fade-in 0.2s ease;
  }

  @keyframes stept-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .stept-announcement {
    background: #1C1917;
    border: 1px solid #292524;
    border-radius: 16px;
    padding: 24px;
    max-width: 420px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: stept-in 0.3s ease-out;
  }

  .stept-announcement-title {
    font-size: 18px;
    font-weight: 700;
    color: #FAFAF9;
    margin: 0 0 8px 0;
  }

  .stept-announcement-body {
    font-size: 14px;
    color: #A8A29E;
    line-height: 1.6;
    margin: 0 0 16px 0;
  }

  .stept-announcement-img {
    width: 100%;
    border-radius: 10px;
    margin-bottom: 16px;
  }
`;

// ── Analytics ────────────────────────────────────────────────────

class AnalyticsCollector {
  private queue: AnalyticsEvent[] = [];
  private config: SteptConfig;
  private sessionId: string;

  constructor(config: SteptConfig) {
    this.config = config;
    this.sessionId = this.generateId();

    // Flush on unload
    window.addEventListener('beforeunload', () => this.flush());
    // Flush every 5 seconds
    setInterval(() => this.flush(), 5000);
  }

  track(type: string, data?: Partial<AnalyticsEvent>) {
    this.queue.push({
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.config.userId,
      pageUrl: window.location.href,
      ...data,
    });
    if (this.queue.length >= 20) this.flush();
  }

  flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    const body = JSON.stringify(batch);
    // Use sendBeacon for reliability on page unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${this.config.apiBase}/api/v1/widget/events`, body);
    } else {
      fetch(`${this.config.apiBase}/api/v1/widget/events`, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': this.config.apiKey },
        keepalive: true,
      }).catch(() => {});
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }
}

// ── Element Finder (portable version of guide-runtime finder) ────

function findElement(step: GuideStep): Element | null {
  // Try selectorSet first (most reliable)
  if (step.selectorSet && step.selectorSet.length > 0) {
    for (const sel of step.selectorSet) {
      try {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) return el;
      } catch {}
    }
  }

  // Primary selector
  if (step.selector) {
    try {
      const el = document.querySelector(step.selector);
      if (el && isVisible(el)) return el;
    } catch {}
  }

  // testid
  const testId = step.element_info?.testId;
  if (testId) {
    for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-qa']) {
      try {
        const el = document.querySelector(`[${attr}="${testId}"]`);
        if (el && isVisible(el)) return el;
      } catch {}
    }
  }

  // ARIA role + text
  if (step.element_role && step.element_text) {
    const candidates = document.querySelectorAll(`[role="${step.element_role}"]`);
    for (const el of candidates) {
      if (isVisible(el) && textMatches(el, step.element_text)) return el;
    }
  }

  // Tag + text
  if (step.element_info?.tagName && step.element_text) {
    const candidates = document.querySelectorAll(step.element_info.tagName);
    for (const el of candidates) {
      if (isVisible(el) && textMatches(el, step.element_text)) return el;
    }
  }

  return null;
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function textMatches(el: Element, target: string): boolean {
  const text = (el.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const t = target.trim().toLowerCase().replace(/\s+/g, ' ');
  return text === t || text.includes(t) || t.includes(text);
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ── Guide Runner (lightweight version for embed) ─────────────────

class EmbedGuideRunner {
  private guide: GuideConfig;
  private currentIndex = 0;
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private analytics: AnalyticsCollector;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private positionInterval: ReturnType<typeof setInterval> | null = null;
  private backdrop: HTMLDivElement | null = null;
  private highlight: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;

  constructor(guide: GuideConfig, host: HTMLElement, shadow: ShadowRoot, analytics: AnalyticsCollector) {
    this.guide = guide;
    this.host = host;
    this.shadow = shadow;
    this.analytics = analytics;
  }

  start() {
    this.analytics.track('guide.started', { guideId: this.guide.id });
    this.showStep(0);
  }

  stop() {
    this.cleanup();
    this.analytics.track('guide.completed', {
      guideId: this.guide.id,
      data: { stepsCompleted: this.currentIndex, totalSteps: this.guide.steps.length },
    });
  }

  private cleanup() {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
    if (this.positionInterval) { clearInterval(this.positionInterval); this.positionInterval = null; }
    if (this.backdrop) { this.backdrop.remove(); this.backdrop = null; }
    if (this.highlight) { this.highlight.remove(); this.highlight = null; }
    if (this.tooltip) { this.tooltip.remove(); this.tooltip = null; }
  }

  private showStep(index: number) {
    if (index < 0 || index >= this.guide.steps.length) {
      this.stop();
      return;
    }

    this.cleanup();
    this.currentIndex = index;
    const step = this.guide.steps[index];

    this.analytics.track('guide.step.viewed', {
      guideId: this.guide.id,
      stepIndex: index,
    });

    // Poll for element
    let ticks = 0;
    const poll = () => {
      const el = findElement(step);
      if (el) {
        if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
        this.renderStep(step, el, index);
      } else {
        ticks++;
        if (ticks > 15) { // 2.25 seconds
          if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
          this.renderNotFound(step, index);
        }
      }
    };
    poll();
    this.pollInterval = setInterval(poll, 150);
  }

  private renderStep(step: GuideStep, element: Element, index: number) {
    const rect = element.getBoundingClientRect();
    const pad = 6;
    const total = this.guide.steps.length;

    // Scroll into view
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Backdrop with cutout
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'stept-guide-backdrop';
    const overlay = document.createElement('div');
    overlay.className = 'stept-guide-backdrop-overlay';
    this.updateCutout(overlay, rect, pad);
    this.backdrop.appendChild(overlay);
    this.shadow.appendChild(this.backdrop);

    // Highlight
    this.highlight = document.createElement('div');
    this.highlight.className = 'stept-guide-highlight';
    this.highlight.style.left = `${rect.left - pad}px`;
    this.highlight.style.top = `${rect.top - pad}px`;
    this.highlight.style.width = `${rect.width + pad * 2}px`;
    this.highlight.style.height = `${rect.height + pad * 2}px`;
    this.shadow.appendChild(this.highlight);

    // Tooltip
    const progressPct = ((index + 1) / total) * 100;
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'stept-tooltip';
    
    // Build step dots
    let dots = '';
    for (let i = 0; i < total; i++) {
      const cls = i < index ? 'stept-dot stept-dot-done' : i === index ? 'stept-dot stept-dot-current' : 'stept-dot';
      dots += `<div class="${cls}"></div>`;
    }

    this.tooltip.innerHTML = `
      <button class="stept-close" data-action="close">&times;</button>
      <div class="stept-tooltip-title">${escapeHtml(step.title || step.description || `Step ${index + 1}`)}</div>
      ${step.description && step.description !== step.title ? `<div class="stept-tooltip-desc">${escapeHtml(step.description)}</div>` : ''}
      <div class="stept-progress">Step ${index + 1} of ${total}</div>
      <div class="stept-progress-bar"><div class="stept-progress-fill" style="width:${progressPct}%"></div></div>
      ${total <= 12 ? `<div class="stept-dots">${dots}</div>` : ''}
      <div class="stept-actions">
        ${index > 0 ? '<button class="stept-btn stept-btn-secondary" data-action="back">Back</button>' : ''}
        <div class="stept-spacer"></div>
        <button class="stept-btn stept-btn-ghost" data-action="skip">Skip</button>
        <button class="stept-btn stept-btn-primary" data-action="next">${index === total - 1 ? 'Finish' : 'Next'}</button>
      </div>
    `;

    // Wire actions
    this.tooltip.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
      if (action === 'next') {
        this.analytics.track('guide.step.completed', { guideId: this.guide.id, stepIndex: index });
        if (index >= total - 1) this.stop(); else this.showStep(index + 1);
      } else if (action === 'back') {
        this.showStep(index - 1);
      } else if (action === 'skip') {
        this.analytics.track('guide.step.skipped', { guideId: this.guide.id, stepIndex: index });
        if (index >= total - 1) this.stop(); else this.showStep(index + 1);
      } else if (action === 'close') {
        this.analytics.track('guide.abandoned', {
          guideId: this.guide.id,
          data: { lastStep: index, totalSteps: total },
        });
        this.cleanup();
      }
    });

    // Stop events from reaching host page
    for (const evt of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
      this.tooltip.addEventListener(evt, (e) => e.stopPropagation());
    }

    this.shadow.appendChild(this.tooltip);
    this.positionTooltip(this.tooltip, rect);

    // Track position
    this.positionInterval = setInterval(() => {
      if (!element.isConnected) return;
      const r = element.getBoundingClientRect();
      if (this.highlight) {
        this.highlight.style.left = `${r.left - pad}px`;
        this.highlight.style.top = `${r.top - pad}px`;
        this.highlight.style.width = `${r.width + pad * 2}px`;
        this.highlight.style.height = `${r.height + pad * 2}px`;
      }
      if (overlay) this.updateCutout(overlay, r, pad);
      if (this.tooltip) this.positionTooltip(this.tooltip, r);
    }, 200);

    // Click advance for click steps
    if (step.action_type?.toLowerCase().includes('click')) {
      element.addEventListener('click', () => {
        this.analytics.track('guide.step.completed', { guideId: this.guide.id, stepIndex: index });
        if (index >= total - 1) this.stop(); else setTimeout(() => this.showStep(index + 1), 400);
      }, { once: true });
    }
  }

  private renderNotFound(step: GuideStep, index: number) {
    const total = this.guide.steps.length;
    const panel = document.createElement('div');
    panel.className = 'stept-tooltip';
    panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;';
    panel.innerHTML = `
      <div style="font-size:28px;margin-bottom:8px">🔍</div>
      <div class="stept-tooltip-title">Element not found</div>
      <div class="stept-tooltip-desc">Could not find the target for step ${index + 1}.</div>
      <div class="stept-actions" style="justify-content:center">
        ${index > 0 ? '<button class="stept-btn stept-btn-secondary" data-action="back">Back</button>' : ''}
        <button class="stept-btn stept-btn-ghost" data-action="skip">Skip</button>
        <button class="stept-btn stept-btn-primary" data-action="close">Close</button>
      </div>
    `;
    panel.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
      if (action === 'back') this.showStep(index - 1);
      else if (action === 'skip') { if (index >= total - 1) this.stop(); else this.showStep(index + 1); }
      else if (action === 'close') this.cleanup();
    });
    this.tooltip = panel;
    this.shadow.appendChild(panel);
  }

  private updateCutout(overlay: HTMLDivElement, rect: DOMRect, pad: number) {
    const x = rect.left - pad, y = rect.top - pad;
    const w = rect.width + pad * 2, h = rect.height + pad * 2;
    overlay.style.clipPath = `polygon(
      0% 0%, 0% 100%, ${x}px 100%, ${x}px ${y}px,
      ${x + w}px ${y}px, ${x + w}px ${y + h}px,
      ${x}px ${y + h}px, ${x}px 100%, 100% 100%, 100% 0%
    )`;
  }

  private positionTooltip(tooltip: HTMLDivElement, rect: DOMRect) {
    requestAnimationFrame(() => {
      const tr = tooltip.getBoundingClientRect();
      const gap = 14;
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      let top: number, left: number;

      if (vh - rect.bottom >= tr.height + gap) {
        top = rect.bottom + gap;
        left = Math.max(8, Math.min(rect.left, vw - tr.width - 8));
      } else if (rect.top >= tr.height + gap) {
        top = rect.top - tr.height - gap;
        left = Math.max(8, Math.min(rect.left, vw - tr.width - 8));
      } else {
        top = Math.max(8, (vh - tr.height) / 2);
        left = Math.max(8, (vw - tr.width) / 2);
      }

      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
    });
  }
}

// ── Widget Manager ───────────────────────────────────────────────

class SteptWidget {
  private config: SteptConfig;
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private analytics: AnalyticsCollector;
  private widgetConfig: WidgetConfig | null = null;
  private activeGuide: EmbedGuideRunner | null = null;
  private helpPanelOpen = false;

  constructor(config: SteptConfig) {
    this.config = config;
    this.analytics = new AnalyticsCollector(config);

    // Create shadow DOM host
    this.host = document.createElement('stept-widget');
    this.shadow = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    this.shadow.appendChild(style);
    document.documentElement.appendChild(this.host);
  }

  async init() {
    try {
      // Fetch widget config from API
      const resp = await fetch(`${this.config.apiBase}/api/v1/widget/config?project_id=${this.config.projectId}`, {
        headers: { 'X-Api-Key': this.config.apiKey },
      });
      if (!resp.ok) throw new Error(`Config fetch failed: ${resp.status}`);
      this.widgetConfig = await resp.json();

      // Set up triggers
      this.setupTriggers();

      // Show help widget if enabled
      if (this.widgetConfig?.helpWidget?.enabled) {
        this.showHelpWidget();
      }

      // Show active checklists
      for (const checklist of this.widgetConfig?.checklists || []) {
        this.showChecklist(checklist);
      }

      // Show beacons
      for (const beacon of this.widgetConfig?.beacons || []) {
        this.showBeacon(beacon);
      }

      // Show announcements
      for (const ann of this.widgetConfig?.announcements || []) {
        const dismissed = localStorage.getItem(`stept_dismissed_${ann.dismissKey || ann.id}`);
        if (!dismissed) this.showAnnouncement(ann);
      }

    } catch (err) {
      console.warn('[Stept Widget] Failed to initialize:', err);
    }
  }

  // ── Public API ──

  startGuide(guideId: string) {
    const guide = this.widgetConfig?.guides.find(g => g.id === guideId);
    if (!guide) { console.warn(`[Stept] Guide not found: ${guideId}`); return; }
    if (this.activeGuide) this.activeGuide.stop();
    this.activeGuide = new EmbedGuideRunner(guide, this.host, this.shadow, this.analytics);
    this.activeGuide.start();
  }

  // ── Triggers ──

  private setupTriggers() {
    for (const guide of this.widgetConfig?.guides || []) {
      if (guide.trigger.type === 'url_match' && guide.trigger.pattern) {
        this.watchUrl(guide);
      } else if (guide.trigger.type === 'element_visible' && guide.trigger.elementSelector) {
        this.watchElement(guide);
      } else if (guide.trigger.type === 'auto') {
        this.startGuide(guide.id);
      }
    }
  }

  private watchUrl(guide: GuideConfig) {
    const check = () => {
      const pattern = guide.trigger.pattern || '';
      const url = window.location.pathname + window.location.search;
      if (this.matchPattern(url, pattern)) {
        const shown = sessionStorage.getItem(`stept_shown_${guide.id}`);
        if (!shown || guide.frequency === 'always') {
          sessionStorage.setItem(`stept_shown_${guide.id}`, '1');
          setTimeout(() => this.startGuide(guide.id), guide.trigger.delay || 500);
        }
      }
    };
    check();
    // Watch for SPA navigation
    const observer = new MutationObserver(() => setTimeout(check, 200));
    observer.observe(document.body, { childList: true, subtree: true });
  }

  private watchElement(guide: GuideConfig) {
    const check = () => {
      try {
        const el = document.querySelector(guide.trigger.elementSelector!);
        if (el && isVisible(el)) {
          const shown = sessionStorage.getItem(`stept_shown_${guide.id}`);
          if (!shown) {
            sessionStorage.setItem(`stept_shown_${guide.id}`, '1');
            this.startGuide(guide.id);
          }
        }
      } catch {}
    };
    setInterval(check, 1000);
  }

  private matchPattern(url: string, pattern: string): boolean {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(url);
    }
    return url.includes(pattern);
  }

  // ── Help Widget ──

  private showHelpWidget() {
    const btn = document.createElement('button');
    btn.className = 'stept-help-btn';
    btn.textContent = '?';
    btn.addEventListener('click', () => this.toggleHelpPanel());
    this.shadow.appendChild(btn);
  }

  private toggleHelpPanel() {
    const existing = this.shadow.querySelector('.stept-help-panel');
    if (existing) {
      existing.remove();
      this.helpPanelOpen = false;
      return;
    }

    this.helpPanelOpen = true;
    this.analytics.track('help.opened');

    const panel = document.createElement('div');
    panel.className = 'stept-help-panel';
    panel.innerHTML = `
      <div class="stept-help-search">
        <input class="stept-help-input" placeholder="${this.widgetConfig?.helpWidget?.placeholder || 'Search for help...'}" />
      </div>
      <div class="stept-help-results">
        ${(this.widgetConfig?.guides || []).map(g => `
          <div class="stept-help-item" data-guide-id="${g.id}">
            <div class="stept-help-item-title">📋 ${escapeHtml(g.name)}</div>
            <div class="stept-help-item-desc">${g.steps.length} steps</div>
          </div>
        `).join('')}
        ${(this.widgetConfig?.guides || []).length === 0 ? '<div class="stept-help-empty">No guides available</div>' : ''}
      </div>
    `;

    // Search filtering
    const input = panel.querySelector('.stept-help-input') as HTMLInputElement;
    const results = panel.querySelector('.stept-help-results') as HTMLDivElement;
    input?.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      this.analytics.track('help.searched', { data: { query: q } });
      results.querySelectorAll('.stept-help-item').forEach((item) => {
        const text = item.textContent?.toLowerCase() || '';
        (item as HTMLElement).style.display = text.includes(q) ? '' : 'none';
      });
    });

    // Click to start guide
    panel.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('[data-guide-id]');
      if (item) {
        const id = item.getAttribute('data-guide-id')!;
        this.analytics.track('help.result.clicked', { data: { guideId: id } });
        panel.remove();
        this.helpPanelOpen = false;
        this.startGuide(id);
      }
    });

    panel.addEventListener('click', (e) => e.stopPropagation());
    this.shadow.appendChild(panel);
    input?.focus();
  }

  // ── Beacons ──

  private showBeacon(config: BeaconConfig) {
    const dismissed = localStorage.getItem(`stept_dismissed_${config.dismissKey || config.id}`);
    if (dismissed) return;

    const check = () => {
      try {
        const el = document.querySelector(config.targetSelector);
        if (!el || !isVisible(el)) return;

        const existing = this.shadow.querySelector(`[data-beacon-id="${config.id}"]`);
        if (existing) return;

        const rect = el.getBoundingClientRect();
        const beacon = document.createElement('div');
        beacon.className = 'stept-beacon';
        beacon.setAttribute('data-beacon-id', config.id);
        beacon.style.left = `${rect.right + 4}px`;
        beacon.style.top = `${rect.top - 3}px`;
        if (config.color) beacon.style.background = config.color;

        beacon.addEventListener('click', (e) => {
          e.stopPropagation();
          this.analytics.track('beacon.clicked', { widgetId: config.id });
          beacon.remove();
          if (config.dismissKey) localStorage.setItem(`stept_dismissed_${config.dismissKey}`, '1');
          if (config.guideId) this.startGuide(config.guideId);
        });

        this.analytics.track('beacon.shown', { widgetId: config.id });
        this.shadow.appendChild(beacon);
      } catch {}
    };

    check();
    setInterval(check, 2000);
  }

  // ── Checklists ──

  private showChecklist(config: ChecklistConfig) {
    const storageKey = `stept_checklist_${config.id}`;
    const completed: Set<number> = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));

    const checklist = document.createElement('div');
    checklist.className = 'stept-checklist';
    checklist.setAttribute('data-checklist-id', config.id);

    const render = () => {
      const completedCount = completed.size;
      const totalCount = config.tasks.length;
      checklist.innerHTML = `
        <div class="stept-checklist-header">
          ${escapeHtml(config.title)}
          <span class="stept-checklist-progress">${completedCount}/${totalCount}</span>
        </div>
        <div class="stept-checklist-items">
          ${config.tasks.map((task, i) => {
            const done = completed.has(i);
            return `
              <div class="stept-checklist-item" data-task-index="${i}">
                <div class="stept-checklist-check ${done ? 'stept-checklist-check-done' : ''}">
                  ${done ? '✓' : ''}
                </div>
                <span style="${done ? 'text-decoration:line-through;color:#78716C' : ''}">${escapeHtml(task.label)}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    };

    render();

    checklist.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('[data-task-index]');
      if (!item) return;
      const idx = parseInt(item.getAttribute('data-task-index')!);
      const task = config.tasks[idx];
      if (!task) return;

      if (task.guideId) {
        this.startGuide(task.guideId);
      }

      // Mark completed
      completed.add(idx);
      localStorage.setItem(storageKey, JSON.stringify([...completed]));
      this.analytics.track('tasklist.task.completed', {
        widgetId: config.id,
        data: { taskIndex: idx },
      });
      render();

      if (completed.size === config.tasks.length) {
        this.analytics.track('tasklist.completed', { widgetId: config.id });
      }
    });

    this.analytics.track('tasklist.viewed', { widgetId: config.id });
    this.shadow.appendChild(checklist);
  }

  // ── Announcements ──

  private showAnnouncement(config: AnnouncementConfig) {
    const overlay = document.createElement('div');
    overlay.className = 'stept-announcement-overlay';

    const ann = document.createElement('div');
    ann.className = 'stept-announcement';
    ann.innerHTML = `
      ${config.image ? `<img class="stept-announcement-img" src="${config.image}" />` : ''}
      <div class="stept-announcement-title">${escapeHtml(config.title)}</div>
      <div class="stept-announcement-body">${config.body}</div>
      <div class="stept-actions">
        <button class="stept-btn stept-btn-ghost" data-action="dismiss">Dismiss</button>
        <div class="stept-spacer"></div>
        ${config.cta ? `<button class="stept-btn stept-btn-primary" data-action="cta">${escapeHtml(config.cta.label)}</button>` : ''}
      </div>
    `;

    ann.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
      if (action === 'dismiss') {
        localStorage.setItem(`stept_dismissed_${config.dismissKey || config.id}`, '1');
        this.analytics.track('announcement.dismissed', { widgetId: config.id });
        overlay.remove();
      } else if (action === 'cta' && config.cta) {
        this.analytics.track('announcement.cta_clicked', { widgetId: config.id });
        overlay.remove();
        if (config.cta.guideId) this.startGuide(config.cta.guideId);
        else if (config.cta.url) window.open(config.cta.url, '_blank');
      }
    });

    overlay.addEventListener('click', () => {
      localStorage.setItem(`stept_dismissed_${config.dismissKey || config.id}`, '1');
      overlay.remove();
    });

    overlay.appendChild(ann);
    this.analytics.track('announcement.shown', { widgetId: config.id });
    this.shadow.appendChild(overlay);
  }
}

// ── Auto-Initialize ──────────────────────────────────────────────

(function () {
  const script = document.currentScript as HTMLScriptElement;
  if (!script) return;

  const projectId = script.getAttribute('data-project');
  const apiKey = script.getAttribute('data-api-key');
  const apiBase = script.getAttribute('data-api-base') || script.src.replace(/\/widget\/.*$/, '');

  if (!projectId || !apiKey) {
    console.warn('[Stept Widget] Missing data-project or data-api-key attribute');
    return;
  }

  // Read user settings if provided
  const userSettings = (window as any).steptSettings?.user;

  const config: SteptConfig = {
    projectId,
    apiKey,
    apiBase,
    userId: userSettings?.id,
    userAttributes: userSettings?.custom,
  };

  const widget = new SteptWidget(config);

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => widget.init());
  } else {
    widget.init();
  }

  // Expose public API
  (window as any).stept = {
    startGuide: (id: string) => widget.startGuide(id),
  };
})();
