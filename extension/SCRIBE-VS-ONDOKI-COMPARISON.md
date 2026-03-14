# Scribe vs Ondoki Chrome Extension — Real Comparison

> Based on actual code analysis of Scribe v2.82.1 and Ondoki plugin source.

---

## Architecture Overview

| | **Scribe** | **Ondoki** |
|---|---|---|
| **Build** | Vite + React + Redux + TypeScript, minified bundles | Vanilla JS, no build step |
| **Total JS** | 3.8MB minified (112 files) | 79KB unminified (4 files) |
| **Content script** | ~216KB (`index.js-Du2_IOgo.js`) — handles click/keyboard/drag/input blur/iframe coordination | ~550 lines (`content.js`) — handles click/type/navigate |
| **Service worker** | ~254KB (`index.js-BrQeGcfK.js`) — state management, screenshot capture, upload | ~1112 lines (`background.js`) — same responsibilities |
| **State** | Redux store (`store-ByapdDsk.js`, 320KB) with structured slices | Plain `state` object in background.js with chrome.storage sync |
| **UI** | React sidepanel + multiple HTML views (8 sidepanel pages!) | Vanilla HTML/CSS sidepanel + popup (dock mode) |
| **Sidepanel pages** | home, capture, recommended-scribes, rejection-feedback, suggested-preview, autocapture-onboarding, dw-non-capture-on/off | Single sidepanel.html with show/hide panels |

**Takeaway**: Scribe is 50x the codebase. Most of that is product surface area we don't need (yet). Our vanilla JS approach is an advantage — lighter, simpler, no build tooling friction.

---

## Click/Event Capture

### Scribe
- Uses `pointerdown` (behind feature flag `cap988UsePointerdown`) or `mousedown` as fallback
- Also tracks: `pointerup`, `pointermove`, `dragend`, `contextmenu`, `visibilitychange`, `input blur`
- Captures **drag events** (start → move → end/cancel) — we don't
- Handles `SELECT` elements specially: listens for `change` event after click, captures selected option text: `Select the "${optionText}" option.`
- Tracks `INPUT_BLUR` events: when user leaves an input field, captures the field position + attributes
- Uses `devicePixelRatio` for coordinate scaling
- Captures full `domString` (`document.body.outerHTML`) with every action — used server-side for description generation and DOM replay
- Captures `target_parent_attributes` and `target_parent_tag` — we don't look at parent at all

### Ondoki
- Uses `mousedown` (within click listener via `addEventListener('click', ..., true)`)
- Tracks: click, type (input/change events), navigation
- No drag support
- No select special handling
- No domString capture
- No parent element data

### What Scribe does that we should steal:
1. **`pointerdown` instead of `click`** — fires earlier, more reliable, captures before any JS handlers can change the DOM
2. **SELECT element handling** — capture the chosen option, generate "Select the X option" description
3. **Input blur tracking** — detect when user finishes filling a field (for merge/description purposes)
4. **Parent element attributes** — helps with description when target itself has no label
5. **devicePixelRatio** — coordinate accuracy on retina displays (we do capture this already)

### What Scribe does that we DON'T need:
- Full DOM serialization per step (huge payload, server-dependent) — our approach of capturing key element info is lighter
- Drag tracking (edge case for most workflow docs)
- The iframe coordination complexity (10+ message types for cross-frame positioning) — handle when needed

---

## Element Identification & Selectors

### Scribe
Uses TWO selector strategies behind a feature flag (`guideMeSelectorMethod`):

1. **`medv_finder`** (default) — imported from `index.esm-7zdG6h4U.js` (external lib, likely [finder](https://github.com/nicedoc/finder) or similar)
2. **`robust`** — custom algorithm in `capture-helpers-LfDo8rfb.js`:
   - Try `#id` first (skip if id contains digits — dynamic IDs)
   - Try data attributes: `data-testid`, `data-test`, `data-cy`, `data-id`, `aria-label`, `name`, `placeholder`, `title`, `alt`, `role`
   - Combine multiple attributes if single isn't unique
   - Fallback: full path with `nth-of-type`

Collected attributes per target (`getTargetElementAttributes`):
- Priority: `aria-label`, `aria-placeholder`, `aria-description`, `aria-labelledby`, `data-cy`, `data-id`, `data-role`, `data-test`, `data-testid`, `href`, `name`, `role`, `placeholder`, `alt`
- Secondary: `class`, `value`, `aria-selected`, `aria-hidden`
- Excluded: `d`, `fill`, `style`, IDs with digits

### Ondoki
- Uses `tagName`, `type`, `text`, `href`, `ariaLabel`, `id`, `classList`, `name`, `placeholder`
- No CSS selector generation
- No xpath
- No parent traversal for labeling

### What to steal:
1. **Associated label detection** — Scribe uses `aria-labelledby`, `aria-label`, `placeholder`, `title`, `alt`, `name` in priority order. We should do the same PLUS `<label for="">` association.
2. **Parent element info** — when target has no label, check parent
3. **Data-testid/data-cy** awareness — useful for description hints

---

## Screenshot Capture

### Scribe
- `chrome.tabs.captureVisibleTab()` — same as us
- Also captures `domString` (full page HTML) per step — used server-side for:
  - Regenerating screenshots
  - Annotating elements in the DOM copy
  - "Guide Me" interactive replay
- Has `domCopyAnnotate-BJrU2wh2.js` (15KB) — likely used to create annotated HTML renders from the DOM copy
- `dwScreenshotsDB` — stores screenshots in IndexedDB (not just in-memory/chrome.storage)

### Ondoki
- `chrome.tabs.captureVisibleTab()` — same approach
- Screenshots stored as data URLs in chrome.storage (via state.steps)
- No DOM serialization
- No IndexedDB storage

### Key difference:
Scribe stores screenshots in **IndexedDB** (`dwScreenshotsDB`) — more reliable for large data. We store in `chrome.storage.local` via `persistedSteps`. IndexedDB can handle much larger blobs without hitting storage limits.

### What to steal:
1. **IndexedDB for screenshots** — chrome.storage.local has a 10MB limit (UNLIMITEDPRESTORAGE can help but IDB is better practice for binary blobs)
2. **Don't need DOM serialization** — our element info approach is lighter and description generation can happen client-side

---

## PII Redaction

### Scribe
**DOM-level redaction** — modifies the page BEFORE screenshot capture:

1. `RedactionManager` class with MutationObserver
2. Redaction targets (configurable):
   - Text nodes with `@` (email addresses)
   - Text nodes with digits (numbers)
   - Long text (>100 chars)
   - Form fields
   - Images
   - Custom CSS targets
   - Table rows
3. **How it works**:
   - Finds target elements → sets `currently-redacted` attribute → applies CSS to hide/blur content
   - On `mouseenter`: temporarily removes redaction (so user sees real content)
   - On `mouseleave`: re-applies redaction
   - MutationObserver watches for new DOM nodes → auto-redacts added content
   - Runs continuously during recording
4. **Shadow DOM support** — creates separate `RedactionManager` instances for shadow roots

### Ondoki
- No PII redaction at all currently

### What to steal:
The entire approach. **DOM-level redaction before screenshot is brilliant** — no image processing needed, zero performance cost, works perfectly because the screenshot just captures the already-redacted DOM.

**Implementation for Ondoki**:
```javascript
// Simple version - apply CSS to sensitive elements before captureVisibleTab()
function applyRedaction(doc) {
  const targets = [
    ...doc.querySelectorAll('input[type="password"]'),
    ...doc.querySelectorAll('input[type="email"]'),
    ...doc.querySelectorAll('input[autocomplete*="name"]'),
    ...doc.querySelectorAll('input[type="tel"]'),
    ...doc.querySelectorAll('input[autocomplete*="cc-"]'),
  ];
  targets.forEach(el => {
    if (el.value) {
      el.dataset.ondokiOriginalValue = el.value;
      el.value = '•'.repeat(el.value.length);
    }
  });
  return () => {
    // Restore after screenshot
    targets.forEach(el => {
      if (el.dataset.ondokiOriginalValue !== undefined) {
        el.value = el.dataset.ondokiOriginalValue;
        delete el.dataset.ondokiOriginalValue;
      }
    });
  };
}

// In content.js, before sending CLICK_EVENT:
const restoreRedaction = applyRedaction(document);
// ... send click event (background.js will captureVisibleTab)
// Wait for screenshot confirmation, then:
restoreRedaction();
```

**Key design decision**: Scribe's approach runs redaction continuously. We can do it **only at screenshot time** — simpler, less risk of breaking page functionality. Apply → capture → restore, all within milliseconds.

---

## Step Description Generation

### Scribe
- **Client-side**: sends raw `target_text`, `target_tag`, `target_element_attributes`, and full `domString` to backend
- **Server-side**: AI generates descriptions from the DOM context
- The extension itself generates minimal descriptions:
  - Click: `description` variable (constructed from element text/attributes, details minified away)
  - Select: `Select the "${optionText}" option.`
  - Drag: `"Mouse drag start."`, `"Drop here."`, `"Mouse drag cancel."`
  - Type/Input: captured via INPUT_BLUR event, description generated server-side

### Ondoki
- **Client-side only**: `generateClickDescription()` in content.js
- Handles: buttons, links, inputs, selects, text content
- Descriptions like: `Click on the "Submit" button`, `Type "hello" into text field`

### What to steal:
Not much — Scribe pushes description generation to their server (with AI). Our client-side approach is actually fine for an open-source product. We just need to improve the element label detection (see Element Identification section above).

---

## Features Scribe Has That We Don't

| Feature | Scribe | Priority for Us |
|---------|--------|----------------|
| **Autocapture / URL streaming** | Background recording of all page visits for "suggested scribes" | ❌ Skip — this is their upsell/enterprise feature |
| **"Guide Me"** interactive replay | Replays recorded steps as interactive overlay on the live page | 🟡 Cool but not P0 — needs robust selectors first |
| **Voice transcription** | Record audio during capture, transcribe | ❌ Skip |
| **Desktop Writer** | Desktop app integration | ❌ We have Electron already |
| **Suggested Scribes** | AI recommends creating docs based on browsing patterns | ❌ Enterprise feature |
| **Rejection feedback** | When user cancels recording, asks why | 🟡 Nice UX touch, trivial to add |
| **Allowed domains** | Admin can restrict recording to certain domains | 🟡 Enterprise, not needed now |
| **Optimize** | AI rewrites/improves existing docs | ❌ Server-side feature |
| **DOM serialization** | Full page HTML per step | 🟡 Enables "Guide Me" but heavy payload |
| **Drag tracking** | Captures drag & drop actions | 🟢 Nice to have, not critical |
| **IndexedDB storage** | Screenshots in IDB instead of chrome.storage | 🟢 Should do this — more reliable |

---

## What We're Actually Better At (or Equal)

| Aspect | Our Advantage |
|--------|---------------|
| **Codebase simplicity** | 2500 lines vs ~50K+ (estimated pre-minification). Easier to maintain, debug, contribute to. |
| **No build step** | Vanilla JS — anyone can read the code, modify, and reload. Scribe needs Vite + React + TS build. |
| **Dual UI mode** | Sidepanel + dock overlay. Scribe only has sidepanel + popup dropdown. |
| **Pre-click screenshots** | We capture before the click effect. Scribe has `shouldUseEarlyScreenshot` flag suggesting this was a retrofit. |
| **Self-hosted** | We work with any backend URL. Scribe is SaaS-only. |
| **Open source** | Full transparency. Scribe is closed source. |
| **Navigate-after-click suppression** | Already handles the click→navigate merge. Scribe tracks this too but with more complexity. |
| **Step persistence** | Steps survive SW restart via chrome.storage. Scribe uses IndexedDB (both work). |

---

## Updated Priority List (Based on Real Analysis)

### Must Do (closes real gaps)

1. **DOM-level PII redaction** (2-3 days)
   - Scribe's best trick. Apply CSS redaction before `captureVisibleTab()`, restore after.
   - Start simple: password, email, name, phone, CC fields by autocomplete/type attribute.
   - Add MutationObserver later for dynamic content.

2. **Better element detection** (2 days)
   - Add: `aria-labelledby` resolution, `<label for="">` association, parent element label, `title`, `alt`
   - Priority chain: `aria-label` → `<label>` → `placeholder` → `title` → `alt` → `name` → parent text → tag name

3. **SELECT element handling** (0.5 day)
   - Scribe generates `Select the "Option Text" option.` — we should too
   - Listen for `change` event on select after click, capture selected option text

4. **`pointerdown` migration** (0.5 day)
   - Scribe uses `pointerdown` with capture phase — fires earlier, more reliable
   - Simple swap from `click` listener to `pointerdown`

5. **IndexedDB for screenshots** (1 day)
   - Scribe uses `dwScreenshotsDB` — we should move screenshots out of chrome.storage.local
   - Prevents hitting storage limits on long recordings

6. **API URL build config** (1 day)
   - Cloud build: hardcoded `app.ondoki.io`
   - Self-hosted build: configurable

7. **Critical bug fixes** (2-3 days)
   - Pause/resume content script sync
   - SW restart re-injection
   - Dock UI state sync

### Should Do (polish)

8. **Step merge UI** (2-3 days)
   - Multi-select + merge in sidepanel (pre-upload)
   - Server-side AI merge as editing action (post-upload)

9. **Auto-zoom screenshot display** (2 days)
   - CSS transform to zoom into click area by default
   - Toggle to full view

10. **Input blur tracking** (1 day)
    - Detect when user finishes filling a field
    - Enables better type step descriptions: `Type "alex@..." in the Email field`

11. **Instant share link** (2-3 days)
    - Upload returns share URL before processing completes

### Skip (not worth it now)

- DOM serialization (heavy, only needed for "Guide Me" replay)
- Autocapture / URL streaming (enterprise upsell)
- Voice transcription (different product)
- Drag tracking (edge case)
- Suggested scribes (needs user base + data)

---

## Revised Timeline

| Week | Work | Impact |
|------|------|--------|
| **1** | PII redaction (#1) + Element detection (#2) + SELECT handling (#3) + pointerdown (#4) + Bug fixes (#7) | Recording quality matches Scribe's capture |
| **2** | IndexedDB (#5) + API URL config (#6) + Step merge UI (#8) + Input blur (#10) | Reliability + polish |
| **3** | Auto-zoom display (#9) + Instant share link (#11) | UX polish + sharing |

**Total: 3 weeks. Then ship to Chrome Web Store.**
