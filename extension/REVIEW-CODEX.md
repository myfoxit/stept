# Ondoki Chrome Extension — Comprehensive Review (Codex)

Reviewed files:
- manifest.json
- background.js
- content.js
- popup.js / popup.html / popup.css
- sidepanel.js / sidepanel.html / sidepanel.css
- icons/README.md

## 1) Security Issues

### S1. Broad host permissions (`<all_urls>`) + blanket injection
- **Severity:** HIGH
- **Files:** manifest.json, background.js
- **Issue:** Host permissions include `<all_urls>` and the background injects content scripts into *all* http/https tabs. This grants the extension access to clicks, typed text, URLs, and screenshots on every site.
- **Fix:** Replace `<all_urls>` with an allowlist or use `optional_host_permissions` + runtime request only when recording. Add per-site consent and a domain allowlist UI.

### S2. API base URL allows HTTP / unvalidated custom endpoints
- **Severity:** HIGH
- **Files:** background.js, popup.js, sidepanel.js
- **Issue:** Default API URL is `http://localhost:8000/api/v1`, and settings accept any URL. Users can set non-HTTPS endpoints, risking token leakage over cleartext or to malicious hosts.
- **Fix:** Enforce HTTPS for non-localhost. Validate against known domains (e.g., `https://app.ondoki.com`) or require explicit unsafe confirmation. Show warnings and reject invalid URLs.

### S3. Tokens stored in `chrome.storage.local`
- **Severity:** MEDIUM
- **File:** background.js
- **Issue:** Access/refresh tokens are persisted unencrypted on disk. A local compromise or extension exploit could expose long-lived tokens.
- **Fix:** Store access token in `chrome.storage.session` or memory. Persist only refresh token if needed. Add token expiry checks.

### S4. Typed text capture beyond password fields
- **Severity:** HIGH
- **File:** content.js
- **Issue:** Typed text is captured for nearly all input fields except password and a few credit-card autocomplete values. This can capture sensitive text in normal fields.
- **Fix:** Add strict allowlist or default text capture off. Expand sensitive-field heuristics (autocomplete values, labels, aria, data- attributes). Provide per-site opt-out and a “privacy mode.”

### S5. Screenshots captured for click steps on any site
- **Severity:** HIGH
- **File:** background.js
- **Issue:** Full screenshots are taken on click steps with no per-site consent, redaction, or opt-out. This can capture sensitive data.
- **Fix:** Add a per-site allowlist, redaction/blur, and a screenshot toggle. Consider capturing element bounding boxes instead of full screens.

### S6. Message passing lacks sender validation
- **Severity:** MEDIUM
- **File:** background.js
- **Issue:** `chrome.runtime.onMessage` accepts any sender. There is no validation for expected sender origins/tabs.
- **Fix:** Validate `sender.id === chrome.runtime.id`. For content-script messages, require `sender.tab`. For popup/sidepanel, require `!sender.tab` and expected `sender.url`.

### S7. Remote font loading (Google Fonts)
- **Severity:** LOW
- **Files:** popup.html, sidepanel.html
- **Issue:** External font loads add privacy/availability risk and may be blocked by enterprise policies.
- **Fix:** Bundle fonts locally or use system fonts.

## 2) Production Bugs & Reliability Issues

### B1. Pause doesn’t stop content scripts from capturing
- **Severity:** HIGH
- **Files:** background.js, content.js
- **Issue:** `pauseRecording()` only flips state and badge. It does not broadcast `PAUSE_RECORDING` to content scripts. Content scripts keep listening and sending events (discarded by background), which wastes resources and still captures locally.
- **Fix:** Broadcast `PAUSE_RECORDING` to all tabs. Stop listeners in content scripts.

### B2. `RESUME_RECORDING` not handled in content.js
- **Severity:** MEDIUM
- **Files:** background.js, content.js
- **Issue:** Background broadcasts `RESUME_RECORDING`, but content.js has no handler, so capture never resumes after pause.
- **Fix:** Add a handler that calls `startCapturing()` and updates dock UI state.

### B3. MV3 service worker restart loses pause state
- **Severity:** MEDIUM
- **File:** background.js
- **Issue:** `isPaused` is not persisted. If the SW restarts, recording resumes even if paused.
- **Fix:** Persist `isPaused` in `persistRecordingState()` and restore on startup; re-broadcast to tabs.

### B4. SW lifecycle can drop events
- **Severity:** MEDIUM
- **File:** background.js
- **Issue:** Content scripts continue sending events even if the service worker is suspended, causing dropped steps.
- **Fix:** Use `chrome.runtime.connect` to keep SW alive during recording or add an event queue in storage with retries.

### B5. Screenshot data URLs in `chrome.storage.local` can exceed quota
- **Severity:** MEDIUM
- **File:** background.js
- **Issue:** `persistSteps()` stores base64 screenshots; quota can be exceeded quickly. Fallback strips screenshots but may silently fail.
- **Fix:** Store screenshots in IndexedDB or in-memory only. Persist metadata only or upload immediately.

### B6. Dock “Complete” clears steps even on upload failure
- **Severity:** MEDIUM
- **File:** content.js
- **Issue:** Dock’s complete flow always clears steps, even if upload fails, causing data loss.
- **Fix:** Only clear on success. Surface errors in dock UI and allow retry.

### B7. Async sendResponse for long operations
- **Severity:** MEDIUM
- **File:** background.js
- **Issue:** Long operations (login/upload) may outlive the message port and lose `sendResponse` when SW suspends.
- **Fix:** Send immediate ack and use a follow-up message/event to report completion.

### B8. Double-click detection delays screenshot timing
- **Severity:** MEDIUM
- **File:** content.js
- **Issue:** Single clicks are delayed by 400ms to detect double-clicks, so screenshots are taken after the UI may have changed.
- **Fix:** Capture screenshot immediately on mousedown (or capture in content script if feasible) and attach once click type resolves.

### B9. `lastTrackedPage` dedupe is global
- **Severity:** MEDIUM
- **File:** background.js
- **Issue:** Dedupe state is global; multi-window workflows can suppress valid navigation steps in other windows.
- **Fix:** Track per window or per tab.

### B10. Step renumbering after delete causes inconsistencies
- **Severity:** MEDIUM
- **File:** background.js
- **Issue:** Steps are renumbered after delete. Sidepanel uses stepNumber as key; this can desync UI until refresh.
- **Fix:** Use stable IDs (UUIDs), derive display order from array index.

### B11. Upload progress is simulated
- **Severity:** LOW
- **Files:** popup.js, sidepanel.js
- **Issue:** Progress bar advances on a timer unrelated to actual upload.
- **Fix:** Emit real progress from background (metadata upload, per-image upload).

## 3) Competitor Analysis (Scribe, Tango, Guidde, Loom)

### Missing / behind-market capabilities
- **Smart step detection / grouping:** Competitors merge related actions; Ondoki records raw clicks and keys. Add heuristics to merge click→select sequences and combine rapid clicks.
- **Auto-redaction / blur:** No automated redaction. Add PII detection and blur on screenshots; allow manual redaction.
- **Video recording:** Guidde/Loom offer video. Add optional recording via `tabCapture` / `getDisplayMedia`.
- **Instant sharing:** No quick share link after upload. Add link generation and “copy link” UI.
- **Team/workspace switcher:** Only project selection. Add workspace/team switcher and recent items.
- **Templates / reusable workflows:** Add templates and duplication for faster guide creation.
- **Step editing:** Only delete; no edit/reorder/crop/annotation. Add inline edit and drag-reorder.
- **Undo/redo:** No undo for deletes. Add a simple undo stack.
- **Multi-tab tracking:** Basic. Improve tracking across windows and tabs with clearer attribution.
- **Interactive guide playback:** Missing. Add playback overlay highlighting elements.
- **Keyboard shortcuts:** No `commands` in manifest; add start/pause/stop shortcuts.

## 4) Code Quality & Dead Code

### Q1. `drawClickMarker` is unused
- **Severity:** LOW
- **File:** background.js
- **Fix:** Remove or integrate into screenshot processing.

### Q2. Duplicate UI logic between popup and sidepanel
- **Severity:** LOW
- **Files:** popup.js, sidepanel.js
- **Issue:** Login, settings, upload flows duplicated.
- **Fix:** Extract shared helpers or a small UI module.

### Q3. Inconsistent error handling
- **Severity:** MEDIUM
- **Files:** background.js, popup.js, sidepanel.js
- **Issue:** Many errors are swallowed; dock flow ignores upload failure.
- **Fix:** Surface errors consistently (toast/inline), log to storage for diagnostics.

### Q4. Inline HTML template strings + unvalidated URLs
- **Severity:** LOW
- **Files:** popup.js, sidepanel.js
- **Issue:** HTML strings inject screenshot URLs directly.
- **Fix:** Use DOM APIs; validate URL scheme (data: only).

### Q5. JSX-style `style={{...}}` in popup.html
- **Severity:** LOW
- **File:** popup.html
- **Issue:** JSX syntax in raw HTML is invalid and ignored.
- **Fix:** Convert to standard HTML `style="..."`.

## 5) General Issues / Product Gaps

### G1. No onboarding / disclosure
- **Severity:** MEDIUM
- **Files:** popup.html, sidepanel.html
- **Issue:** No first-run flow or disclosure about what gets recorded.
- **Fix:** Add onboarding with explicit consent toggles and capture scope explanation.

### G2. No privacy controls for capture scope
- **Severity:** MEDIUM
- **Files:** UI + background.js
- **Issue:** No allowlist, no toggles for screenshots/typed text, no exclusions.
- **Fix:** Add per-site allowlist, capture-type toggles, and quick pause hotkey.

### G3. No local export option
- **Severity:** MEDIUM
- **Files:** background.js, popup.js, sidepanel.js
- **Issue:** Only cloud upload; no JSON/PDF/ZIP export.
- **Fix:** Add export and allow review/redaction before upload.

### G4. No tests or linting
- **Severity:** MEDIUM
- **Issue:** No automated tests or linting.
- **Fix:** Add basic unit tests and a minimal lint setup.

### G5. No consistent recording indicator in sidepanel mode
- **Severity:** MEDIUM
- **Issue:** Only dock has on-page indicator; sidepanel mode has none on the page.
- **Fix:** Inject a small indicator in page corner when recording.

---

## Highest-Risk Items (Fix First)
1. **Broad `<all_urls>` + blanket injection**
2. **Unvalidated API URL allowing HTTP**
3. **Typed text capture without strong controls**
4. **Full screenshots on any site without consent/redaction**
5. **Pause/resume capture bugs (pause not broadcast + resume not handled)**

