# Tango Element Finding & Replay Reliability Analysis

**Date:** March 25, 2026
**Analysis Source:** Reverse-engineered from Tango Chrome extension v8.6.6
**Purpose:** Extract techniques and patterns that Stept should adopt

---

## Executive Summary

Tango's approach to element finding and replay reliability centers around a **hierarchical selector tree** with multiple fallback strategies, sophisticated visual polish, and extensive edge case handling. While Stept already implements similar core architecture (clip-path overlays, multi-strategy element finding, message-driven communication), Tango excels in **visual polish** and **robustness** through careful handling of zoom compensation, iframe support, Shadow DOM, and obstruction detection.

The biggest opportunities for Stept are **incremental improvements** rather than architectural rewrites: adding backdrop blur and elevation shadows for visual polish, switching to `requestAnimationFrame`-based position tracking, implementing zoom compensation via the `visualViewport` API, and adding obstruction detection.

---

## 1. Selector Generation (Recording Time)

### SelectorTree Architecture

Tango uses a hierarchical `SelectorTree` structure that generates multiple CSS selectors for each element, with parent chain context for disambiguation:

```typescript
interface SelectorTree {
  selectors: string[];              // Multiple CSS selectors for THIS element
  prevSiblingSelectors: string[];   // Alternative finding via siblings
  nextSiblingSelectors: string[];
  depth: number;
  parent: SelectorTree | null;      // Parent chain up to 4 levels deep
}
```

### Selector Generation Priority

Tango's `generateSelectorSet` function creates selectors in this order of reliability:

1. **ID-based:** `#id` (skips auto-generated IDs with digits)
2. **Test attributes:** `data-testid`, `data-test`, `data-cy`, `data-qa`, `data-automation-id`, `data-e2e`, `data-hook`
3. **Accessibility:** `tag[aria-label="..."]`
4. **Form semantics:** `tag[name="..."]` (form elements)
5. **User hints:** `tag[placeholder="..."]`
6. **Role + label:** `tag[role="..."][aria-label="..."]` (compound)
7. **Tooltips:** `tag[title="..."]`
8. **Compound attributes:** `tag[data-testid="..."][aria-label="..."][role="..."]`
9. **Path-based:** `#stable-ancestor > div:nth-of-type(2) > button`

### Handling Dynamic/Random IDs

Tango specifically **filters out auto-generated IDs** that contain digits, which effectively handles React (`__react_internal_123`), Radix (`radix-ui-456`), and Angular (`mat-input-789`) dynamic IDs.

```javascript
// Pseudo-code from analysis
function isStableId(id) {
  return !/\d/.test(id); // Reject IDs containing digits
}
```

### Selector Uniqueness Verification

All generated selectors are validated through a `_unique(selector)` function before inclusion in the SelectorTree. This ensures no false positives during replay.

### **What Stept Should Copy:**

1. **Filter out numeric IDs** - Add regex filtering to skip dynamic IDs: `/\d/.test(id)`
2. **Test attribute priority** - Prioritize `data-testid` and similar attributes even higher
3. **Compound selectors** - Generate multi-attribute selectors for increased specificity
4. **Sibling context** - Add `prevSiblingSelectors` and `nextSiblingSelectors` as fallback strategies

---

## 2. Element Finding (Replay Time)

### Multi-Strategy Cascade

Tango employs a **three-stage discovery pipeline** with confidence scoring:

| Stage | Timing | Method | Confidence Range |
|-------|--------|--------|-----------------|
| **Deterministic** | 0-2s (150ms × 13 ticks) | CSS selectors, data-testid, ARIA, XPath, parent chain | 0.35-1.0 |
| **LLM Recovery** | 2s+ | API call with page elements + target description | Variable |
| **Roadblock** | Timeout | Show "Element not found" UI | N/A |

### Confidence Scoring by Method

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

### Timing Strategy

- **Element poll cycle:** 150ms interval (not `requestAnimationFrame`)
- **Position tracking:** 200ms interval (once element found)
- **URL watching:** 500ms interval + `popstate`/`hashchange` listeners
- **DOM detachment check:** `element.isConnected` each poll cycle

### Handling Lazy Rendering & SPA Hydration

**Polling approach:** Tango continues polling for elements for up to 2 seconds during the deterministic phase, which handles most lazy rendering scenarios.

**MutationObserver usage:** Used for Shadow DOM injection and `inert` attribute protection, but not directly for element finding.

**DOM readiness states:** Checks for elements that appear after page load by maintaining persistent polling until found or timeout.

### Element Not Found Handling

When the deterministic phase fails:
1. **LLM Recovery:** Calls API with current page context + target description
2. **Roadblock UI:** Shows "Element not found" with manual intervention options
3. **Skip step:** Allows user to manually advance to next step
4. **Retry mechanism:** User can trigger re-search after manual page changes

### **What Stept Should Copy:**

1. **Confidence scoring system** - Assign numeric confidence to each finding method
2. **150ms polling interval** - More responsive than current 200ms position tracking
3. **2-second deterministic timeout** - Clear boundary between automated and LLM recovery
4. **DOM detachment monitoring** - Check `element.isConnected` during tracking
5. **Multi-method voting** - When multiple methods find the same element, increase confidence

---

## 3. Multi-Page Navigation

### URL Matching Strategy

- **Step-URL association:** Each step stores associated URL(s) during recording
- **Pattern matching:** Service worker matches loaded URL against step expectations
- **Pending state management:** `E.pendingUrl` tracks navigation-in-progress

### Content Script Re-injection

**Manifest configuration (critical):**
```json
{
  "content_scripts": [{
    "all_frames": true,              // Key: runs in ALL frames
    "match_about_blank": true,       // Key: handles about:blank iframes
    "match_origin_as_fallback": true, // Key: fallback injection
    "matches": ["<all_urls>"]
  }]
}
```

**Automatic re-injection:** Content scripts automatically re-inject on navigation due to manifest configuration - no manual re-injection needed.

### Session Persistence

- **Service worker state machine:** Maintains replay state across navigations
- **SessionRecorder:** Persists recording context across page changes
- **beforeunload handling:** Cleans up recorders on page unload

### Back/Forward Navigation

```javascript
if (action === 'go_back') return window.history.go(-1);
```

Direct manipulation of browser history rather than simulating back button clicks.

### **What Stept Should Copy:**

1. **all_frames manifest config** - Enable content script injection in ALL iframes
2. **match_about_blank: true** - Handle dynamically created about:blank frames
3. **Service worker persistence** - Move navigation state to service worker
4. **URL pattern matching** - Store and match URL patterns, not exact URLs
5. **History API usage** - Use `window.history.go()` for reliable back navigation

---

## 4. Disambiguation

### Multiple Element Matching

When multiple elements match the same selector, Tango uses this disambiguation hierarchy:

1. **Parent chain verification** - Matches parent context from SelectorTree
2. **Position-based matching** - Element screen position from recording
3. **Text content matching** - Element text vs. recorded text
4. **Attribute comparison** - Secondary attributes (role, aria-label, etc.)

### Parent Chain Verification

The SelectorTree includes up to 4 levels of parent context. During replay, Tango verifies that the found element has the expected parent chain:

```typescript
function verifyParentChain(element: Element, selectorTree: SelectorTree): boolean {
  let current = element.parentElement;
  let currentTree = selectorTree.parent;
  
  while (current && currentTree) {
    if (!currentTree.selectors.some(sel => current.matches(sel))) {
      return false;
    }
    current = current.parentElement;
    currentTree = currentTree.parent;
  }
  return true;
}
```

### Text Matching Algorithm

Tango's text matching uses a sophisticated fuzzy matching approach:

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

**Scoring formula:**
- Distance penalty based on text length difference
- Exact matches score 0 (best)
- Contains matches get small penalty
- Reverse contains need minimum 3 characters

### Position-Based Matching

When multiple elements pass selector tests, Tango compares their screen positions against recorded coordinates to find the closest match.

### **What Stept Should Copy:**

1. **Parent chain verification** - Store and verify 3-4 levels of parent context
2. **Text distance scoring** - Use Levenshtein distance or similar for text matching
3. **Position fallback** - Use recorded element position as tiebreaker
4. **Multi-attribute scoring** - Weight different attributes by reliability
5. **Fuzzy text matching** - Handle text variations (whitespace, case, partial matches)

---

## 5. Visual Polish & UX Improvements

### Overlay Rendering Architecture

Both Tango and Stept use the same fundamental **CSS clip-path polygon cutout** technique:

```css
/* Current approach in both systems */
overlay.style.clipPath = `polygon(
  0% 0%, 0% 100%, ${x}px 100%, ${x}px ${y}px,
  ${x + w}px ${y}px, ${x + w}px ${y + h}px,
  ${x}px ${y + h}px, ${x}px 100%, 100% 100%, 100% 0%
)`;
```

### Tango's Visual Enhancements

**Backdrop blur for depth:**
```css
.tango-backdrop {
  backdrop-filter: blur(4px);
}
```

**Multi-layer elevation shadows:**
```css
.tango-highlight {
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.04),        /* Subtle border */
    0 2px 6px rgba(0,0,0,0.08),        /* Close shadow */
    0 8px 26px rgba(0,0,0,0.12),       /* Distant shadow */
    0 0 0 4px rgba(58, 176, 138, 0.15); /* Colored glow */
}
```

**Shadow DOM isolation:**
```html
<tango-extension>
  #shadow-root
    <div class="tango-overlay">
      <!-- Overlay content isolated from page CSS -->
    </div>
</tango-extension>
```

### **What Stept Should Copy:**

1. **Add backdrop blur** - `backdrop-filter: blur(4px)` creates professional depth
2. **Multi-layer shadows** - Replace dashed border with layered box-shadow
3. **Shadow DOM isolation** - Prevent page CSS from interfering with overlay
4. **Rounded rectangle cutouts** - Add border-radius to clip-path rectangles

---

## 6. Zoom & Browser Compatibility

### Zoom Compensation Formula

Tango uses the `visualViewport` API for precise zoom handling:

```javascript
function adjustForZoom(rect) {
  // Scale factor = visualViewport.scale × devicePixelRatio
  let scale = (window.visualViewport?.scale ?? 1) * window.devicePixelRatio;
  let offsetX = window.visualViewport?.offsetLeft ?? 0;
  let offsetY = window.visualViewport?.offsetTop ?? 0;

  // Apply scaling with 4px padding
  let x = (rect.x - 4 - offsetX) * scale;
  let y = (rect.y - 4 - offsetY) * scale;
  let width = (rect.width + 8) * scale;
  let height = (rect.height + 8) * scale;

  // Clamp to viewport bounds (main frame only)
  if (!isInIframe()) {
    x = Math.max(x, 4);
    y = Math.max(y, 4);
    width = Math.min(width, window.innerWidth * scale - x - 4);
    height = Math.min(height, window.innerHeight * scale - y - 4);
  }

  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}
```

### Key Zoom Techniques

1. **visualViewport.scale** - Primary zoom detection (more reliable than CSS zoom)
2. **devicePixelRatio** - High-DPI display compensation
3. **visualViewport offset** - Handle zoomed/panned viewport position
4. **Bounds clamping** - Only in main frame (iframes handle differently)
5. **Integer rounding** - Prevent sub-pixel rendering artifacts

### **What Stept Should Copy:**

1. **Switch to visualViewport API** - More accurate than CSS zoom detection
2. **devicePixelRatio compensation** - Handle high-DPI displays properly
3. **Viewport offset handling** - Account for panned/zoomed viewports
4. **Integer coordinate rounding** - Prevent visual artifacts

---

## 7. Performance Optimizations

### Position Tracking Strategy

**Tango's approach:**
- Uses `setInterval` at 200ms for position tracking (once element found)
- Uses 150ms polling for element discovery

**Recommended improvement for Stept:**
Switch to `requestAnimationFrame` for smoother tracking:

```typescript
_startPositionTracking() {
  const update = () => {
    this._updatePositions();
    this._positionFrame = requestAnimationFrame(update);
  };
  this._positionFrame = requestAnimationFrame(update);
}
```

### Layout Stability

**Double requestAnimationFrame** for layout-stable measurements:

```typescript
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    // Now safe to read getBoundingClientRect and write positions
    const rect = element.getBoundingClientRect();
    updateOverlay(rect);
  });
});
```

This technique avoids measuring during layout/paint cycles.

### **What Stept Should Copy:**

1. **Switch to requestAnimationFrame** - More efficient than setInterval for visual updates
2. **Double RAF pattern** - Ensure layout stability before measurements
3. **Lazy module loading** - Only import heavy modules when needed
4. **Event capture phase** - Use `useCapture: true` for reliable event interception

---

## 8. Edge Case Handling

### Obstruction Detection

Before highlighting an element, Tango checks if it's actually visible:

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

Checks if target element is hidden by collapsible ancestors:

```javascript
function needsIntermediateAction(el) {
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

When detected, shows hint: "First, open the accordion to reveal this element"

### Inert Attribute Protection

Prevents page dialogs from hiding overlays:

```javascript
const inertObserver = new MutationObserver(() => {
  if (overlayHost.hasAttribute('inert')) {
    overlayHost.removeAttribute('inert');
  }
});
inertObserver.observe(overlayHost, { attributes: true, attributeFilter: ['inert'] });
```

### **What Stept Should Copy:**

1. **Obstruction detection** - Check if elements are actually visible using `elementFromPoint`
2. **Intermediate action hints** - Detect when accordion/dropdown needs opening first
3. **Inert protection** - Prevent page scripts from making overlay inert
4. **Fixed header detection** - Auto-detect sticky headers for scroll offset

---

## 9. Implementation Roadmap for Stept

### HIGH PRIORITY (Quick Wins)

#### 1. Visual Polish (~1-2 days)
```css
/* Add to guide-runtime */
.guide-backdrop-overlay {
  backdrop-filter: blur(4px);
}

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

#### 2. Position Tracking Upgrade (~1 day)
Replace `setInterval` with `requestAnimationFrame` in position tracking.

#### 3. Zoom Compensation (~2 days)
Implement `visualViewport` API-based zoom handling.

### MEDIUM PRIORITY (1-2 weeks)

#### 4. Element Finding Improvements
- Add confidence scoring system
- Implement obstruction detection
- Add intermediate action detection
- Filter out dynamic IDs with regex

#### 5. Manifest Updates
- Add `all_frames: true` for iframe support
- Add `match_about_blank: true`

### LOWER PRIORITY (Future iterations)

#### 6. Shadow DOM Enhancement
- Recursive shadow root discovery
- MutationObserver for dynamic shadow DOM

#### 7. Navigation Robustness
- Service worker-based state persistence
- URL pattern matching

---

## 10. Architecture Comparison Summary

| Aspect | Tango | Stept Current | Gap Analysis |
|--------|-------|---------------|-------------|
| **Core overlay** | clip-path + blur + shadows | clip-path only | **HIGH**: Add blur & shadows |
| **Position tracking** | setInterval(200ms) | setInterval(200ms) | **MEDIUM**: Switch to rAF |
| **Element finding** | SelectorTree + confidence | Multi-strategy + LLM | **LOW**: Already comparable |
| **Zoom handling** | visualViewport API | CSS zoom detection | **HIGH**: Adopt visualViewport |
| **Iframe support** | all_frames manifest | Partial support | **MEDIUM**: Update manifest |
| **Shadow DOM** | Recursive discovery | Basic support | **LOW**: Enhancement opportunity |
| **Obstruction** | elementFromPoint check | None | **MEDIUM**: Add detection |
| **Edge cases** | Extensive handling | Basic handling | **MEDIUM**: Add robustness |

### Key Insight

**Stept's architecture is fundamentally sound.** The biggest opportunities are **visual polish** (backdrop blur, elevation shadows) and **edge case robustness** (zoom compensation, obstruction detection, iframe support). These are incremental improvements, not architectural rewrites.

The core innovations Stept brings (LLM-powered element recovery, AI-driven step generation) actually **exceed** what Tango offers in intelligent automation. The focus should be on matching Tango's **polish and reliability** while leveraging Stept's **AI advantages**.

---

## Conclusion

Tango's success comes from **attention to detail** in visual presentation and **comprehensive edge case handling**. While Stept already matches Tango's core architecture, adopting Tango's visual polish techniques and robustness patterns will significantly improve user experience and replay reliability.

The recommended approach is to implement the **HIGH PRIORITY** visual polish improvements first (backdrop blur, elevation shadows, zoom compensation) for immediate visual impact, then progressively add edge case handling and robustness features.

Stept's LLM-powered element recovery actually provides **superior** intelligent fallback compared to Tango's manual intervention approach - this should be positioned as a key competitive advantage while achieving visual and reliability parity through these implementation improvements.