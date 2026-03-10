# Interactive Guided Walkthroughs — Implementation Spec

## What Scribe Does (Reverse-Engineered)

### Element Capture During Recording
- **Priority attributes** (for selector generation): `aria-label`, `aria-placeholder`, `aria-description`, `aria-labelledby`, `data-cy`, `data-id`, `data-role`, `data-test`, `data-testid`, `href`, `name`, `role`, `placeholder`, `alt`
- **Deprioritized** (used but not for selectors): `class`, `value`, `data-artdeco-is-focused`, `data-focused`, `data-is-focus-visible`, `aria-selected`, `aria-hidden`
- **Excluded** (noisy/dynamic): `d`, `fill`, `style`, IDs containing digits (likely auto-generated)
- **Full DOM upload**: Clones the entire visible DOM, stamps every element with `phantom-bounding-box` attribute (top, right, bottom, left from `getBoundingClientRect()`), uploads as HTML for server-side analysis
- **Selector generation cascade**: `#id` → `tag[stable-attribute="value"]` → compound `tag[attr1][attr2]` → `tag:nth-of-type(n)` ancestor path

### Guide Me Feature
- Opens the target URL in a new tab + Scribe sidepanel
- For each step: finds element using stored `target_selector` + `target_xpath`
- When element not found: calls `/ghostwriter/suggest_selector/` API (sends current DOM + stored action data, LLM suggests a new selector)
- Has URL matching to verify user is on the correct page
- iframe support via `postMessage` for cross-origin position calculation

### What Ondoki Captures Today
- `tagName`, `id`, `className`, `text`, `href`, `type`, `name`, `placeholder`, `ariaLabel`, `role`, `title`, `alt`, `associatedLabel`, `parentText`, `testId`, `elementRect`

### Gap Analysis
| Feature | Scribe | Ondoki | Gap |
|---------|--------|--------|-----|
| Stable CSS selector per step | ✅ | ❌ | **Need to generate** |
| XPath per step | ✅ | ❌ | **Need to generate** |
| Full DOM snapshot | ✅ (upload HTML) | ❌ | **Nice-to-have, not MVP** |
| Bounding box on all elements | ✅ (phantom-bounding-box) | ❌ | **Not needed for MVP** |
| Aria/test-id priority | ✅ | Partial | **Improve attribute capture** |
| AI fallback when selector fails | ✅ (ghostwriter API) | ❌ | **Phase 2** |
| iframe support | ✅ | ❌ | **Phase 2** |
| URL/page matching | ✅ | Partial (have URL) | **Minor addition** |
| Overlay/spotlight | ✅ (sidepanel) | ❌ | **Core deliverable** |

---

## Implementation Plan

### Phase 1: Enhanced Element Capture (Chrome Extension)

**File**: `ondoki-plugin-chrome/content.js` — `gatherElementInfo()`

Add to the existing element info:

```javascript
function gatherElementInfo(target) {
  const tag = target.tagName.toLowerCase();
  return {
    // === EXISTING (keep all) ===
    tagName: tag,
    id: target.id || null,
    className: typeof target.className === 'string' ? target.className : null,
    text: getElementText(target),
    href: target.href || null,
    type: target.type || null,
    name: target.name || null,
    placeholder: target.placeholder || null,
    ariaLabel: target.getAttribute('aria-label') || null,
    role: target.getAttribute('role') || null,
    title: target.getAttribute('title') || null,
    alt: target.getAttribute('alt') || null,
    associatedLabel: getAssociatedLabel(target),
    parentText: getParentText(target),
    testId: target.getAttribute('data-testid') || target.getAttribute('data-test') || target.getAttribute('data-cy') || null,
    elementRect: getRect(target),

    // === NEW ===
    // Stable selector (generated cascade — id → [attr] → nth-of-type path)
    selector: generateStableSelector(target),
    // XPath fallback
    xpath: generateXPath(target),
    // Additional stable attributes (Scribe's priority list)
    dataId: target.getAttribute('data-id') || null,
    dataRole: target.getAttribute('data-role') || null,
    ariaDescription: target.getAttribute('aria-description') || null,
    ariaLabelledby: target.getAttribute('aria-labelledby') || null,
    ariaPlaceholder: target.getAttribute('aria-placeholder') || null,
    // Parent chain (up to 3 ancestors with stable identifiers)
    parentChain: getParentChain(target, 3),
    // Sibling context (what's next to this element)
    siblingText: getSiblingText(target),
    // Is element inside an iframe?
    isInIframe: window !== window.top,
    iframeSrc: window !== window.top ? window.location.href : null,
  };
}
```

**New functions needed:**

```javascript
// === SELECTOR GENERATION (Scribe's cascade approach) ===

function generateStableSelector(el) {
  // Level 1: ID (skip if contains digits — likely auto-generated)
  if (el.id && !/\d/.test(el.id)) {
    const sel = `#${CSS.escape(el.id)}`;
    if (isUniqueSelector(sel, el)) return sel;
  }

  // Level 2: Tag + single stable attribute
  const tag = el.tagName.toLowerCase();
  const STABLE_ATTRS = [
    'data-testid', 'data-test', 'data-cy', 'data-id',
    'aria-label', 'name', 'placeholder', 'title', 'alt', 'role'
  ];
  for (const attr of STABLE_ATTRS) {
    const val = el.getAttribute(attr);
    if (val) {
      const sel = `${tag}[${attr}="${CSS.escape(val)}"]`;
      if (isUniqueSelector(sel, el)) return sel;
    }
  }

  // Level 3: Tag + multiple attributes
  const attrParts = [];
  for (const attr of STABLE_ATTRS) {
    const val = el.getAttribute(attr);
    if (val) {
      attrParts.push(`[${attr}="${CSS.escape(val)}"]`);
      const sel = `${tag}${attrParts.join('')}`;
      if (isUniqueSelector(sel, el)) return sel;
    }
  }

  // Level 4: nth-of-type path from nearest ancestor with ID
  return generateNthPath(el);
}

function isUniqueSelector(selector, target) {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === target;
  } catch { return false; }
}

function generateNthPath(el) {
  const parts = [];
  let current = el;
  while (current && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const parent = current.parentElement;

    // If ancestor has a stable ID, anchor here
    if (current !== el && current.id && !/\d/.test(current.id)) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      return parts.join(' > ');
    }

    if (!parent) { parts.unshift(tag); break; }

    const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
    if (siblings.length === 1) {
      parts.unshift(tag);
    } else {
      const idx = siblings.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${idx})`);
    }
    current = parent;
  }
  return parts.join(' > ');
}

function generateXPath(el) {
  const parts = [];
  let current = el;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    const tag = current.tagName.toLowerCase();
    parts.unshift(`${tag}[${index}]`);
    current = current.parentElement;
  }
  return '/' + parts.join('/');
}

function getParentChain(el, depth) {
  const chain = [];
  let current = el.parentElement;
  let d = 0;
  while (current && d < depth && current !== document.body) {
    const info = {
      tag: current.tagName.toLowerCase(),
      id: current.id || null,
      role: current.getAttribute('role') || null,
      ariaLabel: current.getAttribute('aria-label') || null,
      testId: current.getAttribute('data-testid') || null,
      className: typeof current.className === 'string' ?
        current.className.split(' ').slice(0, 3).join(' ') : null,
    };
    // Only include if it has identifying info
    if (info.id || info.role || info.ariaLabel || info.testId) {
      chain.push(info);
    }
    current = current.parentElement;
    d++;
  }
  return chain.length ? chain : null;
}

function getSiblingText(el) {
  const parent = el.parentElement;
  if (!parent) return null;
  const texts = [];
  for (const child of parent.children) {
    if (child === el) continue;
    const text = (child.textContent || '').trim();
    if (text && text.length <= 50) texts.push(text);
    if (texts.length >= 3) break;
  }
  return texts.length ? texts : null;
}
```

**Effort: 1-2 days. No backend changes — `element_info` JSON column accepts anything.**

---

### Phase 2: Guide Data Model + API

**Backend**: New model + endpoints for guides.

```python
# api/app/models.py

class InteractiveGuide(Base):
    __tablename__ = "interactive_guides"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    workflow_id = Column(String(16), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(String(16), ForeignKey("projects.id"), nullable=False)
    created_by = Column(String(16), ForeignKey("users.id"), nullable=False)

    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # URL pattern to match (supports wildcards: https://app.example.com/orders/*)
    url_pattern = Column(String, nullable=True)

    # Guide settings
    is_published = Column(Boolean, default=False)
    auto_start = Column(Boolean, default=False)  # Start automatically when URL matches
    allow_skip = Column(Boolean, default=True)

    # Public token for embedding
    public_token = Column(String(32), unique=True, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class GuideStep(Base):
    __tablename__ = "guide_steps"

    id = Column(String(16), primary_key=True, default=gen_suffix)
    guide_id = Column(String(16), ForeignKey("interactive_guides.id", ondelete="CASCADE"), nullable=False)
    step_number = Column(Integer, nullable=False)

    # What to show the user
    title = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    tooltip_position = Column(String, default='auto')  # auto, top, bottom, left, right

    # How to find the element (cascade of selectors)
    selector = Column(String, nullable=True)        # Primary CSS selector
    xpath = Column(String, nullable=True)            # XPath fallback
    element_text = Column(String, nullable=True)     # Text content fallback
    element_role = Column(String, nullable=True)     # ARIA role fallback
    element_info = Column(JSON, nullable=True)       # Full element data from recording

    # What the user should do
    action_type = Column(String, nullable=True)      # click, type, select, navigate, observe
    expected_input = Column(String, nullable=True)   # For type actions: what to type

    # Page context
    expected_url = Column(String, nullable=True)     # URL where this step should occur
    wait_for_navigation = Column(Boolean, default=False)

    # Step screenshot (from original recording)
    screenshot_key = Column(String, nullable=True)   # Storage key for step screenshot

    created_at = Column(DateTime, server_default=func.now())
```

**API endpoints:**

```
POST   /api/v1/guides                          # Create guide from workflow
GET    /api/v1/guides                          # List guides for project
GET    /api/v1/guides/:id                      # Get guide with steps
PUT    /api/v1/guides/:id                      # Update guide metadata
DELETE /api/v1/guides/:id                      # Delete guide
PUT    /api/v1/guides/:id/steps/:step_id       # Update individual step
POST   /api/v1/guides/:id/publish              # Publish (generate public token)

# Public (no auth — used by guide runtime)
GET    /api/v1/public/guide/:token             # Get published guide
POST   /api/v1/public/guide/:token/analytics   # Report completion/abandonment

# AI fallback (authenticated)
POST   /api/v1/guides/suggest-selector         # Send current DOM + step data → AI suggests selector
```

**Create guide from workflow** — The endpoint takes a workflow ID, copies its steps into guide steps, extracting `selector`, `xpath`, `element_text` from each step's `element_info`.

**Effort: 3-4 days**

---

### Phase 3: Guide Runtime (Chrome Extension)

**New file**: `ondoki-plugin-chrome/guide-runtime.js`

This is the content script injected when a guide is active. It renders the overlay and manages step progression.

#### Element Finder Cascade

```javascript
async function findElement(step) {
  // Level 1: CSS selector (fastest, most reliable)
  if (step.selector) {
    const el = safeQuerySelector(step.selector);
    if (el && isVisible(el)) return { element: el, confidence: 1.0, method: 'selector' };
  }

  // Level 2: data-testid / data-test / data-cy (very stable across deploys)
  const testId = step.element_info?.testId;
  if (testId) {
    for (const attr of ['data-testid', 'data-test', 'data-cy']) {
      const el = document.querySelector(`[${attr}="${CSS.escape(testId)}"]`);
      if (el && isVisible(el)) return { element: el, confidence: 0.95, method: 'testid' };
    }
  }

  // Level 3: ARIA role + text content
  if (step.element_role && step.element_text) {
    const candidates = document.querySelectorAll(`[role="${step.element_role}"]`);
    const match = findByText(candidates, step.element_text);
    if (match) return { element: match, confidence: 0.85, method: 'role+text' };
  }

  // Level 4: Tag + text content (fuzzy match)
  if (step.element_info?.tagName && step.element_text) {
    const candidates = document.querySelectorAll(step.element_info.tagName);
    const match = findByText(candidates, step.element_text, { fuzzy: true });
    if (match) return { element: match, confidence: 0.7, method: 'tag+text' };
  }

  // Level 5: XPath
  if (step.xpath) {
    try {
      const result = document.evaluate(
        step.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
      );
      const el = result.singleNodeValue;
      if (el && isVisible(el)) return { element: el, confidence: 0.6, method: 'xpath' };
    } catch {}
  }

  // Level 6: Parent chain context (find parent, then search within)
  if (step.element_info?.parentChain?.length) {
    const el = findByParentContext(step);
    if (el) return { element: el, confidence: 0.5, method: 'parent-context' };
  }

  // Level 7: AI fallback (optional, requires API call)
  // POST current outerHTML of <body> + step data → backend → LLM suggests selector
  // Only if user/org has opted into AI assistance

  return null; // Element not found — show screenshot fallback
}

function findByText(candidates, expectedText, opts = {}) {
  const normalize = s => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const target = normalize(expectedText);

  // Exact match first
  for (const el of candidates) {
    if (normalize(el.textContent) === target && isVisible(el)) return el;
  }

  // Fuzzy: contains
  if (opts.fuzzy) {
    for (const el of candidates) {
      if (normalize(el.textContent).includes(target) && isVisible(el)) return el;
    }
  }

  return null;
}

function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}
```

#### Overlay Renderer

```javascript
function createOverlay(targetElement, step, stepNumber, totalSteps) {
  // Shadow DOM for style isolation
  const host = document.createElement('div');
  host.id = '__ondoki-guide__';
  host.setAttribute('data-ondoki-exclude', 'true');
  const shadow = host.attachShadow({ mode: 'closed' });

  const rect = targetElement.getBoundingClientRect();
  const padding = 8;

  // Backdrop with cutout
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .backdrop {
        position: fixed; inset: 0; z-index: 2147483646;
        background: rgba(0,0,0,0);
        transition: background 0.3s ease;
      }
      .backdrop.active { background: rgba(0,0,0,0.5); }
      .cutout {
        position: fixed;
        border: 2px solid #3AB08A;
        border-radius: 8px;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.5);
        z-index: 2147483646;
        transition: all 0.3s ease;
        pointer-events: none;
      }
      .pulse-ring {
        position: fixed;
        border: 2px solid #3AB08A;
        border-radius: 8px;
        animation: pulse 2s infinite;
        pointer-events: none;
        z-index: 2147483646;
      }
      @keyframes pulse {
        0% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(1.15); }
      }
      .tooltip {
        position: fixed;
        z-index: 2147483647;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        padding: 16px;
        max-width: 320px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        color: #1C1917;
        font-size: 14px;
        line-height: 1.5;
      }
      .tooltip-title {
        font-weight: 700;
        font-size: 15px;
        margin-bottom: 4px;
      }
      .tooltip-desc { color: #57534E; margin-bottom: 12px; }
      .tooltip-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .tooltip-progress {
        font-size: 12px;
        color: #A8A29E;
      }
      .tooltip-actions { display: flex; gap: 6px; }
      .btn {
        padding: 6px 14px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        font-family: inherit;
        transition: all 0.15s;
      }
      .btn-primary {
        background: #3AB08A;
        color: white;
      }
      .btn-primary:hover { background: #33a07d; }
      .btn-ghost {
        background: transparent;
        color: #78716C;
      }
      .btn-ghost:hover { background: #F5F5F4; }
      .btn-close {
        position: absolute;
        top: 8px; right: 8px;
        width: 24px; height: 24px;
        border: none; background: none;
        cursor: pointer; color: #A8A29E;
        border-radius: 6px;
        display: flex; align-items: center; justify-content: center;
      }
      .btn-close:hover { background: #F5F5F4; color: #1C1917; }
    </style>

    <div class="backdrop" id="backdrop"></div>
    <div class="cutout" id="cutout"></div>
    <div class="pulse-ring" id="pulse"></div>
    <div class="tooltip" id="tooltip">
      <button class="btn-close" id="close">✕</button>
      <div class="tooltip-title" id="title"></div>
      <div class="tooltip-desc" id="desc"></div>
      <div class="tooltip-footer">
        <span class="tooltip-progress" id="progress"></span>
        <div class="tooltip-actions">
          <button class="btn btn-ghost" id="skip">Skip</button>
          <button class="btn btn-ghost" id="back">← Back</button>
          <button class="btn btn-primary" id="next">Next →</button>
        </div>
      </div>
    </div>
  `;

  // Position cutout over target element
  const cutout = shadow.getElementById('cutout');
  const pulse = shadow.getElementById('pulse');
  positionCutout(cutout, pulse, rect, padding);

  // Position tooltip (auto-detect best placement)
  const tooltip = shadow.getElementById('tooltip');
  shadow.getElementById('title').textContent = step.title || `Step ${stepNumber}`;
  shadow.getElementById('desc').textContent = step.description || '';
  shadow.getElementById('progress').textContent = `${stepNumber} of ${totalSteps}`;

  document.documentElement.appendChild(host);

  // Auto-position tooltip after render
  requestAnimationFrame(() => {
    positionTooltip(tooltip, rect, step.tooltip_position);
    shadow.getElementById('backdrop').classList.add('active');
  });

  return {
    host,
    shadow,
    updatePosition: () => {
      const newRect = targetElement.getBoundingClientRect();
      positionCutout(cutout, pulse, newRect, padding);
      positionTooltip(tooltip, newRect, step.tooltip_position);
    },
    destroy: () => host.remove(),
  };
}
```

#### Step Progression Logic

```javascript
class GuideRunner {
  constructor(guide, options = {}) {
    this.guide = guide;
    this.steps = guide.steps;
    this.currentStep = 0;
    this.overlay = null;
    this.observer = null; // MutationObserver for dynamic pages
    this.options = options;
  }

  async start() {
    await this.showStep(0);
  }

  async showStep(index) {
    if (this.overlay) this.overlay.destroy();
    if (index >= this.steps.length) { this.complete(); return; }
    if (index < 0) return;

    this.currentStep = index;
    const step = this.steps[index];

    // Check URL if step has expected_url
    if (step.expected_url && !matchUrl(window.location.href, step.expected_url)) {
      this.showUrlMismatch(step);
      return;
    }

    // Find element
    const result = await this.findWithRetry(step, 3, 1000);

    if (!result) {
      // Element not found — show screenshot fallback
      this.showScreenshotFallback(step, index);
      return;
    }

    // Scroll element into view
    result.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait for scroll to finish
    await new Promise(r => setTimeout(r, 300));

    // Create overlay
    this.overlay = createOverlay(result.element, step, index + 1, this.steps.length);

    // Wire up buttons
    const shadow = this.overlay.shadow;
    shadow.getElementById('next').onclick = () => this.showStep(index + 1);
    shadow.getElementById('back').onclick = () => this.showStep(index - 1);
    shadow.getElementById('skip').onclick = () => this.showStep(index + 1);
    shadow.getElementById('close').onclick = () => this.stop();

    // Watch for target element moving (dynamic pages, scroll)
    this.startPositionUpdater(result.element);

    // If action is 'click', also advance when user actually clicks the element
    if (step.action_type === 'click' || step.action_type === 'Left Click') {
      result.element.addEventListener('click', () => {
        // Small delay for click effects to propagate
        setTimeout(() => this.showStep(index + 1), 500);
      }, { once: true });
    }
  }

  async findWithRetry(step, retries, delayMs) {
    for (let i = 0; i <= retries; i++) {
      const result = await findElement(step);
      if (result) return result;
      if (i < retries) await new Promise(r => setTimeout(r, delayMs));
    }
    return null;
  }

  startPositionUpdater(element) {
    if (this.positionInterval) clearInterval(this.positionInterval);
    this.positionInterval = setInterval(() => {
      if (this.overlay) this.overlay.updatePosition();
    }, 200);
  }

  showScreenshotFallback(step, index) {
    // Show the recorded screenshot with the click position highlighted
    // "I couldn't find this element. Here's what it looked like when recorded."
    // User can click "Skip" or "Try Again"
  }

  showUrlMismatch(step) {
    // "This step expects you to be on [url]. Navigate there to continue."
  }

  complete() {
    if (this.overlay) this.overlay.destroy();
    // Show completion toast
    // Report analytics
  }

  stop() {
    if (this.overlay) this.overlay.destroy();
    if (this.positionInterval) clearInterval(this.positionInterval);
  }
}
```

**Effort: 5-7 days**

---

### Phase 4: Guide Management UI (Web App)

**New pages:**
- `/guides` — List all guides for a project
- `/guides/:id` — Guide editor (reorder steps, edit descriptions, test selectors)
- `/workflow/:id` → Add "Create Guide" button

**Guide editor features:**
- Preview each step's selector (highlight matched element in an iframe?)
- Edit step title/description
- Reorder/delete steps
- Test guide (open in new tab with extension)
- Publish → get embed code / extension activation link

**Effort: 5-7 days**

---

### Phase 5: AI Fallback for Selector Recovery

**Backend endpoint**: `POST /api/v1/guides/suggest-selector`

```python
async def suggest_selector(body: SuggestSelectorRequest):
    """When the guide runtime can't find an element, send the current
    page's DOM + the step's element info → LLM suggests a new selector."""

    prompt = f"""You are helping find a UI element on a web page.

The original element had these properties:
- Tag: {body.element_info.get('tagName')}
- Text: {body.element_info.get('text')}
- Role: {body.element_info.get('role')}
- Aria label: {body.element_info.get('ariaLabel')}
- Original selector: {body.selector}

The user is on: {body.current_url}
The original page was: {body.expected_url}

Here is a simplified version of the current page DOM:
{body.dom_summary}

Generate a CSS selector that uniquely identifies the element the user
needs to interact with. Return ONLY the CSS selector, nothing else."""

    # Use gpt-4o-mini for cost efficiency
    result = await call_llm(prompt)
    return {"selector": result.strip()}
```

**Cost**: ~$0.002 per call (GPT-4o-mini with truncated DOM).
**When called**: Only when levels 1-6 of element finder all fail.

**Effort: 2-3 days**

---

## Battle-Proofing Strategies

### 1. Selector Resilience
- **Never rely on a single selector.** Store selector + xpath + text + role + testid. Try all in cascade.
- **Skip auto-generated IDs** (contain digits, random strings). Scribe does this too.
- **Prefer data-testid > aria-label > name > text content.** Test IDs survive redesigns.
- **Store parent context.** If the button moves to a different container, the parent chain helps narrow down.

### 2. Handling UI Changes
- **Fuzzy text matching**: "Submit Order" should match "Submit Your Order" or "Place Order".
- **Levenshtein distance** for text comparison with threshold.
- **Role + position fallback**: If a button with role="button" is in roughly the same screen area (±20%), it's probably the same element.
- **Sibling context**: If "Cancel" and "Save Draft" are still next to an unknown button, it's probably the right one.

### 3. Dynamic Pages (SPAs)
- **MutationObserver**: Watch for DOM changes. If target element appears after AJAX load, detect and proceed.
- **Retry with exponential backoff**: Try finding element 3 times with 1s, 2s, 4s delays.
- **Wait for network idle**: After navigation, wait for pending XHR/fetch requests to complete.

### 4. URL Matching
- **Pattern support**: `https://app.example.com/orders/*` matches any order page.
- **Ignore query params by default**: `?tab=details` shouldn't break matching.
- **Hash fragment handling**: SPAs use `#/routes` — match these too.

### 5. When All Else Fails
- **Screenshot overlay**: Show the original recording screenshot with the click position highlighted. "Here's what this step looked like. Click the highlighted area."
- **"Element not found" recovery**: Let user manually click the right element → update the stored selector for next time (self-healing).
- **AI assist** (Phase 5): Send DOM to LLM as last resort.

---

## Timeline

| Phase | What | Effort | Dependencies |
|-------|------|--------|-------------|
| 1 | Enhanced element capture (Chrome ext) | 1-2 days | None |
| 2 | Guide data model + API | 3-4 days | Phase 1 |
| 3 | Guide runtime (overlay + element finder) | 5-7 days | Phase 2 |
| 4 | Guide management UI | 5-7 days | Phase 2 |
| 5 | AI fallback | 2-3 days | Phase 3 |

**Total: ~3-4 weeks to MVP** (Phase 1-3, minimal UI).
**Full feature: ~5-6 weeks** (all phases).

Phase 1 can ship immediately and independently — it just enriches the data captured during recording.
