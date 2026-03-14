# Ondoki Chrome Extension Review (Updated)

Scope: manifest.json, background.js, content.js, popup.js/html/css, sidepanel.js/html/css, ISSUES.md. This is a productivity/process documentation tool (not medical).

---

## 1. Security & Privacy

### S1 — Overbroad host permissions + blanket injection
- **Severity:** HIGH
- **Files:** manifest.json, background.js
- **Issue:** `<all_urls>` plus `scripting` + injection into all http/https tabs gives the extension full read/interaction access on every site, regardless of user intent.
- **Fix:** Remove `<all_urls>`. Use `activeTab` and/or `optional_host_permissions` with user opt‑in (domain allowlist). Only inject on approved domains.

### S2 — Default API URL is HTTP
- **Severity:** HIGH
- **Files:** background.js (DEFAULT_API_BASE_URL)
- **Issue:** Default `http://localhost:8000` risks sending auth tokens and captured data in cleartext when misconfigured.
- **Fix:** Default to `https://app.ondoki.com/api/v1`. Reject non‑HTTPS URLs except explicit `localhost` dev mode; show hard error in settings.

### S3 — Typed text capture without robust redaction
- **Severity:** HIGH
- **Files:** content.js
- **Issue:** Captures all keystrokes except password/CC fields. This can include sensitive data (credentials, tokens, PII).
- **Fix:** Add stricter sensitive‑field detection (autocomplete attributes, aria/label keyword checks, input types), allowlist/denylist, and default text capture **off** with explicit user opt‑in.

### S4 — Screenshot capture on every site without consent
- **Severity:** HIGH
- **Files:** background.js (captureScreenshot + addStep)
- **Issue:** Screenshots can capture sensitive information; currently no per‑site consent or redaction.
- **Fix:** Add per‑site consent and optional redaction/blur (element selector or bounding boxes). Provide clear capture indicator.

### S5 — Tokens persisted unencrypted in storage
- **Severity:** MEDIUM
- **Files:** background.js
- **Issue:** Access/refresh tokens stored in `chrome.storage.local` (disk). If profile compromised, tokens can be exfiltrated.
- **Fix:** Store access token in `chrome.storage.session` or memory; persist only refresh token (if needed). Add “lock on restart.”

### S6 — No message origin validation
- **Severity:** MEDIUM
- **Files:** background.js (onMessage listener)
- **Issue:** Messages are accepted without verifying sender context (content script vs extension UI).
- **Fix:** Validate `sender.tab` for content script messages, and `!sender.tab` for popup/sidepanel messages. Reject unexpected senders.

### S7 — Remote font loading
- **Severity:** LOW
- **Files:** popup.html, sidepanel.html
- **Issue:** Google Fonts loaded from remote origin. Unnecessary external dependency and potential privacy leak.
- **Fix:** Bundle fonts locally or use system fonts only.

---

## 2. Reliability / Bugs

### B1 — Pause state not persisted across SW restart
- **Severity:** HIGH
- **Files:** background.js
- **Issue:** `isPaused` not stored. SW restart resumes capturing even if paused.
- **Fix:** Persist `isPaused` in storage and restore on startup; broadcast pause state to content scripts.

### B2 — Content scripts keep capturing while paused
- **Severity:** HIGH
- **Files:** background.js, content.js
- **Issue:** On pause, content scripts still listen for events (data gets sent, then dropped). This is unexpected and still “captures.”
- **Fix:** Broadcast `PAUSE_RECORDING` to all tabs and stop event listeners in content.js.

### B3 — Service worker restart doesn’t re‑arm existing tabs
- **Severity:** MEDIUM
- **Files:** background.js
- **Issue:** On restart, existing tabs won’t be re‑injected unless they navigate or update.
- **Fix:** After state restore, iterate open tabs and re‑send START/PAUSE messages (and inject if needed).

### B4 — Async `sendResponse` can time out on long operations
- **Severity:** MEDIUM
- **Files:** background.js (UPLOAD, LOGIN flows)
- **Issue:** Some operations can exceed the message channel lifetime.
- **Fix:** Return immediate ack; emit progress/results via separate `runtime.sendMessage` events.

### B5 — Dock UI doesn’t update on pause/resume
- **Severity:** LOW
- **Files:** content.js
- **Issue:** `PAUSE_RECORDING`/`RESUME_RECORDING` doesn’t update dock UI state.
- **Fix:** Set `dockIsPaused` + rerender when receiving pause/resume messages.

### B6 — `RESUME_RECORDING` not handled in content.js
- **Severity:** LOW
- **Files:** content.js
- **Issue:** Only `PAUSE_RECORDING` sets `isRecording = false`; resume doesn’t re‑enable capturing.
- **Fix:** Implement `RESUME_RECORDING` to call `startCapturing()` or set `isRecording = true` + reattach listeners.

### B7 — Step renumbering can desync UI
- **Severity:** MEDIUM
- **Files:** background.js, sidepanel.js
- **Issue:** Deleting a step renumbers, but UI caches by stepNumber; can lead to mismatch.
- **Fix:** Use stable UUIDs for steps and derive display index in UI.

### B8 — Screenshot storage quota risk
- **Severity:** MEDIUM
- **Files:** background.js
- **Issue:** Storing data URLs in `chrome.storage.local` risks quota exhaustion. Fallback strips screenshots silently.
- **Fix:** Use IndexedDB or in‑memory store + immediate upload, or request `unlimitedStorage`.

---

## 3. Missing / Competitive Features

Competitor comparison (Scribe, Tango, Guidde, Loom extensions). Key gaps observed:

- **Smart step detection / auto‑grouping** (e.g., auto labels for common UI patterns)
- **Auto‑redaction / blur** (sensitive fields and regions)
- **Video recording** or GIF export
- **Instant sharing link + team space switcher**
- **Templates for common workflows**
- **Step editing / rename / reorder / undo‑redo**
- **Multi‑tab / multi‑window tracking with session context**
- **Interactive guide playback**

Additional product gaps:
- **Onboarding & consent flow** (first‑run disclosure, per‑site toggles)
- **Domain allowlist / per‑site enable**
- **Keyboard shortcuts** (start/stop/pause via `commands`)
- **Local export** (PDF/ZIP/JSON)
- **Offline handling** (queue uploads + retry UI)
- **Always‑visible recording indicator** in sidepanel mode

---

## 4. Code Quality / Maintainability

### Q1 — Dead code: drawClickMarker
- **Severity:** MEDIUM
- **Files:** background.js
- **Issue:** Function defined but never used.
- **Fix:** Remove or integrate into screenshot flow.

### Q2 — Duplicate upload logic
- **Severity:** MEDIUM
- **Files:** popup.js, sidepanel.js
- **Issue:** Similar progress UI + upload logic repeated in two files.
- **Fix:** Extract shared helper module or background‑driven upload status.

### Q3 — Unused preview panel in popup
- **Severity:** LOW
- **Files:** popup.js/html
- **Issue:** Preview panel exists but never shown.
- **Fix:** Implement “Preview” action or delete UI.

### Q4 — JSX‑style `style={{...}}` in popup.html
- **Severity:** LOW
- **Files:** popup.html
- **Issue:** JSX syntax is invalid HTML; may be ignored by the browser.
- **Fix:** Convert to valid HTML style attributes.

### Q5 — Magic numbers / hardcoded timing
- **Severity:** LOW
- **Files:** content.js, background.js, UI files
- **Fix:** Centralize constants (double‑click delay, typing delay, screenshot quality, limits).

---

## 5. Notable UX/Consistency Issues

- **Inconsistent error handling** (popup inline, sidepanel toast, dock silent).
- **Dock “Complete” clears steps even on upload failure** (content.js). Should only clear after success.
- **Fake upload progress** (simulated increments). Consider real progress or staged messages.

---

## Quick Priority Recommendations

1. **Remove `<all_urls>` and add per‑site allowlist + consent.**
2. **Enforce HTTPS for API base URL (except localhost dev).**
3. **Persist pause state and broadcast pause/resume to content scripts.**
4. **Implement sensitive‑data redaction / text capture opt‑in.**
5. **Fix SW restart re‑arming and screenshot storage strategy.**

---

## Files Reviewed
manifest.json, background.js, content.js, popup.html/js/css, sidepanel.html/js/css, ISSUES.md.