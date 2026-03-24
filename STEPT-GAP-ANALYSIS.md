# stept Gap Analysis: Vision vs Reality

**Date**: 2026-03-24
**Scope**: VISION-ARCHITECTURE.md vs actual implementation
**Files analyzed**: 13 core files, ~5000 lines of code

---

## 1. VISION vs REALITY Matrix

| Feature | Status | Details |
|---------|--------|---------|
| **Mode 1: AI-Guided** | **NOT STARTED** | No documentation-to-guide pipeline, no task planning from LLM knowledge, no live DOM→element matching for AI-generated steps. The `stept-engine` agent.py exists but is a headless browser automation agent (browser-use clone), NOT the extension-side "teach the human" flow described in the vision. |
| **Mode 2: Recorded Replay** | **PARTIAL** | Core replay loop works. Element finding has 7+ strategies. Overlay renders. But plagued by polling-based architecture, position tracking jank, and reliability issues (see Section 2). |
| **Mode 3: Hybrid/Self-Healing** | **PARTIAL** | LLM recovery endpoint exists (`guide_recovery.py`, `element_recovery.py`). Guide runtime calls it after Layer 1 timeout. But **self-healing is NOT implemented** — the `update_workflow_step_selectors` function is entirely commented out as TODO. Recovery finds element but never updates the recording. |
| **Three-Layer Element Finding** | **PARTIAL** | Layer 1 (Deterministic): Implemented with SelectorTree + vote counting + parent chain disambiguation. Layer 2 (AI Recovery): Endpoint exists, wired into runtime. Layer 3 (Human Fallback): Side panel shows screenshot + "Mark as complete". All three layers exist but Layer 2→self-heal is broken (no recording update). |
| **SelectorTree with parent chain** | **IMPLEMENTED** | `captureSelectorTree()` in elements.ts captures recursive parent chain with sibling selectors up to depth 4. `findElementByTree()` in index.ts implements vote-counting and `disambiguateByParentChain()`. This is one of the better-implemented features. |
| **ElementWatcher event-driven pattern** | **NOT STARTED** | Vision specifies Usertour's `ElementWatcher` class with `setTimeout` retries and event emission (`found`, `changed`, `timeout`). Reality: uses `setInterval` polling at 150ms (`_startElementPolling`). No event emitter, no watcher class, no clean lifecycle. The abandoned rewrite (`index.rewrite-v2.ts.bak`) attempted this but was never completed. |
| **OverlayRenderer (light Tango-style)** | **PARTIAL** | The overlay renders via Shadow DOM with dashed border highlight + tooltip. It's functional but NOT a separate class — it's mixed into GuideRunner as `_renderOverlay`, `_renderNotFound`, `_renderRoadblock`, `_renderIntermediateHint`, `_createTooltip`, `_positionTooltip`. No clean separation. Dark theme only (stone-900 palette), not the "light Tango-style" specified. |
| **GuideRunner state machine** | **PARTIAL** | Vision specifies: `IDLE → SEARCHING → ACTIVE/NOT_FOUND → ADVANCING → COMPLETED`. Reality: no formal state machine. State is implicit via `_pollInterval`, `currentIndex`, `lastStatus` string checks. No state enum, no transition guards, no state validation. |
| **Multi-page SPA handling** | **PARTIAL** | `URLWatcher` class exists with popstate/hashchange listeners + 500ms polling. `_handleUrlChange` does step-URL matching and auto-advance. `_findStepForUrl` scans steps. BUT: full page navigation relies on background script re-injection with a 1500ms hardcoded delay (`_injectGuideAfterLoad`), which is fragile. No robust SPA mutation detection. |
| **Documentation-to-Guide pipeline** | **NOT STARTED** | Vision describes fetching docs URLs, extracting steps via LLM, caching, converting to guide plans. Zero implementation exists for this. |
| **Knowledge base search** | **NOT STARTED** | Vision describes searching existing recordings/workflows to avoid AI calls. No search infrastructure exists. |
| **Self-healing recording update** | **NOT STARTED** | The entire `update_workflow_step_selectors` function is commented out as TODO in `guide_recovery.py:164-181`. When LLM recovery succeeds, it returns `new_selectors` but they are never persisted back to the workflow. |
| **Cross-origin iframe support** | **PARTIAL** | Child frame message listener exists for `GUIDE_FIND_IN_FRAME`. Parent frame sends `GUIDE_FIND_IN_FRAMES` via background. But the result is effectively discarded — comment at line 510 says "prefer local results if any exist" and no actual cross-origin element manipulation occurs. |

### Summary Scorecard
- **IMPLEMENTED**: 1 (SelectorTree capture)
- **PARTIAL**: 7 (Mode 2, Mode 3, Three-Layer, Overlay, State Machine, Multi-page, Cross-origin iframe)
- **NOT STARTED**: 5 (Mode 1 AI-Guided, ElementWatcher, Doc Pipeline, Knowledge Search, Self-Healing Update)
- **BROKEN**: 0 technically, but several PARTIAL features have critical bugs

---

## 2. CRITICAL BUGS in Current Implementation

### Bug 1: Sluggish Performance — Polling Bottleneck

**Location**: `index.ts:1040-1154` (`_startElementPolling`)

The entire element search uses `setInterval` at 150ms (`POLL_MS = 150`). Each tick calls `findGuideElement()` which:
1. Calls `collectSearchRoots()` — traverses ALL shadow roots and same-origin iframes via `querySelectorAll("*")` (line 139). On complex pages this touches thousands of DOM nodes.
2. For each root, calls `findInRoot()` which tries SelectorTree, then CSS selector, then testid, then role+text, then tag+text, then XPath, then parent chain, then title-hint — up to 8 strategies sequentially.
3. Position tracking (`_startPositionTracking`, line 2002) runs a SEPARATE `setInterval` at 200ms that calls `_getAdjustedRect` + `_updateCutout` + `_positionTooltip` every tick.

**Impact**: Two concurrent intervals (150ms element poll + 200ms position tracking) compete for the main thread. `collectSearchRoots()` with `querySelectorAll("*")` on every tick is O(n) where n = total DOM nodes.

**Fix**: Replace polling with MutationObserver-based ElementWatcher (vision's design). Use `requestAnimationFrame` for position updates instead of setInterval.

### Bug 2: Harsh UI / Styling

**Location**: `index.ts:564-814` (STYLES constant)

The overlay uses a hard-coded dark theme (stone-900 palette: `#1C1917` backgrounds, `#E7E5E4` text, `#292524` borders) which clashes with light-themed websites. The vision calls for "light Tango-style" overlay — Tango uses a light translucent approach with subtle dashed borders.

Specific issues:
- Tooltip at `max-width: 320px` is oversized for simple hints. Vision says "hint pill" not full tooltip panel.
- `box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5)` is extremely heavy and visually jarring.
- Dark theme tooltip on a white website has no visual continuity.
- The `guide-backdrop-overlay` has `background: transparent` but `clip-path` polygon cutout — this creates no dimming effect, making the cutout invisible on many pages.

### Bug 3: SPA Flakiness — DOM Tracking Breaks

**Location**: `index.ts:2001-2030` (`_startPositionTracking`)

When the position tracking interval detects `!result.element.isConnected` (element removed from DOM during SPA re-render), it calls `findGuideElement(step)` asynchronously inside a `setInterval` callback. This has multiple issues:

1. **Race condition**: The async `findGuideElement` may complete after the interval fires again, leading to concurrent searches.
2. **No backoff**: If the element is temporarily gone during SPA transition, the interval keeps firing every 200ms.
3. **Stale closure**: `result` is reassigned inside the interval callback (`result = newResult` at line 2008), mutating the captured variable from the outer scope. This can cause the highlight to jump between old and new positions.
4. **No re-setup of click handlers**: When a new element is found after disconnection, click handlers from `_setupClickAdvance` are still pointing at the old (disconnected) element. The user clicks the new element and nothing happens.

### Bug 4: Broken Bounding Boxes — Clip-Path Math Bug

**Location**: `index.ts:1677-1689` (`_updateCutout`)

The clip-path polygon is:
```
polygon(
  0% 0%, 0% 100%, ${x}px 100%, ${x}px ${y}px,
  ${x + w}px ${y}px, ${x + w}px ${y + h}px,
  ${x}px ${y + h}px, ${x}px 100%, 100% 100%, 100% 0%
)
```

This creates a rectangular cutout but **does NOT produce rounded corners** despite `r = 6` being computed at line 1682 and never used. The `border-radius: 6px` on the highlight box suggests rounded corners were intended.

Additionally, the cutout has **no border-radius** while the highlight ring has `border-radius: 6px`, creating a visual mismatch — the dashed border is rounded but the backdrop cutout is sharp-cornered.

The backdrop overlay has `background: transparent` (line 583), so the entire cutout mechanism is **functionally invisible** — it only affects pointer-events, not visual dimming. The cutout math is correct but the visual effect is zero.

### Bug 5: Mangled Images

**Location**: `sidepanel.css` — No specific CSS for `.step-screenshot` image sizing.

The `GuideStepImage` component (GuideStepsPanel.tsx:225-258) renders images inside `.guide-stepper-screenshot` but there are **no CSS rules** in sidepanel.css for `.guide-stepper-screenshot` or `.step-screenshot`. The image rendering relies entirely on browser defaults.

Without explicit `max-width: 100%`, `object-fit`, or `aspect-ratio` rules:
- Screenshots can overflow their container
- Aspect ratio may be distorted
- Large screenshots push content off-screen
- The click-marker overlay (absolute positioned) can misalign without constrained image dimensions

The CSS file has styles up to `.api-url-row` but **no guide stepper styles at all** — the GuideStepsPanel component's CSS classes (`.guide-stepper-item`, `.guide-stepper-circle`, `.guide-stepper-line`, `.guide-stepper-content`, etc.) are **completely missing** from sidepanel.css.

### Bug 6: Jarring Scrolling

**Location**: `index.ts:1616-1624` (`_scrollToElement`)

```typescript
_scrollToElement(result: FindResult): void {
  const rect = this._getAdjustedRect(result);
  const inView = rect.top >= 0 && rect.bottom <= window.innerHeight
    && rect.left >= 0 && rect.right <= window.innerWidth;
  if (!inView) {
    result.element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }
}
```

Issues:
1. `scrollIntoView({ behavior: "smooth" })` uses the browser's native smooth scroll which has inconsistent speed across browsers and can be very slow for long distances.
2. `block: "center"` forces the element to the vertical center, which is jarring — it scrolls even when the element is "almost" in view.
3. The 80ms delay after scroll (line 1131: `await new Promise<void>((r) => setTimeout(r, 80))`) is insufficient for smooth scroll to complete. The overlay renders before scroll finishes, causing the highlight to appear at the wrong position then "chase" the element.
4. The position tracking interval then kicks in at 200ms, causing visible jitter as it repeatedly repositions the highlight during the scroll animation.
5. No scroll padding — the element ends up right at the edge of the viewport with no breathing room for the tooltip.

### Bug 7: Event Listener Race Conditions — Cleanup Gaps

**Location**: `index.ts:2039-2127` (`_setupClickAdvance`, `_removeClickHandler`)

1. **Parent click handler not always cleaned**: `_parentClickHandler` is added with `{ once: true }` (line 2089) but also tracked for manual removal. If the parent fires the handler (removing it via `once`), then `_removeClickHandler` tries to `removeEventListener` on an already-removed handler — harmless but indicates unclear ownership.

2. **Keyboard handler leak**: `_keyHandler` is added on `document` with `{ capture: true }` (line 2107). If `_setupClickAdvance` is called again before `_removeClickHandler` (e.g., rapid step changes), the old keyHandler remains attached because `_removeClickHandler` only removes the current `this._keyHandler` reference, but by then it's been overwritten.

3. **Completion detection race**: `_setupCompletionDetection` (line 2130) for type steps adds `input`/`change`/`paste` listeners. The `_completionTimeout` at 1500ms auto-advances. But if the user is still typing when the timeout fires, the step advances prematurely. No debounce reset on continued typing.

4. **Missing cleanup in _clearOverlay**: `_clearOverlay` (line 1020) calls `_removeClickHandler` and `_disconnectCompletionObserver` but does NOT clear the `currentResult` reference, the search hint element in shadow DOM, or the `_intermediatePanel` properly (it removes it but the reference isn't used elsewhere consistently).

5. **AbortController for type detection**: The AbortController pattern (line 2157-2166) is good but the document-level `input` listener (line 2163) is on document with capture, which means it fires for ALL inputs on the page, not just the target element. The guard `e.target === element` mitigates this but it's wasteful.

---

## 3. CODE QUALITY Assessment

### Dead Code / Commented-Out Experiments

1. **Two backup files exist**:
   - `index.rewrite-v2.ts.bak` — Abandoned complete rewrite attempting the event-driven architecture. ~50 lines of types visible, unclear total size.
   - `index.ts.backup` — Previous version of the runtime, nearly identical to current structure.

2. **Commented-out self-healing** in `guide_recovery.py:115-121` and `164-181` — The entire `update_workflow_step_selectors` function is commented out.

3. **`generateMultiSelectors`** in `elements.ts:263-265` is just a wrapper that calls `generateSelectorSet` and returns the same result. Dead indirection.

4. **Vision-only code in agent.py**: The `Agent` class with REPLAY/AGENT/HYBRID modes is a headless browser automation agent, not used by the extension at all. It imports from modules (`browser.py`, `actions.py`, `finder.py`, `storage/`) that serve a different purpose than the extension's guide runtime.

5. **Deleted markdown files** in git status: 7 `.md` files are staged for deletion (AGENT-ENGINE-PLAN.md, DAP-FEATURES-FULL.md, etc.) — documentation churn.

### Missing Error Handling

1. **`_callRecoveryApi`** (index.ts:1338-1358): Calls `fetch('/api/v1/guide/recover-element')` with a hardcoded relative URL. On any website, this resolves to `https://that-website.com/api/v1/guide/recover-element` — **it will NEVER work** because the recovery API is on the stept backend, not the current page. Should use `chrome.runtime.sendMessage` to proxy through the background script, or use the actual API base URL.

2. **No auth headers** on recovery API call (line 1343: `// TODO: Add auth headers if needed`).

3. **`_findDomElementByInfo`** (index.ts:1360-1396): The deduplication logic doesn't match — `dedupeKey` is computed but never checked against a `seen` set. The index-based matching (`elementIndex === elementInfo.index`) assumes the DOM hasn't changed between collection and lookup, which is fragile.

4. **`collectSearchRoots`** (index.ts:132-172): `querySelectorAll("*")` catches all exceptions silently. If an iframe is mid-load, the entire shadow root traversal silently fails.

### State Management Issues

1. **No formal state enum**: The guide runner's state is spread across: `currentIndex`, `_stepSeq`, `_pollInterval` (null or set), `_clickHandler` (null or set), `lastStatus` (string in closure), `_replacing` flag. It's impossible to know "what state is the runner in?" without checking 6+ properties.

2. **Mutable closure in polling**: `_startElementPolling` captures `lastStatus` and `tickCount` in a closure. The `poll` function is async but called from `setInterval`, meaning multiple poll invocations can be in-flight simultaneously. `lastStatus` can be read/written by concurrent polls.

3. **Singleton confusion**: `activeRunner` (line 2296) and `_window.__steptGuideRunner` (line 2297) are separate references to the same runner. Both must be kept in sync manually.

### Memory Leaks

1. **Position tracking interval** (`positionInterval`): Cleared in `stop()` and `_clearPositionTracking()`, but if `showStep` is called before the previous step's position tracking is cleared, the old interval may leak. `_clearOverlay` calls `_clearPositionTracking` which should prevent this, but the async nature of `showStep` means there's a window.

2. **URL watcher interval** (`_urlWatcher._interval`): The 500ms `setInterval` in URLWatcher runs until explicitly stopped. If the guide runner is garbage collected without `stop()` being called (e.g., page navigation destroys the script context), the interval persists.

3. **MutationObservers**: `_inertObserver` and `_zoomObserver` are properly disconnected in `stop()`. `_completionObserver` is properly disconnected. This is actually well-handled.

4. **Event listeners on document**: `_keyHandler` on `document` with capture. If `stop()` is not called (abnormal termination), this persists. The dedup cleanup (line 100-108) only stops the runner, it doesn't explicitly remove document-level listeners.

5. **Search hint elements**: Created in `_startElementPolling` (line 1049-1063) and removed on success (line 1117-1118), but if polling is stopped externally (via `_stopElementPolling`), the hint element remains in the shadow DOM.

---

## 4. WHAT WORKS vs WHAT'S BROKEN

### What Genuinely Works

1. **SelectorTree capture** (`elements.ts:271-306`): Well-implemented recursive capture with parent chain, sibling selectors, and depth limiting. Good deduplication.

2. **Multi-strategy selector generation** (`elements.ts:185-257`): 9 strategies including ID, data-testid, aria-label, name, placeholder, compound attributes, and path selectors. Uniqueness checking via `_unique()`.

3. **Shadow DOM overlay isolation**: Using a custom element (`stept-guide-overlay`) with closed shadow root prevents style leakage in both directions. The inert-attribute protection (line 998-1004) is a clever defense against modal dialogs.

4. **Zoom compensation** (line 1006-1017): Counteracts page CSS zoom to keep overlay pixel-perfect.

5. **Tooltip positioning** (line 1797-1841): Four-direction placement with viewport boundary awareness and fallback centering.

6. **Deduplication via custom event** (line 96-113): Tango-inspired pattern for killing previous script instances.

7. **Side panel UI** (`GuideStepsPanel.tsx`): Clean React component with step stepper, image loading with caching, click markers, and roadblock states.

8. **LLM recovery backend** (`element_recovery.py`): Well-structured prompt engineering for element matching with confidence scoring and input validation.

9. **Element capture richness** (`gatherElementInfo` in elements.ts): Comprehensive — captures 25+ attributes per element including aria, associated labels, parent chain, sibling text, iframe context.

10. **Obstruction detection** (line 521-536): `elementFromPoint` center check to detect if overlapping elements block the target.

### What's Fundamentally Broken

1. **Recovery API URL** — `fetch('/api/v1/guide/recover-element')` resolves to the CURRENT WEBSITE's domain, not the stept API. Layer 2 recovery **cannot work** in production. This is a showstopper bug.

2. **Self-healing never persists** — Even if recovery worked, `update_workflow_step_selectors` is commented out. The entire Mode 3 value proposition (recordings auto-update) is non-functional.

3. **No event-driven architecture** — The entire runtime is polling-based. This causes:
   - CPU waste on every page
   - Delayed element detection (up to 150ms latency)
   - Race conditions between concurrent polls
   - Position tracking jitter

4. **No dimming/backdrop effect** — The backdrop overlay is `background: transparent`. The clip-path cutout affects nothing visually. Users can't tell what's being highlighted vs what's background.

5. **Missing side panel CSS** — The guide stepper component (`.guide-stepper-item`, `.guide-stepper-circle`, etc.) has **zero CSS rules** in sidepanel.css. The component renders with browser defaults — no spacing, no colors, no layout.

6. **SPA step advancement breaks** — When a SPA re-renders the target element, `isConnected` becomes false, the position tracker tries to re-find, but click handlers are still on the old element. User clicks do nothing.

7. **Mode 1 doesn't exist** — The killer feature (AI reads docs, teaches user in real-time) has zero implementation in the extension.

---

## 5. RECOMMENDED IMPLEMENTATION ORDER

### Priority 1: Fix Showstopper Bugs (1-2 days)

1. **Fix recovery API URL**: Route through background script or use configured API base URL. Without this, Layer 2 is dead.

2. **Add missing sidepanel CSS**: Add styles for `.guide-stepper-item`, `.guide-stepper-circle`, `.guide-stepper-line`, `.guide-stepper-content`, `.guide-stepper-screenshot`, `.step-screenshot`, `.click-marker`. Without these, the step list panel is unstyled.

3. **Add backdrop dimming**: Change `.guide-backdrop-overlay` background from `transparent` to `rgba(0, 0, 0, 0.3)` or similar. Instant visual improvement.

### Priority 2: Rewrite Guide Runtime Core (1-2 weeks)

This is the highest-impact architectural change. Replace the monolithic GuideRunner with the vision's component architecture:

1. **ElementWatcher** — Event-driven with setTimeout retries (not setInterval). Emits `found`, `changed`, `timeout`. Uses MutationObserver to detect element removal/replacement.

2. **StepExecutor** — Owns one step's lifecycle. Creates watcher, subscribes to events, manages click handlers. Clean `destroy()` removes ALL handlers.

3. **OverlayRenderer** — Separate class. Light mode option (dashed border + hint pill) alongside current dark tooltip. Uses `requestAnimationFrame` for position updates.

4. **GuideRunner** — Formal state machine with enum states and transition guards. Orchestrates StepExecutors sequentially.

### Priority 3: Fix SPA Handling (3-5 days)

1. Replace position tracking `setInterval` with `requestAnimationFrame` + `IntersectionObserver`.
2. Use `MutationObserver` on the target element's parent to detect re-renders.
3. When element is re-rendered, automatically re-find and re-attach click handlers.
4. Improve scroll behavior: use `scrollIntoView` with a wrapper that waits for scroll completion before rendering overlay.

### Priority 4: Implement Self-Healing (3-5 days)

1. Implement `update_workflow_step_selectors` in the backend.
2. Wire it into the recovery endpoint response flow.
3. Add a background script message handler to proxy the recovery API call with proper auth.
4. Test: break a selector, verify LLM finds element AND recording is updated.

### Priority 5: Mode 1 AI-Guided (2-4 weeks)

This is the differentiator but depends on solid Mode 2 + Mode 3:

1. **Task planner**: LLM call to generate step plan from task description.
2. **Live element matching**: For each plan step, extract page elements and ask LLM which one matches.
3. **Step-by-step guidance**: Show highlight + hint for each matched element.
4. **Recording capture**: Save each completed step as a recording for future replay.
5. **Documentation fetching**: Optional — fetch docs URL and extract steps via LLM.

### Priority 6: Polish and Extras

- Knowledge base search (requires backend infrastructure)
- Documentation-to-guide pipeline
- Community workflow library
- Cross-origin iframe full support
- Light/dark theme toggle for overlay

---

## Appendix: File-by-File Assessment

| File | Lines | Health | Key Issues |
|------|-------|--------|------------|
| `guide-runtime/index.ts` | 2334 | Poor | Monolithic, polling-based, recovery API URL broken, no state machine |
| `guide-runtime/index.rewrite-v2.ts.bak` | ~2000+ | Dead | Abandoned rewrite attempt |
| `guide-runtime/index.ts.backup` | ~2300 | Dead | Previous version backup |
| `background/guides.ts` | 32 | OK | Simple but 1500ms hardcoded delay is fragile |
| `content/elements.ts` | 464 | Good | Well-structured, comprehensive capture |
| `sidepanel/GuideStepsPanel.tsx` | 260 | Good | Clean React, good patterns, but missing CSS |
| `sidepanel/sidepanel.css` | ~600 | Incomplete | Missing ALL guide stepper styles |
| `stept-engine/dom.py` | 532 | Good | Solid DOM extraction, not used by extension |
| `stept-engine/agent.py` | ~400+ | OK | Headless automation, unrelated to extension |
| `stept-engine/prompts.py` | 73 | OK | Clean system prompt |
| `api/routers/guide_recovery.py` | 181 | Partial | Self-healing TODO, otherwise solid |
| `api/services/element_recovery.py` | 271 | Good | Well-structured LLM recovery |
