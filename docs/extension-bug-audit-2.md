# Extension Bug Audit #2

**Date:** 2026-03-20  
**Auditor:** Claude (automated deep-read analysis)  
**Scope:** Content scripts, background scripts, sidepanel CSS, shared messages  
**Focus:** Blur appearing without consent (P0), missed click captures (P0), sidepanel layout (P1)

---

## P0 — Blur Appearing Without User Consent

### BUG-01: Redaction auto-applied on every page navigation during recording

**Severity:** P0  
**File:** `extension/src/background/index.ts:892`  
**Symptom:** Random blur effects appear on the page while recording, even though the user never enabled Smart Blur or configured redaction.

**Root cause:** In the `chrome.tabs.onUpdated` listener (fires every time a tab finishes loading during recording), the background script unconditionally sends `APPLY_REDACTION` to the content script:

```typescript
// Re-apply active redaction on the new page
chrome.tabs.sendMessage(tabId, { type: 'APPLY_REDACTION' }).catch(() => {});
```

In `redaction.ts`, when `APPLY_REDACTION` is received, it calls `loadSettings().then(() => applyAllEnabled())`. The `loadSettings()` function merges stored settings with **hardcoded defaults** that have several categories **enabled by default**:

```typescript
// redaction.ts — default settings
let redactionSettings = {
  enabled: true,       // ← redaction is ON by default
  emails: true,        // ← ON by default
  names: true,         // ← ON by default
  numbers: false,
  formFields: true,    // ← ON by default
  longText: false,
  images: false,
};
```

If the user has never explicitly configured redaction settings (i.e., `chrome.storage.local` has no `redactionSettings` key), these defaults apply immediately. Every page load during recording will blur elements containing email addresses, common first names, and form field values.

**Fix:** Change the default for `enabled` to `false`, OR gate the `APPLY_REDACTION` call behind a check:

```typescript
// Option A: Change defaults in redaction.ts
let redactionSettings = {
  enabled: false,  // Don't auto-redact unless user opts in
  emails: true,
  names: true,
  ...
};

// Option B: Check settings before sending APPLY_REDACTION in background/index.ts
const { redactionSettings: rs } = await chrome.storage.local.get(['redactionSettings']);
if (rs && rs.enabled) {
  chrome.tabs.sendMessage(tabId, { type: 'APPLY_REDACTION' }).catch(() => {});
}
```

---

### BUG-02: Redaction defaults mismatch between background GET_REDACTION_SETTINGS and content script

**Severity:** P0  
**File:** `extension/src/background/index.ts` (GET_REDACTION_SETTINGS handler) vs `extension/src/content/redaction.ts`  
**Symptom:** Inconsistent redaction behavior depending on which component reads settings first.

**Root cause:** The background script and content script have **different default values** for the same settings:

Background (`index.ts`, GET_REDACTION_SETTINGS handler):
```typescript
sendResponse(stored.redactionSettings || {
  enabled: true,
  formFields: true,
  emails: true,
  names: false,     // ← names OFF
  numbers: false,
});
```

Content script (`redaction.ts`):
```typescript
let redactionSettings = {
  enabled: true,
  emails: true,
  names: true,      // ← names ON
  numbers: false,
  formFields: true,
  longText: false,
  images: false,
};
```

The background says `names: false`, the content script says `names: true`. This means name-based blurring depends on which code path runs first, creating unpredictable behavior.

**Fix:** Extract defaults to a single shared constant in `shared/constants.ts` and import it in both places.

---

### BUG-03: Smart Blur popup applies redaction immediately upon opening

**Severity:** P1  
**File:** `extension/src/content/smart-blur.ts:166-168`  
**Symptom:** Opening the Smart Blur popup immediately blurs page content before the user has confirmed any settings.

**Root cause:** In `createSmartBlurPopup()`, after building the UI, it immediately calls:

```typescript
// Apply initial redaction for all enabled categories
if (redaction) {
  redaction.applyAllEnabled();
}
```

This applies redaction to the page before the user has had any chance to review or modify the toggle states. Combined with BUG-01's `enabled: true` defaults, simply toggling Smart Blur open will blur content.

**Fix:** Don't auto-apply on popup open. Let the user toggle categories and apply them through the toggle change handlers, or add an explicit "Apply" button.

---

## P0 — Clicks Not Captured

### BUG-04: 400ms delay on single clicks causes missed captures on fast interactions

**Severity:** P0  
**File:** `extension/src/content/capture.ts:139-148`  
**Symptom:** Some clicks on the page are not captured as steps.

**Root cause:** Every left click is delayed by `DOUBLE_CLICK_MS = 400` ms to detect potential double-clicks:

```typescript
pendingClick = setTimeout(() => {
  sendClickStep(stepData);
  pendingClick = null;
}, DOUBLE_CLICK_MS);
```

If the user clicks an element that triggers a **page navigation** (e.g., a link, form submit button, SPA route change), the `setTimeout` callback may never fire because:

1. **Full navigation:** The page unloads, destroying the content script and all pending timers.
2. **SPA navigation:** The target element may be removed from DOM; while the timer survives, the step was captured with stale data.

Additionally, rapid clicking on different elements will cause `clearTimeout(pendingClick)` to cancel the previous pending click, meaning the first click is **silently dropped**.

**Fix:** 
- For navigation-triggering elements (`<a href>`, `<button type="submit">`, elements with `role="link"`), send the click immediately without the double-click delay.
- Consider reducing `DOUBLE_CLICK_MS` to 250ms.
- Alternative: Use `beforeunload` or `pagehide` to flush pending clicks.

---

### BUG-05: `pointerdown` handler ignores clicks inside Shadow DOM

**Severity:** P1  
**File:** `extension/src/content/capture.ts:118`  
**Symptom:** Clicks on elements inside shadow DOM (common in web components, custom UI libraries) are not captured.

**Root cause:** The handler uses `event.target`, which for shadow DOM events will be the **shadow host** element, not the actual clicked element inside the shadow tree. The `gatherElementInfo()` call will gather info about the host, not the interactive element the user actually clicked, potentially producing meaningless descriptions like `Click here`.

This isn't a complete miss (the click IS captured), but the description is wrong, making the step useless.

**Fix:** Use `event.composedPath()[0]` to get the actual target element across shadow boundaries:

```typescript
const target = (event.composedPath()[0] || event.target) as Element;
```

---

### BUG-06: `isRecording` guard race with async message passing

**Severity:** P1  
**File:** `extension/src/content/capture.ts:115` and `extension/src/content/index.ts:85-88`  
**Symptom:** Clicks immediately after recording starts may be missed.

**Root cause:** When `START_RECORDING` arrives, `startCapturing()` sets `isRecording = true` synchronously and attaches listeners. However, when a tab first loads during an active recording, there's a 100ms delay before the content script checks state:

```typescript
// index.ts:85
setTimeout(() => {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (response && response.isRecording && !response.isPaused) {
      startCapturing();
    }
  });
}, 100);
```

During that 100ms gap (plus async message round-trip), clicks are not captured. For fast-loading pages, the user may click before capturing starts.

**Fix:** Reduce the timeout or start capturing optimistically and confirm via state check.

---

### BUG-07: `handleClick` doesn't fire for clicks consumed by the dock/smart-blur overlays

**Severity:** P2  
**File:** `extension/src/content/dock.ts` and `extension/src/content/smart-blur.ts`  
**Symptom:** Clicks near the dock area (right edge of screen) may not register as steps.

**Root cause:** The dock and smart blur popup both call `e.stopPropagation()` on their button click handlers. While these elements use Shadow DOM (which should isolate events), the dock is positioned at `z-index: 2147483647`. If the dock overlaps any page content, clicks on the overlapping area hit the dock's shadow DOM first, and `stopPropagation()` prevents the event from reaching the document-level `pointerdown` listener.

The dock is a narrow vertical strip on the right edge (`right: 0`), so this primarily affects elements at the far right of the page.

**Fix:** Add `pointer-events: none` to non-interactive areas of the dock, or reduce the dock's clickable footprint. Consider using `data-stept-exclude` checks in the click handler.

---

## P1 — Sidepanel Layout Issues

### BUG-08: Sidepanel content doesn't fill full width

**Severity:** P1  
**File:** `extension/src/sidepanel/sidepanel.css`  
**Symptom:** Content doesn't fill the full sidepanel width; there's visible margin/gap.

**Root cause:** Multiple contributing factors:

1. **`.sp-auth-content` has `max-width: 300px`** (line ~140):
   ```css
   .sp-auth-content {
     max-width: 300px;  /* ← constrains login panel to 300px */
   }
   ```
   Chrome's side panel is typically 320-400px wide, so this creates visible side margins on the login/auth screen.

2. **`.header-select` has `max-width: 180px`** (line ~50):
   ```css
   .header-select {
     max-width: 180px;
   }
   ```
   The project selector dropdown doesn't expand to fill available space.

**Fix:**
- Remove or increase `max-width: 300px` on `.sp-auth-content` (use `width: 100%` with padding instead).
- Remove `max-width: 180px` on `.header-select` or increase it to `100%`.

---

### BUG-09: Inconsistent gap/spacing between setup panel elements

**Severity:** P1  
**File:** `extension/src/sidepanel/sidepanel.css` — `.sp-setup-content`  
**Symptom:** Visible gap inconsistencies between elements in the setup/home panel.

**Root cause:** The `.sp-setup-content` uses `gap: 12px`, but child elements have their own padding/margins that don't account for this gap:

```css
.sp-setup-content {
  padding: 16px 16px 16px;   /* triple-value shorthand, middle value is l/r */
  gap: 12px;
}
```

Meanwhile, `.recent-workflows` has `gap: 8px` and `.recent-list` has `gap: 2px`, creating a staircase of different spacing levels (12px → 8px → 2px) that looks inconsistent.

Also, `#spSetupPanel` overrides flex alignment:
```css
#spSetupPanel {
  align-items: stretch;
  justify-content: flex-start;
}
```
But `.sp-auth-panel` (its parent class) uses `align-items: center` and `justify-content: center`. The ID selector wins, but the class-level centering may flash briefly during render.

**Fix:** Standardize gap values. Use `8px` consistently for compact lists and `12px` for section-level spacing. Remove conflicting flex properties.

---

### BUG-10: Steps list doesn't fill remaining height when few steps exist

**Severity:** P2  
**File:** `extension/src/sidepanel/sidepanel.css` — `.steps-list`  
**Symptom:** The steps area feels cramped or doesn't push the footer to the bottom.

**Root cause:** `.steps-list` has `flex: 1` which should work, but it also has `overflow-y: auto` and `padding: 12px 16px`. The `.container` parent uses `height: 100%` (not `min-height`), so when there are very few steps, the empty state floats in the middle correctly, but the step cards are padded with `margin-bottom: 12px` on `.step-card`, adding bottom space that doesn't align with the footer.

**Fix:** Minor — use `padding-bottom: 0` on `.steps-list` and let the last card's margin handle spacing, or use `gap` on a flex/grid layout instead of margins.

---

## P2 — Other Issues Found

### BUG-11: Dock shadow root uses `mode: 'closed'` but `getDockShadow` reads `.shadowRoot`

**Severity:** P2  
**File:** `extension/src/content/dock.ts:30` and `dock.ts:59`  
**Symptom:** Dock display never updates after initial creation (timer, step count stuck).

**Root cause:** The dock creates a **closed** shadow root:
```typescript
const shadow = dockElement.attachShadow({ mode: 'closed' });
```

But `getDockShadow()` tries to access it via the public API:
```typescript
export function getDockShadow(): ShadowRoot | null {
  return dockElement ? dockElement.shadowRoot : null;
}
```

For closed shadow roots, `element.shadowRoot` returns `null`. This means `updateDockPauseUI(shadow)` called from `index.ts` (message handlers for PAUSE/RESUME) always receives `null`, and the pause UI never updates.

However, the dock's **internal** code (button handlers, timer) works because it captures the `shadow` variable in closure scope before it's closed.

**Fix:** Store the shadow root reference in a module-level variable:
```typescript
let dockShadowRef: ShadowRoot | null = null;

// In createDock():
dockShadowRef = dockElement.attachShadow({ mode: 'closed' });

export function getDockShadow(): ShadowRoot | null {
  return dockShadowRef;
}
```

---

### BUG-12: `persistRecordingState` doesn't persist `isPaused` update in `resumeRecording`

**Severity:** P2  
**File:** `extension/src/background/recording.ts:87-94`  
**Symptom:** After resuming from pause, if the service worker restarts, the extension thinks recording is still paused.

**Root cause:** `resumeRecording()` sets `state.isPaused = false` but **does not call `persistRecordingState()`**:

```typescript
export function resumeRecording(): void {
  state.isPaused = false;
  // ← Missing: persistRecordingState()
  chrome.action.setBadgeText({ text: 'REC' });
  ...
}
```

Compare with `pauseRecording()` which correctly calls `persistRecordingState()`.

**Fix:** Add `persistRecordingState()` call to `resumeRecording()`.

---

### BUG-13: Double event listeners from `APPLY_REDACTION` + Smart Blur toggle race

**Severity:** P2  
**File:** `extension/src/content/redaction.ts` (message listener) and `extension/src/content/smart-blur.ts`  
**Symptom:** Redaction may be applied twice (double-blur) or settings toggled in the popup don't reflect on the page.

**Root cause:** Both `redaction.ts` and `smart-blur.ts` register their own `chrome.runtime.onMessage` listeners. The content script's main `index.ts` also registers one. When `TOGGLE_SMART_BLUR` arrives:

1. `index.ts` handler calls `toggleSmartBlur()` → pauses recording → opens popup → calls `applyAllEnabled()`
2. Meanwhile, background's `onUpdated` sends `APPLY_REDACTION` to all tabs
3. `redaction.ts` handler receives `APPLY_REDACTION` → calls `applyAllEnabled()` again

The `blurElement()` function has a guard (`if (el.getAttribute(REDACTION_ATTR)) return false`), so double-blur is prevented, but the race can cause the Smart Blur popup's toggle state and the actual page state to diverge.

**Fix:** Add a flag to skip `APPLY_REDACTION` while Smart Blur popup is open.

---

### BUG-14: Content script `sendMsg` swallows errors silently

**Severity:** P2  
**File:** `extension/src/content/index.ts:28-32`  
**Symptom:** Messages to background fail silently when service worker is inactive.

**Root cause:** `sendMsg` wraps `chrome.runtime.sendMessage` in a Promise but never checks `chrome.runtime.lastError`:

```typescript
export function sendMsg(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || {});  // ← lastError not checked
    });
  });
}
```

If the service worker has been suspended, this silently resolves with `{}`, and the caller (e.g., dock's Complete button) proceeds as if the message succeeded.

**Fix:** Check `chrome.runtime.lastError` and either reject or resolve with an error indicator.

---

## Summary

| Bug | Severity | Category | One-liner |
|-----|----------|----------|-----------|
| BUG-01 | **P0** | Blur | Redaction auto-applied on every page load during recording |
| BUG-02 | **P0** | Blur | Redaction defaults mismatch between background and content |
| BUG-03 | **P1** | Blur | Smart Blur popup applies redaction immediately on open |
| BUG-04 | **P0** | Clicks | 400ms double-click delay causes missed captures on navigation |
| BUG-05 | **P1** | Clicks | Clicks inside Shadow DOM report wrong element info |
| BUG-06 | **P1** | Clicks | 100ms+ race window where clicks aren't captured on new pages |
| BUG-07 | **P2** | Clicks | Dock overlay eats clicks on page elements beneath it |
| BUG-08 | **P1** | Layout | Sidepanel content constrained by max-width: 300px |
| BUG-09 | **P1** | Layout | Inconsistent gap/spacing between setup panel elements |
| BUG-10 | **P2** | Layout | Steps list spacing inconsistency with footer |
| BUG-11 | **P2** | Dock | Closed shadow root makes getDockShadow() always return null |
| BUG-12 | **P2** | State | resumeRecording() doesn't persist isPaused=false |
| BUG-13 | **P2** | Blur | Double redaction application race between APPLY_REDACTION and Smart Blur |
| BUG-14 | **P2** | Comms | sendMsg swallows errors when service worker is inactive |
