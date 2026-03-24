# Tango Chrome Extension — Reverse Engineering Analysis

**Date:** 2026-03-24
**Tango Version:** 8.6.6
**Purpose:** Extract architectural patterns and techniques stept should adopt

---

## 1. OVERLAY & HIGHLIGHT SYSTEM

### How Tango Renders Its Overlay

Tango uses **CSS clip-path polygon cutout** — the same fundamental technique as stept. The overlay is a full-viewport fixed div with a polygon clip-path that creates a rectangular hole around the target element.

**Tango's overlay architecture:**
- Full-viewport backdrop with `position: fixed; inset: 0`
- Clip-path polygon creates the spotlight cutout
- Multiple layered divs for visual depth (blur, shadow, border)
- All rendered inside a **Shadow DOM** container (`<tango-extension>` custom element)

**Design system variables found in Bw2Vl8wp.js:**
```css
--lb-highlight-shadow: inset 0 0 0 1px #0000001a;
--lb-elevation-shadow: 0 0 0 1px #0000000a, 0 2px 6px #00000014, 0 8px 26px #0000001f;
```

**Visual polish Tango adds that stept lacks:**
- `filter: blur()` on backdrop (279 filter references in overlay module)
- Layered opacity for dimensional depth (227 opacity references)
- Elevation shadows with multiple box-shadow layers
- Rounded rectangle cutout corners

### Stept's Current Implementation (guide-runtime/index.ts)

Stept uses the same clip-path approach:
```typescript
// Lines 1677-1688
overlay.style.clipPath = `polygon(
  0% 0%, 0% 100%, ${x}px 100%, ${x}px ${y}px,
  ${x + w}px ${y}px, ${x + w}px ${y + h}px,
  ${x}px ${y + h}px, ${x}px 100%, 100% 100%, 100% 0%
)`;
```

Stept's overlay stack:
- `.guide-backdrop` (z-index: 2147483640, pointer-events: none)
- `.guide-backdrop-overlay` (clip-path with 0.3s ease transition)
- `.guide-highlight` (2px dashed #3AB08A border, pulse animation)
- `.guide-tooltip` (z-index: 2147483642)

### Why Tango Feels More Polished

1. **Backdrop blur** creates depth — stept has none
2. **Multi-layer shadows** give the highlight 3D presence
3. **CSS transitions on clip-path** are GPU-accelerated (both use this)
4. **Opacity layering** creates a more professional dimming effect
5. **Shadow DOM isolation** prevents page CSS from interfering

### What Stept Should Copy

- Add `backdrop-filter: blur(4px)` to the backdrop
- Use multi-layer box-shadow on the highlight ring instead of dashed border
- Add subtle `box-shadow: 0 0 0 4px rgba(58, 176, 138, 0.15)` glow around highlight

---

## 2. ELEMENT FINDING & TRACKING

### Tango's Multi-Strategy Element Finding

Tango uses a **hierarchical selector tree** with multiple fallback strategies, ordered by reliability:

**SelectorTree structure:**
```typescript
interface SelectorTree {
  selectors: string[];              // Multiple CSS selectors for THIS element
  prevSiblingSelectors: string[];   // Alternative finding via siblings
  nextSiblingSelectors: string[];
  depth: number;
  parent: SelectorTree | null;      // Parent chain up to 4 levels deep
}
```

**Selector generation priority (generateSelectorSet):**
1. `#id` (skip auto-generated IDs with digits)
2. `data-testid`, `data-test`, `data-cy`, `data-qa`, `data-automation-id`, `data-e2e`, `data-hook`
3. `tag[aria-label="..."]`
4. `tag[name="..."]` (form elements)
5. `tag[placeholder="..."]`
6. `tag[role="..."][aria-label="..."]` (compound)
7. `tag[title="..."]`
8. Compound multi-attribute: `tag[data-testid="..."][aria-label="..."][role="..."]`
9. Path-based: `#stable-ancestor > div:nth-of-type(2) > button`

All selectors are verified for **uniqueness** via `_unique(selector)` before inclusion.

### Recovery Strategy During Playback

**Three-stage discovery pipeline:**

| Stage | Timing | Method | Confidence |
|-------|--------|--------|-----------|
| Deterministic | 0-2s (150ms × 13 ticks) | CSS selectors, data-testid, ARIA, XPath, parent chain | 0.35-1.0 |
| LLM Recovery | 2s+ | API call with page elements + target description | Variable |
| Roadblock | Timeout | Show "Element not found" UI | N/A |

**Confidence scores by method:**

| Method | Confidence |
|--------|-----------|
| SelectorTree unanimous (all selectors agree) | 1.0 |
| CSS selector direct match | 1.0 |
| data-testid match | 0.95 |
| Parent chain disambiguation | 0.9 |
| Role + text match | 0.85 |
| Tag + fuzzy text | 0.7 |
| XPath | 0.6 |
| Parent context | 0.5 |
| Title/description hint | 0.35 |

### Polling & Observation

- **Element poll cycle:** 150ms interval
- **Position tracking:** 200ms interval (once element found)
- **URL watching:** 500ms interval + popstate/hashchange listeners
- **DOM detachment:** Checks `element.isConnected` each poll cycle
- **MutationObserver:** Used for Shadow DOM injection and inert-attribute protection

### Obstruction Detection

```javascript
function isObstructed(el) {
  const rect = el.getBoundingClientRect();
  const topEl = document.elementFromPoint(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );
  if (topEl === el || el.contains(topEl)) return null;
  return topEl; // obstructing element
}
```

### Intermediate Action Detection

Checks ancestors for:
- `display: none`
- `visibility: hidden`
- `aria-expanded="false"`
- `<details>` without `open` attribute

When detected, shows hint: "First, open the accordion to reveal this element"

### Text Matching Algorithm

```javascript
function findByText(candidates, text, opts) {
  const target = normalizeText(text); // .trim().toLowerCase().replace(/\s+/g, ' ')

  // 1. Exact match on text, aria-label, or title
  // 2. Fuzzy contains: element text includes target
  // 3. Reverse fuzzy: target includes element text (min 3 chars)
  // 4. Placeholder fuzzy match
  // Score = Math.abs(matchText.length - target.length) + penalty
}
```

---

## 3. STEP TRANSITION ARCHITECTURE

### Message-Driven, Event-Based Architecture

Tango uses a **fully event-driven** system with three layers communicating via Chrome message passing:

```
Service Worker (state machine)
    ↕ chrome.runtime.sendMessage
Content Script (DOM interaction)
    ↕ window.postMessage
Overlay UI (Shadow DOM React app)
```

### Route States

The service worker maintains `E.currentRoute` with these states:
- `Capturing` — recording user interactions
- `NewPin` — pinning/highlighting elements
- `Blurring` — masking sensitive fields
- `Viewing` — playback mode
- `Hidden` — extension not visible

### Event Capture Pipeline (DomRecorder)

**Tracked events:** `input`, `click`, `copy`, `paste`, `cut`, `auxclick`, `keydown`, `mouseover`, `mouseout`, `focusin`, `focusout`, `mousedown`, `mouseup`, `pointerdown`, `pointerup`, `dragend`

**All events captured in capture phase** (`useCapture: true`).

**Three-phase processing:**
1. **Capture Phase** — Raw DOM event → find target element → validate
2. **Event Creation** — Create TangoEvent from DOM event
3. **Snapshot & Save** — Take page snapshot → generate simplified DOM → save to service worker

### Event Merging

Events are merged if:
- Fewer than 6 events in the merge group
- Same element not already in merge list
- All elements on same screen position
- No significant distance between events

### Action Execution (Playback)

```javascript
const te = async({elementId, action, text, clearExisting, direction}) => {
  if (action === 'go_back') return window.history.go(-1);
  if (action === 'scroll') return scroll(direction ?? 'down');

  let element = findElementById(elementId);
  switch(action) {
    case 'click':
      await delay(300);  // 300ms delay before click
      await clickElement(element);
    case 'input_text':
      await inputText(element, text, {insertOption: clearExisting ? Replace : Append});
  }
}
```

### Navigation Handling

- **URL matching:** Each step has associated URL(s); service worker matches loaded URL to step
- **Pending URL state:** `E.pendingUrl` tracks navigation-in-progress
- **History API:** Direct `window.history.go(-1)` for back navigation
- **beforeunload:** Stops all recorders on page unload
- **Session persistence:** SessionRecorder maintains state across navigations via service worker

### Lazy-Loaded Recorders

Each recorder type is dynamically imported only when needed:
```javascript
const G = async (params) => {
  if (!E) {
    let {DomRecorder: t} = await import('./BfWwG185.js');
    E = new t(params);
  }
  return E;
}
```

---

## 4. SIDE PANEL UI PATTERNS

### Step List Rendering

Tango uses React with **Stitches** CSS-in-JS (`<style id="stitches-tango">`).

**Stept's current implementation (GuideStepsPanel.tsx):**

Vertical flex column with stepper pattern:
```
.guide-stepper-item (flex row, gap: 12px)
├── .guide-stepper-left (24px column)
│   ├── .guide-stepper-circle (22×22px, state-colored)
│   └── .guide-stepper-line (2px connector)
└── .guide-stepper-content (flex: 1)
    ├── .guide-stepper-instruction (13px, weight 500)
    └── .guide-stepper-detail (expandable)
        ├── screenshot container
        ├── roadblock message
        └── mark-complete button
```

**Four visual states:**
- **Future:** Gray circle (#E0E0E0), muted text (#9AA0A6), step number
- **Active:** Indigo circle (#4f46e5), full contrast, shows detail/screenshot
- **Completed:** Green circle (#34A853), checkmark, detail hidden
- **Roadblock:** Red circle (#EA4335), warning icon, shows recovery options

### Screenshot Display

- **In list:** `width: 100%` responsive, no fixed aspect ratio
- **Zoom modal:** `object-fit: contain` with `max-width/max-height: 100%`
- Container uses `position: relative; overflow: hidden` for click marker positioning

### Click Marker Positioning

**Percentage-based, scale-invariant positioning:**
```typescript
const clickMarkerStyle = {
  left: `${(step.screenshot_relative_position.x / step.screenshot_size.width) * 100}%`,
  top: `${(step.screenshot_relative_position.y / step.screenshot_size.height) * 100}%`,
};
```

**Three-layer marker animation:**
- Outer pulse ring: 32px, 20% opacity, 2s infinite pulse-ring animation
- Middle ring: 20px, 2px indigo border, 30% opacity fill
- Center dot: 6px solid indigo

### Auto-Scroll

```typescript
useEffect(() => {
  const active = listRef.current?.querySelector('.guide-stepper-item.active, .guide-stepper-item.roadblock');
  active?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}, [currentIndex, stepStatus]);
```

---

## 5. SCROLL BEHAVIOR

### Tango's Scroll Implementation (TLh0QRVr.js)

**Viewport visibility check:**
```javascript
var u = e => {
  let t = window.innerWidth || document.documentElement.clientWidth,
      n = window.innerHeight || document.documentElement.clientHeight,
      r = e.top >= n || e.bottom <= 0,
      i = e.left >= t || e.right <= 0;
  return !(r || i);
};
```

**Fixed header detection:**
```javascript
function d(e) {
  if (!e || e.tagName === 'BODY' || !e.parentElement) return 0;
  var n = window.getComputedStyle(e);
  let r = n.getPropertyValue('position'),
      i = n.getPropertyValue('z-index');
  if (r !== 'static' && i !== 'auto') {
    let e = parseInt(i, 10);
    isNaN(e) || (t = e);
  }
  return Math.max(d(e.parentElement), t); // Recursive z-index calculation
}
```

**Dynamic viewport positioning (TLh0QRVr.js):**
```javascript
const g = (e, t) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {  // Double RAF for layout stability
      let n = e.getBoundingClientRect();
      let r = n.bottom > window.innerHeight - 150;  // Bottom threshold
      let i = n.right > window.innerWidth - 288;     // Right threshold
      let a = n.top < 150;                            // Top threshold

      // Position UI overlay based on available space
      i ? (t.style.right = '24px') : (t.style.left = '24px');
      r ? (t.style.bottom = '0px')
        : a ? (t.style.top = '24px')
            : (t.style.top = '0px');
    });
  });
};
```

**Key scroll features:**
- Custom smooth scroll via requestAnimationFrame (14 scrollIntoView references)
- Detects `position:fixed` and `position:sticky` for header offset
- Double requestAnimationFrame for layout-stable positioning
- 150px threshold from viewport edges
- 24px margin from edges

---

## 6. ZOOM & IFRAME HANDLING

### Zoom Compensation (BvIkpkrg.js)

**The precise zoom formula:**
```javascript
function w(e) {
  // Scale factor = visualViewport.scale × devicePixelRatio
  let t = (window.visualViewport?.scale ?? 1) * window.devicePixelRatio;
  let n = window.visualViewport?.offsetLeft ?? 0;
  let r = window.visualViewport?.offsetTop ?? 0;

  // Apply scaling with 4px padding
  let i = (e.x - 4 - n) * t;
  let a = (e.y - 4 - r) * t;
  let o = (e.width + 8) * t;
  let s = (e.height + 8) * t;

  // Clamp to viewport bounds (main frame only)
  if (!isInIframe()) {
    let e = window.innerWidth * t;
    let n = window.innerHeight * t;
    i = Math.max(i, 4);
    a = Math.max(a, 4);
    o = Math.min(o, e - i - 4);
    s = Math.min(s, n - a - 4);
  }

  return { x: Math.round(i), y: Math.round(a), width: Math.round(o), height: Math.round(s) };
}
```

**Key zoom techniques:**
1. `window.visualViewport.scale` — primary zoom detection
2. `window.devicePixelRatio` — high-DPI compensation
3. `visualViewport.offsetLeft/Top` — zoomed/panned viewport offset
4. Bounds clamping in main frame only (iframes handle differently)
5. Integer rounding to prevent sub-pixel rendering artifacts

### Iframe Handling

**Manifest configuration (critical):**
```json
{
  "content_scripts": [{
    "all_frames": true,
    "match_about_blank": true,
    "match_origin_as_fallback": true,
    "matches": ["<all_urls>"]
  }]
}
```

**Same-origin iframe handling:**
- Direct `contentDocument` access with 500ms timeout
- Recursive content processing
- Scroll state preserved via `data-dom-snapshot-scroll` attributes

**Cross-origin iframe handling:**
- Relies on `host_permissions: ["<all_urls>"]` for content script injection
- `all_frames: true` ensures content script runs in every frame
- Communication via `window.postMessage` across frame boundaries

**Scroll state persistence:**
```javascript
function c(e) {
  e.querySelectorAll('[data-dom-snapshot-scroll]').forEach(e => {
    let [t, n] = e.getAttribute('data-dom-snapshot-scroll').split(',');
    e.scrollTop = parseInt(n ?? '0');
    e.scrollLeft = parseInt(t ?? '0');
  });
}
```

### Shadow DOM Support

**Recursive shadow root discovery:**
```javascript
function findAllShadowRoots(root = document) {
  let results = [];
  root.querySelectorAll('*').forEach(el => {
    if (el.shadowRoot && el.id !== 'tango-extension-app') {
      results.push(el.shadowRoot);
      results.push(...findAllShadowRoots(el.shadowRoot)); // Recursive
    }
  });
  return results;
}
```

**Shadow DOM event injection:**
```javascript
injectShadowDom(element) {
  if (!element.shadowRoot) return;
  if (this.injectedShadowDoms.has(element)) return;

  this.injectedShadowDoms.add(element);
  this.attachEventListeners(element.shadowRoot);
  this.startObserving(element.shadowRoot); // MutationObserver
}
```

**MutationObserver for dynamic shadow DOM:**
```javascript
observer.observe(element, {
  attributes: false,
  childList: true,
  subtree: true
});
// On mutation: check new nodes for shadowRoot, inject if found
```

**composedPath() usage:** Events use `e.composedPath()` to traverse shadow DOM boundaries.

---

## 7. SPECIFIC TECHNIQUES STEPT SHOULD COPY

### HIGH PRIORITY

#### 1. Add Backdrop Blur
Stept's overlay feels flat. Add depth with backdrop blur:
```css
.guide-backdrop-overlay {
  backdrop-filter: blur(4px);
}
```

#### 2. Multi-Layer Elevation Shadows
Replace dashed border highlight with Tango-style shadows:
```css
.guide-highlight {
  border: 2px solid rgba(58, 176, 138, 0.8);
  border-radius: 8px;
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.04),
    0 2px 6px rgba(0,0,0,0.08),
    0 8px 26px rgba(0,0,0,0.12),
    0 0 0 4px rgba(58, 176, 138, 0.15);
}
```

#### 3. Switch Position Tracking to requestAnimationFrame
Replace 200ms `setInterval` with `requestAnimationFrame` for smoother tracking:
```typescript
_startPositionTracking() {
  const update = () => {
    this._updatePositions();
    this._positionFrame = requestAnimationFrame(update);
  };
  this._positionFrame = requestAnimationFrame(update);
}
```

#### 4. Double-RAF for Layout-Stable Positioning
Tango uses double `requestAnimationFrame` to avoid measuring during layout:
```typescript
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    // Now safe to read getBoundingClientRect and write positions
  });
});
```

#### 5. Obstruction Detection
Before highlighting, check if element is actually visible:
```typescript
function isObstructed(el: Element): Element | null {
  const rect = el.getBoundingClientRect();
  const topEl = document.elementFromPoint(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2
  );
  if (topEl === el || el.contains(topEl)) return null;
  return topEl;
}
```

#### 6. Intermediate Action Detection
Check if target is hidden by a collapsible parent:
```typescript
function needsIntermediateAction(el: Element): HTMLElement | null {
  let parent = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') return parent;
    if (parent.getAttribute('aria-expanded') === 'false') return parent;
    if (parent.tagName === 'DETAILS' && !parent.hasAttribute('open')) return parent;
    parent = parent.parentElement;
  }
  return null;
}
```

#### 7. Zoom Compensation Formula
Use `visualViewport` API instead of just CSS zoom:
```typescript
function getZoomScale(): number {
  return (window.visualViewport?.scale ?? 1) * window.devicePixelRatio;
}

function adjustRect(rect: DOMRect): { x: number; y: number; width: number; height: number } {
  const scale = getZoomScale();
  const offsetX = window.visualViewport?.offsetLeft ?? 0;
  const offsetY = window.visualViewport?.offsetTop ?? 0;
  return {
    x: (rect.x - offsetX) * scale,
    y: (rect.y - offsetY) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}
```

### MEDIUM PRIORITY

#### 8. Manifest: all_frames + match_about_blank
Enable content script injection in all iframes:
```json
{
  "content_scripts": [{
    "all_frames": true,
    "match_about_blank": true,
    "match_origin_as_fallback": true
  }]
}
```

#### 9. Recursive Shadow DOM Discovery
Search all shadow roots when finding elements:
```typescript
function collectSearchRoots(root: Document | ShadowRoot = document, depth = 0): (Document | ShadowRoot)[] {
  if (depth > 5) return [root];
  const results = [root];
  root.querySelectorAll('*').forEach(el => {
    if (el.shadowRoot && el.id !== 'stept-guide-overlay') {
      results.push(...collectSearchRoots(el.shadowRoot, depth + 1));
    }
  });
  return results;
}
```

#### 10. MutationObserver for Dynamic Shadow DOM
Watch for new shadow roots being attached:
```typescript
const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach(node => {
      if (node instanceof HTMLElement && node.shadowRoot) {
        // Inject event listeners and start observing
      }
    });
  }
});
observer.observe(document.body, { childList: true, subtree: true });
```

#### 11. Fixed Header Detection for Scroll
Before scrolling, calculate fixed header height:
```typescript
function getFixedHeaderHeight(): number {
  const candidates = document.querySelectorAll('header, nav, [role="banner"]');
  let maxBottom = 0;
  candidates.forEach(el => {
    const style = getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'sticky') {
      maxBottom = Math.max(maxBottom, el.getBoundingClientRect().bottom);
    }
  });
  return maxBottom;
}
```

#### 12. Lazy-Load Recorders
Only import heavy modules when needed:
```typescript
let domRecorder: DomRecorder | null = null;
async function getDomRecorder() {
  if (!domRecorder) {
    const { DomRecorder } = await import('./dom-recorder');
    domRecorder = new DomRecorder();
  }
  return domRecorder;
}
```

#### 13. Event Capture Phase
Always use capture phase for reliable event interception:
```typescript
eventTypes.forEach(type => {
  window.addEventListener(type, handler, true); // capture phase
});
```

#### 14. Inert Attribute Protection
Prevent page dialogs from hiding the overlay:
```typescript
const inertObserver = new MutationObserver(() => {
  if (overlayHost.hasAttribute('inert')) {
    overlayHost.removeAttribute('inert');
  }
});
inertObserver.observe(overlayHost, { attributes: true, attributeFilter: ['inert'] });
```

### LOWER PRIORITY

#### 15. 300ms Click Delay for Reliability
Add small delay before executing click actions (matches Tango's pattern):
```typescript
async function executeClick(element: HTMLElement) {
  await new Promise(r => setTimeout(r, 300));
  element.click();
}
```

#### 16. Event Merging for Recording
Merge rapid sequential events on nearby elements (Tango merges up to 6).

#### 17. Scroll State Preservation
Store scroll positions on snapshots via data attributes for restoration.

---

## Architecture Comparison Summary

| Aspect | Tango | Stept Current | Gap |
|--------|-------|---------------|-----|
| **Overlay rendering** | clip-path + blur + shadows | clip-path only | Add blur & shadows |
| **Position tracking** | requestAnimationFrame | setInterval(200ms) | Switch to rAF |
| **Element finding** | SelectorTree + voting | Multi-strategy + LLM | Similar (stept has LLM advantage) |
| **Step transitions** | Event-driven messaging | Event-driven messaging | Similar |
| **Zoom handling** | visualViewport API | CSS zoom only | Adopt visualViewport |
| **Iframe support** | all_frames + postMessage | Partial | Add all_frames config |
| **Shadow DOM** | Recursive discovery + injection | Basic support | Enhance recursion |
| **Fixed headers** | Auto-detection + offset | Manual | Add auto-detection |
| **Obstruction** | elementFromPoint check | None | Add obstruction detection |
| **Intermediate actions** | Ancestor analysis | None | Add ancestor checks |
| **Inert protection** | MutationObserver | None | Add inert removal |
| **Event capture** | Capture phase | Bubble phase | Switch to capture |

---

## Key Takeaway

The biggest gaps between Tango and stept are **visual polish** (blur, shadows, smooth animations) and **edge case handling** (obstruction detection, intermediate actions, zoom compensation, iframe support). The core architecture (clip-path overlay, multi-strategy element finding, message-based communication) is already similar. The improvements are mostly incremental refinements rather than architectural rewrites.
