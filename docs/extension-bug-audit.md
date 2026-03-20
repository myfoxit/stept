# Stept Chrome Extension — Bug Audit Report

**Date:** 2026-03-20
**Scope:** Post React/TypeScript rewrite — all files under `extension/src/`
**Auditor:** Senior Chrome Extension Developer (automated audit)

---

## Summary

Analyzed all source files in the extension. Found **11 bugs** across content scripts, background scripts, and sidepanel UI. The most impactful are the redaction state leak causing phantom blurs (P0), missed clicks due to `focusout` firing before `pointerdown` (P0), and sidepanel layout issues (P1).

---

## Bug #1 — Redaction NOT cleaned up when recording stops → phantom blurs persist

**File:** `src/content/index.ts`, lines 47–53 (STOP_RECORDING handler)
**Severity:** P0 — breaks functionality (reported symptom: "random blurs appearing")

**What's wrong:**
When `STOP_RECORDING` is received, the content script calls `stopCapturing()` but does **not** call `window.__steptRedaction?.removeAll()`. The background script (`recording.ts` line 79) sends `REMOVE_REDACTION` as a separate message, but `redaction.ts` handles that via `chrome.runtime.onMessage` independently. The problem is a **race condition**: if the IIFE in `redaction.ts` hasn't loaded yet on a newly-injected page (e.g., after tab navigation), the `REMOVE_REDACTION` message is silently lost. Redaction blur CSS (`filter: blur(4px)`) remains on DOM elements permanently.

Additionally, there is no cleanup in `removeSmartBlur()` (`smart-blur.ts` line 163) — it closes the popup and resumes recording but does **not** call `window.__steptRedaction?.removeAll()`. This means if a user opens Smart Blur, enables some categories, then clicks "Done — Resume Capture", the blur effects stay on the page.

**Fix:**
1. In `smart-blur.ts` → `closeSmartBlur()`: add `window.__steptRedaction?.removeAll()` before `sendMsg({ type: 'RESUME_RECORDING' })`.
2. In `content/index.ts` → `STOP_RECORDING` handler: add `window.__steptRedaction?.removeAll()` after `stopCapturing()`.
3. In `content/index.ts` → `CLOSE_SMART_BLUR` handler: add `window.__steptRedaction?.removeAll()`.

---

## Bug #2 — Smart Blur `closeSmartBlur()` doesn't remove redaction

**File:** `src/content/smart-blur.ts`, line 163–170
**Severity:** P0 — visible blurs persist after closing Smart Blur panel (reported symptom: "random blurs")

**What's wrong:**
`closeSmartBlur()` removes the popup UI element and sends `RESUME_RECORDING`, but the actual CSS `filter: blur()` applied by `redaction.ts` to page elements is never removed. The `removeAll()` function exists on `window.__steptRedaction` but is never called.

**Fix:**
Add `window.__steptRedaction?.removeAll();` as the first line of `closeSmartBlur()`.

---

## Bug #3 — `focusout` handler fires TYPE_EVENT that races with click capture

**File:** `src/content/capture.ts`, lines 161–190 (`handleFocusOut`)
**Severity:** P0 — causes clicks to be missed (reported symptom: "some clicks not recognized")

**What's wrong:**
When a user clicks away from an input field, the browser fires events in this order: `focusout` → `pointerdown`. The `handleFocusOut` handler calls `flushTypedText()` and then sends its own `TYPE_EVENT`. However, the `handleClick` function (triggered by `pointerdown`) also calls `flushTypedText()` at the top. Because `focusout` fires first, the `flushTypedText()` inside `handleFocusOut` may clear `typedText`, then `handleFocusOut` sends its own event (duplicating the typing), and then when `handleClick` runs, it also sends `PRE_CAPTURE`. The pre-capture screenshot is tied to the first `CLICK_EVENT` that arrives, but if `handleFocusOut` triggered an async `chrome.runtime.sendMessage` that hasn't completed, the `PRE_CAPTURE` for the click may interleave with it, causing the click step to use a stale/null pre-capture.

More critically: the `focusout` event's `sendMessage` call is **not awaited**, and if it triggers a `STOP_RECORDING` or `PAUSE_RECORDING` response in the background (via some edge case), the subsequent click's `isRecording` check will fail.

**Fix:**
The `handleFocusOut` should not fire independently during active recording. Instead, it should set a flag that `handleClick` checks. If a click follows a focusout within ~50ms, the click handler should be responsible for flushing the field-change event. Alternatively, debounce `handleFocusOut` by 100ms and cancel it if a `pointerdown` arrives.

---

## Bug #4 — Dock uses `mode: 'closed'` shadow DOM but `getDockShadow()` reads `.shadowRoot`

**File:** `src/content/dock.ts`, line 32 (`getDockShadow`) and line 49 (`attachShadow({ mode: 'closed' })`)
**Severity:** P0 — dock UI never updates after creation (pause icon, step count, timer stuck)

**What's wrong:**
The dock creates a **closed** shadow root: `dockElement.attachShadow({ mode: 'closed' })`. But `getDockShadow()` on line 32 returns `dockElement.shadowRoot`, which is `null` for closed shadow roots. This means every call to `updateDockPauseUI(shadow)` and `updateDockDisplay(shadow)` from `index.ts` receives `null`, and the null-check at the top of those functions causes an early return.

The dock renders once at creation (because the local `shadow` variable is used), but never updates afterwards (step count frozen, timer frozen, pause button doesn't toggle).

Note: `incrementDockSteps()` on line 165 also calls `dockElement.shadowRoot` which returns `null`.

**Fix:**
Store the shadow root reference in a module-level variable (e.g., `let dockShadow: ShadowRoot | null = null;`), assign it during `createDock()`, and return it from `getDockShadow()`.

---

## Bug #5 — Sidepanel: `#spSetupPanel` has `align-items: stretch` but content uses `max-width: 300px` via nested auth-panel

**File:** `src/sidepanel/sidepanel.css`, line 112 and `src/sidepanel/components/SetupPanel.tsx`
**Severity:** P1 — visible UI bug (reported symptom: "content doesn't fill full width")

**What's wrong:**
In `sidepanel.css`, the `.sp-auth-panel` class (line 105) sets:
```css
.sp-auth-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
```
And `#spSetupPanel` overrides (line 112):
```css
#spSetupPanel {
  align-items: stretch;
  justify-content: flex-start;
}
```

The SetupPanel component renders: `<div id="spSetupPanel" className="sp-auth-panel">`. The `.sp-auth-panel` base class centers content, and while `#spSetupPanel` overrides alignment, **the parent `.container` has no `width: 100%` or explicit sizing on the flex child**. The `.sp-auth-panel` is a flex container with `flex: 1` (which gives it height), but the child `.sp-setup-content` (line 195 in CSS) only has `padding: 16px 16px 16px` — it doesn't explicitly take `width: 100%`.

The real issue: `.sp-auth-panel` has `display: flex; align-items: center;` which centers the child `.sp-setup-content` horizontally (cross-axis in column direction is horizontal). Even though `#spSetupPanel` overrides to `align-items: stretch`, the **LoginPanel** also uses `sp-auth-panel` class and its `.sp-auth-content` child has `max-width: 300px`. This isn't directly the problem for SetupPanel, but the setup content inherits the centered layout paradigm.

The actual culprit for "not filling full width": `.sp-setup-content` doesn't have `width: 100%`. In a flex column layout with `align-items: stretch`, children should stretch — but `.sp-setup-content` has no explicit width and may collapse based on content.

**Fix:**
Add `width: 100%;` to `.sp-setup-content` rule, or ensure `#spSetupPanel` has explicit `width: 100%`.

---

## Bug #6 — Sidepanel: Large empty gap caused by duplicate project selector

**File:** `src/sidepanel/components/SetupPanel.tsx`, lines 72–85
**Severity:** P1 — visible UI bug (reported symptom: "large empty gap in the middle")

**What's wrong:**
The SetupPanel renders a `<div className="header-center">` containing a `<select>` for the project selector. But the Header component (`Header.tsx`) is **always** rendered in `App.tsx` (line 131) regardless of view state. The Header doesn't render a project selector (it's only a badge + settings button). So the SetupPanel renders its **own** project selector inside `sp-setup-content`.

The problem: the `<div className="header-center">` wrapper uses CSS that expects it to be in the header context (`flex: 1; min-width: 0;`). When placed inside the setup panel's flex column, it takes up full width but the `header-select` inside has `max-width: 180px`. Combined with the `flex: 1` on `.header-center`, this creates a tall-ish flex item where the select is small and the surrounding area is empty.

But the **real** gap is from the padding and gap stacking: `.sp-setup-content` has `gap: 12px` and `padding: 16px`. Combined with the greeting text, the CTA button, SearchBar, ContextLinks, and RecentWorkflows — if RecentWorkflows or ContextLinks are empty/loading, their containers still take space. Looking at the CSS: `.recent-loading` shows "Loading..." text at `font-size: 12px; padding: 8px 0;` — but if no workflows exist, `.recent-empty` also takes `padding: 8px 0`.

However, the most likely cause of a "large empty gap" is the SearchBar component — it renders a full search container that takes space even when collapsed, and the `.search-results` div with `max-height: 400px` could be rendered empty but visible.

**Fix:**
1. Remove the `<div className="header-center">` wrapper from SetupPanel — use a plain `<select>` without the header-specific wrapper class.
2. Audit SearchBar, ContextLinks, and RecentWorkflows to ensure empty states don't render large containers.

---

## Bug #7 — `REORDER_STEPS` renumbers `step_number` but steps use `stepNumber`

**File:** `src/background/index.ts`, lines 198–207 (REORDER_STEPS handler)
**Severity:** P1 — step numbers get out of sync after reordering

**What's wrong:**
After reordering, the code does:
```ts
state.steps.forEach((s: any, i: number) => { s.step_number = i + 1; });
```
But everywhere else in the codebase, the field is named `stepNumber` (camelCase), not `step_number` (snake_case). See `recording.ts` line 162: `step.stepNumber = index + 1;` in `deleteStep()`. This means after drag-reorder, steps have both `stepNumber` (original, now wrong) and `step_number` (new, correct but unused by the UI). The sidepanel's `StepCard` reads `step.stepNumber`, so it shows stale numbers.

**Fix:**
Change `s.step_number = i + 1;` to `s.stepNumber = i + 1;`.

---

## Bug #8 — `resumeRecording()` doesn't persist state

**File:** `src/background/recording.ts`, lines 96–107
**Severity:** P2 — state lost on service worker restart

**What's wrong:**
`pauseRecording()` calls `persistRecordingState()` after setting `state.isPaused = true`. But `resumeRecording()` sets `state.isPaused = false` and updates badges, but **never calls `persistRecordingState()`**. If the service worker restarts after resuming, it will restore `isPaused: true` from storage and the recording will appear paused.

**Fix:**
Add `persistRecordingState();` after `state.isPaused = false;` in `resumeRecording()`.

---

## Bug #9 — Default redaction settings mismatch between background and content

**File:** `src/background/index.ts` lines 275–280 vs `src/content/redaction.ts` lines 48–55
**Severity:** P1 — Smart Blur "names" category defaults differ → unexpected blur behavior

**What's wrong:**
In `redaction.ts` (content script), default settings are:
```ts
emails: true, names: true, numbers: false, formFields: true, longText: false, images: false
```
But in `background/index.ts` `GET_REDACTION_SETTINGS` handler, the fallback is:
```ts
emails: true, names: false, numbers: false, formFields: true
```
Note: `names: true` in content vs `names: false` in background, and the background response is missing `longText` and `images` fields entirely.

When the sidepanel reads settings via `GET_REDACTION_SETTINGS`, it gets `names: false`. But the content script's `redaction.ts` already initialized with `names: true`. If `applyAllEnabled()` runs before settings sync, it will blur names — a category the user didn't enable from the sidepanel's perspective. This creates "phantom" blurs on elements containing common first names.

**Fix:**
Unify the default settings. The background's `GET_REDACTION_SETTINGS` fallback should match `redaction.ts` defaults exactly, including all 6 categories.

---

## Bug #10 — `handleFocusOut` fires duplicate TYPE_EVENT after `flushTypedText`

**File:** `src/content/capture.ts`, lines 161–190
**Severity:** P2 — duplicate step entries for typed text

**What's wrong:**
When a user types into a field and then tabs/clicks away:
1. `handleKeydown` accumulates `typedText` and sets a `typingTimer`
2. On blur, `handleFocusOut` calls `flushTypedText()` (which sends a TYPE_EVENT with the accumulated text and resets `typedText`)
3. `handleFocusOut` then compares `currentValue` vs `focusedFieldValue` — if they differ, it sends **another** TYPE_EVENT with the field's full value

So the user gets TWO type events: one from `flushTypedText()` (the keystrokes accumulated) and one from `handleFocusOut()` (the field value comparison). The `flushTypedText` function does update `focusedFieldValue` at line 120 (`focusedFieldValue = (activeElement as HTMLInputElement).value || ''`), which should prevent the duplicate — **but only if `activeElement` is still the field being blurred**. By the time `flushTypedText` runs synchronously inside `handleFocusOut`, `document.activeElement` may have already moved to the next element. So the `focusedFieldValue` sync at line 120 targets the wrong element, and `handleFocusOut` proceeds to send a duplicate.

**Fix:**
Pass the blurring element to `flushTypedText` or check `currentValue === typedText` before sending the second event in `handleFocusOut`.

---

## Bug #11 — `TOGGLE_SMART_BLUR` message handling: background forwards to content but doesn't pause recording itself

**File:** `src/background/index.ts` (TOGGLE_SMART_BLUR handler) vs `src/content/smart-blur.ts` line 180
**Severity:** P2 — race condition in pause/resume flow

**What's wrong:**
When the sidepanel clicks "Smart Blur", the flow is:
1. Sidepanel sends `TOGGLE_SMART_BLUR` to background
2. Background forwards `TOGGLE_SMART_BLUR` to content script
3. Content script's `toggleSmartBlur()` calls `sendMsg({ type: 'PAUSE_RECORDING' })` back to background
4. Background calls `pauseRecording()` which sends `PAUSE_RECORDING` to ALL tabs

The problem: step 3 sends `PAUSE_RECORDING` from content → background, and `pauseRecording()` broadcasts `PAUSE_RECORDING` back to ALL content scripts. But the originating tab's content script is already in the `toggleSmartBlur()` async flow. The broadcast `PAUSE_RECORDING` arrives at the content script's `onMessage` listener which calls `stopCapturing()` and updates the dock — this is redundant but harmless in most cases. However, if the `toggleSmartBlur` async chain (`sendMsg → loadSettings → createSmartBlurPopup`) takes longer than the broadcast round-trip, the dock's pause state might be set before the Smart Blur popup is created, causing a brief visual inconsistency.

**Fix:**
Have the background handle the pause/resume logic when it receives `TOGGLE_SMART_BLUR`, rather than having the content script initiate it. This reduces the round-trip messages.

---

## Non-Bug Observations

### Observation A — `TYPING_DELAY` constant defined twice with different values
`src/content/capture.ts` line 14: `const TYPING_DELAY = 1000;`
`src/shared/constants.ts` line 9: `export const TYPING_DELAY = 1500;`
The content script uses its local value (1000ms), not the shared constant (1500ms). Not a bug per se, but likely unintentional after the port.

### Observation B — Dock shadow root mode inconsistency
`dock.ts` uses `mode: 'closed'` while `smart-blur.ts` also uses `mode: 'closed'`. Both have the same shadow-root access pattern issue, but Smart Blur doesn't need post-creation updates (it's created and destroyed as a unit), so it only affects the dock.

### Observation C — `UploadPanel` calls `window.close()` on success
`UploadPanel.tsx` line 73: `window.close()` — this closes the sidepanel after upload. If the sidepanel is in a tab (during development), this closes the tab. Probably intentional for production but worth noting.

### Observation D — React StrictMode double-mounting
`sidepanel/index.tsx` wraps `<App />` in `<React.StrictMode>`. In development, this causes `useEffect` to run twice, which means `refreshState()` fires twice on mount and the `onMessage` listener is registered/unregistered/re-registered. Not a production issue but could confuse debugging.

---

## Priority Summary

| Priority | Count | Bugs |
|----------|-------|------|
| P0 | 4 | #1, #2, #3, #4 |
| P1 | 4 | #5, #6, #7, #9 |
| P2 | 3 | #8, #10, #11 |

### Recommended fix order:
1. **Bug #1 + #2** (phantom blurs) — directly explains the #1 user complaint
2. **Bug #4** (dock shadow root) — dock appears frozen, confuses users
3. **Bug #9** (default settings mismatch) — secondary cause of phantom blurs
4. **Bug #3** (click/focusout race) — explains missed clicks
5. **Bug #7** (step_number vs stepNumber) — broken reorder
6. **Bug #5 + #6** (sidepanel layout) — UI polish
7. **Bug #8, #10, #11** — lower priority
