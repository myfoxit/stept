# Ondoki Chrome Extension — Comprehensive Code Review

**Date:** 2026-03-03
**Reviewer:** Opus (automated)
**Version reviewed:** 1.0.1
**Files reviewed:** manifest.json, background.js, content.js, popup.js, sidepanel.js, popup.html, sidepanel.html, popup.css, sidepanel.css

---

## Table of Contents

1. [Security Issues](#1-security-issues)
2. [Production Bugs & Issues](#2-production-bugs--issues)
3. [Competitor Analysis](#3-competitor-analysis)
4. [Code Quality & Dead Code](#4-code-quality--dead-code)
5. [General Issues](#5-general-issues)

---

## 1. Security Issues

### SEC-001: Default API URL is HTTP localhost — credentials sent in cleartext
- **Severity:** CRITICAL
- **File:** `background.js`, line 1
- **Details:** `DEFAULT_API_BASE_URL = 'http://localhost:8000/api/v1'` — the default communicates over plain HTTP. PKCE auth codes, access tokens, refresh tokens, and all screenshot data are sent unencrypted. While acceptable for local development, there's no enforcement or warning when a user configures a non-HTTPS URL for production use.
- **Fix:** Default to `https://app.ondoki.com/api/v1`. Add validation in `SET_SETTINGS` that rejects `http://` URLs unless they're `localhost`/`127.0.0.1`. Display a warning badge if HTTP is configured for a non-local host.

### SEC-002: `<all_urls>` host permission is overly broad
- **Severity:** HIGH
- **File:** `manifest.json`, line 14
- **Details:** The extension requests `<all_urls>` in `host_permissions`. This grants the ability to read/modify content on every website and is a Chrome Web Store review red flag. The extension needs it for `chrome.scripting.executeScript` during recording and `chrome.tabs.captureVisibleTab`, but `activeTab` should suffice for screenshots on the active tab.
- **Fix:** Use `activeTab` for screenshot capture. For content script injection, use `optional_host_permissions` with `<all_urls>` and request it only when recording starts via `chrome.permissions.request()`. This narrows the default attack surface and improves Web Store approval chances.

### SEC-003: Tokens stored in `chrome.storage.local` — accessible and unencrypted on disk
- **Severity:** MEDIUM
- **File:** `background.js`, lines 106-112 (`persistAuth`)
- **Details:** Access tokens and refresh tokens are stored in `chrome.storage.local`, which is unencrypted on disk. While the extension needs persistence across service worker restarts, storing both tokens in the same unencrypted store is more exposure than necessary.
- **Fix:** Use `chrome.storage.session` with `setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })` for the access token (short-lived, regenerable). Keep only the refresh token in `chrome.storage.local`.

### SEC-004: Screenshots stored as data URLs in `chrome.storage.local` — large, persistent, unencrypted
- **Severity:** MEDIUM
- **File:** `background.js`, lines 126-139 (`persistSteps`)
- **Details:** Full JPEG screenshots (base64 data URLs) are persisted to `chrome.storage.local`. Potentially sensitive screen content (internal dashboards, financial data, personal info) is stored unencrypted on disk. The `persistSteps` fallback strips screenshots only on quota error.
- **Fix:** Don't persist screenshots to storage. Keep them in-memory only (lost on SW termination, but better than leaking sensitive data to disk). Alternatively, immediately upload screenshots to the server as they're captured, keeping only a reference.

### SEC-005: No origin validation on `chrome.runtime.onMessage`
- **Severity:** MEDIUM
- **File:** `background.js`, lines 342-460
- **Details:** The message listener doesn't validate `sender.tab` or `sender.id`. While Chrome restricts runtime messaging to the same extension, content scripts run in webpage contexts. A crafted page could potentially exploit the content script to relay commands.
- **Fix:** Validate `sender.tab` for messages that should only come from content scripts (`CLICK_EVENT`, `TYPE_EVENT`). For popup/sidepanel messages, verify `!sender.tab`.

### SEC-006: Content script captures and transmits keystrokes — privacy risk
- **Severity:** HIGH
- **File:** `content.js`, lines 229-272
- **Details:** The content script captures ALL keystrokes except password and credit card fields. It checks `type=password`, `autocomplete=cc-number`, `cc-cvc`, `cc-exp` — but doesn't cover: SSN fields, 2FA codes, search queries on sensitive sites, private messages, or any sensitive data in `type=text` fields.
- **Fix:** Broaden sensitive field detection: check `autocomplete` values containing "password", "secret", "ssn", "social", "one-time-code". Add a configurable domain blocklist. Show a clear visual indicator that keystrokes are being recorded.

### SEC-007: External font loading — Google Fonts CDN
- **Severity:** LOW
- **File:** `popup.html`, line 6; `sidepanel.html`, line 6
- **Details:** Both HTML files load Google Fonts from `https://fonts.googleapis.com`. The CSP only covers `script-src` and `object-src`. Google can track extension usage, and the extension breaks offline.
- **Fix:** Bundle the Manrope font locally in the extension package.

### SEC-008: Logout doesn't revoke on network failure
- **Severity:** LOW
- **File:** `background.js`, lines 209-218 (`logout`)
- **Details:** The `logout` function fires a revoke request but catches and ignores errors. If the server is unreachable, the refresh token remains valid server-side while the user believes they've logged out.
- **Fix:** Queue the revocation and retry on next startup. Or at minimum, inform the user that server-side revocation failed.

### SEC-009: `popup.html` contains React/JSX syntax in raw HTML
- **Severity:** LOW
- **File:** `popup.html`, lines 13-34
- **Details:** The SVG logo contains `style={{ width: "38px", height: "36px" }}` — this is JSX, not valid HTML. Browsers silently ignore it. Indicates copy-paste from a React component without conversion.
- **Fix:** Convert to proper HTML: `style="width: 38px; height: 36px"`.

---

## 2. Production Bugs & Issues

### BUG-001: Service worker termination loses `isPaused` state and in-progress OAuth
- **Severity:** HIGH
- **File:** `background.js`, lines 29-35
- **Details:** MV3 service workers can be terminated after ~30s of inactivity. `state.isPaused` is NOT persisted — only `isRecording` is. If the SW terminates while paused, it restarts in "recording" mode. Additionally, `codeVerifier` and `authState` for in-progress OAuth flows are lost, breaking login attempts interrupted by SW termination.
- **Fix:** Persist `isPaused` in `persistRecordingState()`. Store PKCE verifier/state in `chrome.storage.session` so they survive SW restarts.

### BUG-002: Race condition in double-click detection — screenshot timing
- **Severity:** MEDIUM
- **File:** `content.js`, lines 196-220
- **Details:** Single clicks are delayed by 400ms for double-click detection. The screenshot is captured by the background script when it receives `CLICK_EVENT`, but by then 400ms+ have passed and the page may have changed. The screenshot won't reflect the state at click time.
- **Fix:** Capture the screenshot immediately on mousedown (before the delay), store it, and send it with the step data when the click type resolves.

### BUG-003: `sendResponse` in async message handler — port may close
- **Severity:** HIGH
- **File:** `background.js`, lines 342-460
- **Details:** The `onMessage` listener wraps everything in an async IIFE and returns `true`. For long operations like `UPLOAD` or `LOGIN`, the service worker could be suspended between the `await` and the `sendResponse`, closing the port and losing the response.
- **Fix:** Send an immediate acknowledgment for long operations. Use `chrome.runtime.sendMessage` from background to popup/sidepanel when the operation completes.

### BUG-004: Tab close during recording causes potential unhandled errors
- **Severity:** MEDIUM
- **File:** `background.js`, lines 313-327
- **Details:** Screenshot capture queries the active tab and sends messages to it. If the tab closes between query and sendMessage, `captureVisibleTab` may fail with no active tab. The `.catch(() => {})` handles message failures, but the overall `addStep` flow could have uncaught rejections.
- **Fix:** Wrap the entire screenshot capture + dock hide/show sequence in a try/catch. Verify tab existence before messaging.

### BUG-005: `lastTrackedPage` deduplication is global — breaks multi-window
- **Severity:** MEDIUM
- **File:** `background.js`, line 463
- **Details:** `lastTrackedPage` only tracks a single tab+url pair. Multi-window usage will incorrectly suppress valid navigation steps in the second window.
- **Fix:** Track per-window or remove tab-based deduplication, relying solely on URL + time threshold.

### BUG-006: Step renumbering after delete creates transient inconsistency
- **Severity:** MEDIUM
- **File:** `background.js`, lines 337-342
- **Details:** `deleteStep` renumbers all remaining steps sequentially. The sidepanel tracks steps locally by original `stepNumber`. After deletion, numbers are inconsistent until `refreshState()` completes.
- **Fix:** Use unique IDs (UUIDs) for steps. Derive display numbers from array position.

### BUG-007: Dock "Complete" clears steps even on upload failure
- **Severity:** MEDIUM
- **File:** `content.js`, lines 139-144
- **Details:** The dock's complete button calls `STOP_RECORDING` → `UPLOAD` → `CLEAR_STEPS` → `removeDock()`. If upload fails, steps are still cleared and the dock removed — **the user loses all captured data with no error feedback**.
- **Fix:** Don't clear steps if upload fails. Show a notification or re-show the dock with an error state.

### BUG-008: `chrome.storage.local` quota for screenshots
- **Severity:** MEDIUM
- **File:** `background.js`, lines 126-139
- **Details:** `chrome.storage.local` has a 10MB default quota. With JPEG screenshots at ~50-200KB each and up to 100 steps, you hit 5-20MB easily. The fallback strips screenshots, leaving steps without images after SW restart — inconsistent state.
- **Fix:** Request `unlimitedStorage` permission, or don't persist screenshots to storage (see SEC-004).

### BUG-009: Progress bar is fake
- **Severity:** LOW
- **File:** `popup.js`, lines 182-195; `sidepanel.js`, lines 177-200
- **Details:** Upload progress increments by 10% every 500ms up to 90%, then jumps to 100%. No relationship to actual upload progress. For large recordings, the bar sits at 90% for a long time.
- **Fix:** Emit progress messages from background as each step's screenshot uploads.

### BUG-010: `RESUME_RECORDING` message not handled in content.js
- **Severity:** MEDIUM
- **File:** `content.js` message handler; `background.js` line 240
- **Details:** `resumeRecording()` in background.js broadcasts `RESUME_RECORDING` to all tabs, but content.js has **no handler** for this message type. The message is silently dropped. This means after pausing and resuming, content scripts remain in paused state (`isRecording = false`) and won't capture any events.
- **Fix:** Add a `RESUME_RECORDING` handler in content.js that sets `isRecording = true`.

---

## 3. Competitor Analysis

Ondoki competes in the process documentation space alongside **Scribe** (scribehow.com), **Tango**, **Guidde**, and **Loom**. Here's what the competitors offer that Ondoki currently lacks:

### Feature Gap Matrix

| Feature | Scribe | Tango | Guidde | Loom | Ondoki |
|---------|--------|-------|--------|------|--------|
| Auto step detection (smart click/navigation grouping) | ✅ | ✅ | ✅ | — | ❌ |
| Auto-redaction / PII blur | ✅ | ✅ | ❌ | ❌ | ❌ |
| Video recording | ❌ | ❌ | ✅ | ✅ | ❌ |
| Instant sharing (link generation) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Team/workspace switcher | ✅ | ✅ | ✅ | ✅ | ❌ |
| Templates / reusable workflows | ✅ | ❌ | ✅ | ❌ | ❌ |
| Step editing before upload | ✅ | ✅ | ✅ | — | ⚠️ (delete only) |
| Undo/redo during recording | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-tab workflow tracking | ✅ | ✅ | ❌ | — | ⚠️ (basic) |
| Interactive guide playback | ✅ | ✅ | ✅ | ❌ | ❌ |
| Keyboard shortcuts | ✅ | ✅ | ✅ | ✅ | ❌ |
| Offline support | ❌ | ❌ | ❌ | ✅ | ❌ |
| PDF/Markdown export | ✅ | ✅ | ❌ | ❌ | ❌ |
| Browser-native annotation/markup | ❌ | ✅ | ❌ | ✅ | ❌ |
| AI step description generation | ✅ | ✅ | ✅ | ❌ | ⚠️ (server-side) |

### Critical Competitive Gaps

#### COMP-001: No smart step detection / step merging
- **Impact:** HIGH
- **Details:** Scribe and Tango intelligently group related actions (e.g., clicking a dropdown + selecting an option = one step). Ondoki records every raw mousedown and keypress as separate steps. A simple form fill generates 20+ steps where competitors produce 5-6. This makes guides verbose and hard to follow.
- **Recommendation:** Implement heuristic step merging: group click→select sequences, combine rapid clicks on the same element, merge navigation steps triggered by clicks.

#### COMP-002: No auto-redaction / sensitive data blur
- **Impact:** HIGH
- **Details:** Scribe offers automatic PII detection and blurring in screenshots. Ondoki captures everything with no redaction capability. This is critical for enterprise adoption where screenshots may contain customer data, financial info, or internal metrics.
- **Recommendation:** Add client-side redaction: detect and blur text in common sensitive patterns (emails, phone numbers, SSNs) before screenshot capture. Allow users to manually redact areas.

#### COMP-003: No instant sharing — upload-only workflow
- **Impact:** HIGH
- **Details:** Competitors generate a shareable link immediately after capture. Ondoki uploads to a project — there's no way to quickly share a guide via link. The upload-to-project model adds friction.
- **Recommendation:** After upload, immediately generate and display a shareable link. Add "Copy link" functionality. Consider a "Quick Share" mode that bypasses project selection.

#### COMP-004: No step editing before upload
- **Impact:** MEDIUM
- **Details:** Users can delete steps but cannot: edit descriptions, reorder steps, add annotations, crop/adjust screenshots, or add manual steps. Scribe and Tango let users fully edit the guide before publishing.
- **Recommendation:** Add inline editing for step descriptions. Allow step reordering via drag-and-drop. Add a "manual step" insertion button.

#### COMP-005: No video recording option
- **Impact:** MEDIUM
- **Details:** Guidde and Loom offer video recording as an alternative to step-by-step capture. Some workflows are better explained via video, especially complex or visual processes.
- **Recommendation:** Add optional screen recording using `chrome.tabCapture` or `getDisplayMedia`. Upload video alongside step data.

#### COMP-006: No interactive guide playback
- **Impact:** MEDIUM
- **Details:** Scribe and Tango can replay guides interactively — highlighting where to click, guiding users through the process in-browser. Ondoki only produces static documentation.
- **Recommendation:** Build a guide player that overlays instructions on the target page, highlighting elements and progressing on user action.

#### COMP-007: No team/workspace management
- **Impact:** MEDIUM
- **Details:** Users select a project but can't switch between teams or workspaces from the extension. No visibility into team activity or shared guides.
- **Recommendation:** Add a team/workspace switcher in the header. Show recent team guides.

#### COMP-008: No keyboard shortcuts
- **Impact:** MEDIUM
- **Details:** No `commands` in manifest.json. Competitors all support keyboard shortcuts for start/stop/pause.
- **Recommendation:** Add `commands` to manifest.json with defaults like `Ctrl+Shift+R` (start), `Ctrl+Shift+S` (stop), `Ctrl+Shift+P` (pause).

#### COMP-009: No local export (PDF, Markdown, ZIP)
- **Impact:** MEDIUM
- **Details:** The only output is a cloud upload. No local export option. If the server is down, recordings are trapped.
- **Recommendation:** Add "Download as ZIP" (JSON metadata + screenshots) and "Export as PDF" options.

#### COMP-010: No undo/redo during recording
- **Impact:** LOW
- **Details:** Users can delete steps but can't undo a deletion or redo. No Ctrl+Z support during capture.
- **Recommendation:** Implement a simple undo stack for step deletions.

### Ondoki's Differentiators
- **Open source** — unique in this space; competitors are all proprietary SaaS
- **Self-hostable** — enterprises can run their own instance
- **Dock mode** — minimal overlay UI during recording is well-designed
- **PKCE OAuth** — proper auth flow (vs API key or cookie-based approaches)

---

## 4. Code Quality & Dead Code

### CQ-001: `drawClickMarker` function is defined but never called
- **Severity:** MEDIUM
- **File:** `background.js`, lines 253-296
- **Details:** 44 lines of dead code implementing click marker rendering with `OffscreenCanvas`. The sidepanel renders markers via CSS instead.
- **Fix:** Remove `drawClickMarker` or integrate it if server-side rendering needs baked-in markers.

### CQ-002: `preventDoubleCapture` is a no-op function
- **Severity:** LOW
- **File:** `content.js`, lines 181-183
- **Details:** Registered as a `contextmenu` listener but does nothing. `mousedown` already captures right-clicks.
- **Fix:** Remove the function and listener.

### CQ-003: Duplicated upload logic in popup.js
- **Severity:** MEDIUM
- **File:** `popup.js`, lines 155-172 and 174-197
- **Details:** Upload progress logic is copy-pasted in `completeBtn` and `uploadBtn` handlers. `sidepanel.js` already has a shared `performUpload()` function — popup.js doesn't.
- **Fix:** Extract into a shared `performUpload()` function.

### CQ-004: Duplicated `escapeHtml` and `sendMessage` utilities
- **Severity:** LOW
- **File:** `popup.js` and `sidepanel.js`
- **Details:** Identical utility functions in both files. Acceptable for a small codebase but could be shared.
- **Fix:** Create a `utils.js` module or accept the duplication.

### CQ-005: Inconsistent error handling — silent failures
- **Severity:** MEDIUM
- **File:** Multiple
- **Details:**
  - `fetchUserInfo` / `fetchUserProjects`: catch errors silently — UI shows stale/empty data
  - Dock complete handler: upload errors silently ignored, steps cleared anyway (see BUG-007)
  - `sendMessage` in popup/sidepanel: `chrome.runtime.lastError` not handled — resolves with `{}`
- **Fix:** Propagate errors to UI. Show toast notifications for failed operations.

### CQ-006: Magic numbers scattered throughout
- **Severity:** LOW
- **File:** Multiple
- **Details:** `DOUBLE_CLICK_MS = 400`, `TYPING_DELAY = 1000`, `MAX_STEPS = 100`, quality `70`, delays `50ms`, dedup `2000ms`, nav suppression `3000ms` — all hardcoded.
- **Fix:** Centralize constants. Make user-facing ones configurable.

### CQ-007: JSX syntax in popup.html SVG
- **Severity:** LOW
- **File:** `popup.html`, lines 13-34
- **Details:** `style={{ width: "38px", height: "36px" }}` is JSX, not HTML. Browsers ignore it, so SVG renders at default size.
- **Fix:** Change to `style="width: 38px; height: 36px"`.

### CQ-008: No module bundling or build step
- **Severity:** LOW
- **File:** Entire codebase
- **Details:** All JS is plain scripts loaded directly. No TypeScript, no bundler, no linting configuration. While keeping things simple has value (especially for an open-source project), the lack of type checking makes it easy to introduce bugs.
- **Fix:** Consider adding TypeScript and a minimal build step (esbuild/vite). At minimum, add ESLint.

---

## 5. General Issues

### GEN-001: No declarative content script in manifest
- **Severity:** MEDIUM
- **File:** `manifest.json`
- **Details:** No `content_scripts` key — all injection is programmatic via `chrome.scripting.executeScript`. On extension update, existing tabs don't get the content script until navigation. Injection failures are silent.
- **Fix:** Add a declarative `content_scripts` entry for baseline injection, supplemented by programmatic injection for edge cases.

### GEN-002: No offline handling
- **Severity:** HIGH
- **Details:** Zero offline detection. If offline: login fails cryptically, upload fails silently, auto-login on startup fails and **clears all auth state** (background.js ~line 248 — any fetch error triggers full logout). Users with spotty connectivity will lose their session.
- **Fix:** Check `navigator.onLine` before network operations. Queue uploads for retry. Don't clear auth state on network errors — only on explicit 401/403.

### GEN-003: No recording indicator on the web page in sidepanel mode
- **Severity:** MEDIUM
- **Details:** In sidepanel mode, there's no visual indicator on the web page that recording is active. Users may forget they're recording sensitive activities. Dock mode has the overlay, but sidepanel mode has nothing.
- **Fix:** Inject a small pulsing recording dot in the page corner for sidepanel mode.

### GEN-004: No onboarding for first-time users
- **Severity:** MEDIUM
- **Details:** First-time users see a login screen with no explanation. The '!' badge for unconfigured API URL is a start, but there's no guided setup.
- **Fix:** Add a welcome screen on first install: explain the extension, guide API URL configuration, walk through first recording.

### GEN-005: No way to edit step descriptions
- **Severity:** LOW
- **Details:** Steps have auto-generated descriptions. Users can delete steps but can't edit descriptions, making guides less useful before upload.
- **Fix:** Make descriptions editable inline in the sidepanel.

### GEN-006: No session timeout / auto-lock
- **Severity:** MEDIUM
- **Details:** Once authenticated, the extension stays logged in indefinitely (until the refresh token expires server-side). No inactivity timeout. If someone walks away from an unlocked workstation, anyone can record and upload to their account.
- **Fix:** Add a configurable inactivity timeout. Lock the extension (require re-auth) after N minutes of inactivity. Clear in-memory access token on lock.

### GEN-007: No automated tests
- **Severity:** MEDIUM
- **Details:** Zero test files. No unit tests for auth, message handling, step management, or screenshot capture. No integration tests.
- **Fix:** Add unit tests for auth token handling, step management, and message routing. Use Puppeteer/Playwright for extension E2E tests.

### GEN-008: No i18n/l10n support
- **Severity:** LOW
- **Details:** All strings hardcoded in English.
- **Fix:** Use Chrome's `chrome.i18n` API with `_locales/` directory.

### GEN-009: No telemetry or error reporting
- **Severity:** LOW
- **Details:** Errors only logged to console (and only when `DEBUG = true`). No way for the team to learn about production issues.
- **Fix:** Add opt-in error reporting (Sentry or similar). Log errors to `chrome.storage.local` for user diagnostics.

### GEN-010: Data handling — no encryption at rest, no retention policy
- **Severity:** MEDIUM
- **Details:** Screenshots and keystroke data are stored unencrypted in `chrome.storage.local` with no automatic cleanup. For enterprise users capturing internal workflows, this is a data leakage risk. There's no configurable retention period or auto-purge.
- **Fix:** Add auto-cleanup of persisted steps after successful upload. Add a configurable data retention period. Consider encrypting stored data with a key derived from the user's session.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1     |
| HIGH     | 5     |
| MEDIUM   | 20    |
| LOW      | 12    |
| **Total**| **38**|

### Top Priority Fixes

**Before any production/Web Store deployment:**

1. **SEC-001:** Default to HTTPS; validate URL scheme in settings
2. **SEC-002:** Replace `<all_urls>` with `optional_host_permissions`
3. **SEC-006:** Broaden sensitive field detection for keystroke capture
4. **BUG-001:** Persist `isPaused` state; protect PKCE flow from SW termination
5. **BUG-003:** Fix async `sendResponse` reliability for long operations
6. **BUG-007:** Don't clear steps on upload failure in dock mode
7. **BUG-010:** Add `RESUME_RECORDING` handler in content.js (recording breaks after resume)
8. **GEN-002:** Add offline detection; don't logout on network errors

**For competitive parity:**

9. **COMP-001:** Smart step detection / merging
10. **COMP-002:** Auto-redaction / PII blur
11. **COMP-003:** Instant sharing with link generation
12. **COMP-008:** Keyboard shortcuts
13. **COMP-004:** Step editing before upload

### Ondoki's Strengths
- Clean, well-structured MV3 architecture
- PKCE OAuth flow is correctly implemented
- Good SW lifecycle handling (step persistence, auth restoration)
- Dual-mode UI (sidepanel + dock) is a nice UX touch
- Shadow DOM isolation for dock overlay prevents CSS conflicts
- Open-source + self-hostable is a genuine differentiator
