# Ondoki Desktop Electron — Comprehensive Code Review

> Scope reviewed: all `src/` files (main + renderer), configs (`package.json`, `forge.config.js`, `webpack.config.js`, `tsconfig*.json`, `vitest.config.ts`, `tailwind.config.js`, `postcss.config.js`), and `test/`.

---

## Executive Summary
The app is thoughtfully structured for its size, but several Electron security baselines are missing (sandbox, strict CSP, deep-link validation), and the IPC surface is broad. The recording/upload pipeline works, yet lacks cleanup, offline retries, and crash recovery. Feature-wise, it’s behind mature competitors like Scribe/Tango/Guidde/Loom/Notion/Mintlify/Whatfix/WalkMe on editing, sharing, integrations, analytics, and onboarding.

---

## 1. Security Issues

### 1.1 Overly permissive CSP (unsafe-inline / unsafe-eval + wildcard connects)
- **Severity:** HIGH
- **File:** `src/renderer/spotlight.html` (line 6), `src/renderer/settings.html` (line 6)
- **Issue:** CSP allows `unsafe-inline` and `unsafe-eval`, and `connect-src https://* http://*` with `img-src file:`. This weakens renderer isolation and increases XSS → IPC abuse risk.
- **Fix:** Remove `unsafe-inline`/`unsafe-eval`, use hashed/nonced scripts/styles, restrict `connect-src` to known origins (HTTPS only), and remove `img-src file:` unless strictly required.

### 1.2 `--no-sandbox` in run scripts
- **Severity:** HIGH
- **File:** `package.json` (lines 23–24)
- **Issue:** `electron . --no-sandbox` disables Chromium sandbox, undermining renderer security.
- **Fix:** Remove `--no-sandbox` from scripts (including dev). If absolutely needed for a specific environment, gate via env var and never ship it in production builds.

### 1.3 BrowserWindows don’t enable `sandbox: true`
- **Severity:** HIGH
- **File:** `src/main/index.ts` (lines 198–211, 305–320, 392–405, 542–556)
- **Issue:** `sandbox: true` is not set on windows (spotlight, settings, picker, countdown). Even with `contextIsolation`, the renderer isn’t sandboxed.
- **Fix:** Set `webPreferences: { sandbox: true }` on all BrowserWindows and test preload IPC functionality.

### 1.4 IPC surface is broad and unauthenticated
- **Severity:** HIGH
- **File:** `src/main/preload.ts` (lines 45–251)
- **Issue:** Renderer is granted access to recording, screenshots, clipboard, external URL opening, context watcher, uploads, etc. Any renderer compromise grants local control.
- **Fix:** Reduce exposed APIs, split preloads per window with least-privilege, require explicit user gestures for sensitive actions, and validate all inputs.

### 1.5 Deep-link handler isn’t strictly validated
- **Severity:** MEDIUM
- **File:** `src/main/index.ts` (lines 884–902)
- **Issue:** Any `ondoki://` URL triggers `handleProtocolUrl` and shows Spotlight. Only callback path is checked; other paths are accepted without validation.
- **Fix:** Parse with `new URL()`, validate scheme/host/path, ignore unknown endpoints, and reject malformed payloads.

### 1.6 Auth callback IPC accepts arbitrary URL
- **Severity:** MEDIUM
- **File:** `src/main/ipc-handlers.ts` (lines 197–205)
- **Issue:** Renderer can call `auth:handle-callback` with any URL string, bypassing the protocol handler’s minimal validation. State check helps, but untrusted inputs still reach token exchange.
- **Fix:** Validate scheme/host/path in `handleCallback` and reject anything not `ondoki://auth/callback`.

### 1.7 WebSocket token in URL query string
- **Severity:** MEDIUM
- **File:** `src/main/auth.ts` (line 326)
- **Issue:** Access token is placed in `?token=` query. Tokens can leak via logs, proxies, or telemetry.
- **Fix:** Use an auth header via WebSocket subprotocol or a short‑lived WS-specific token.

### 1.8 Refresh token storage fallback is weak
- **Severity:** MEDIUM
- **File:** `src/main/settings.ts` (lines 78–87, 106–108)
- **Issue:** If `safeStorage` isn’t available, encryption key is derived from `userData` path (not secret). Refresh token is effectively weakly protected.
- **Fix:** Use OS keychain (keytar) or disable refresh token storage when safeStorage isn’t available.

### 1.9 Inline JSON injection risk in Picker HTML
- **Severity:** MEDIUM
- **File:** `src/main/index.ts` (lines 578–706)
- **Issue:** Window titles/display names are interpolated into inline `<script>` (JSON). A title containing `</script>` can terminate the script and inject content.
- **Fix:** Escape `</script>` (`<\/script>`), use `<script type="application/json">` with `textContent`, or move picker UI to a static file and pass data via IPC.

### 1.10 External URLs opened without validation
- **Severity:** MEDIUM
- **File:** `src/main/index.ts` (lines 331–334, 790–794, 849–860), `src/main/ipc-handlers.ts` (lines 120–127, 452–455)
- **Issue:** `shell.openExternal` is called on any URL (window open, upload result, tray menu) without scheme/host validation.
- **Fix:** Validate scheme (https only), restrict hostnames to trusted domains, and block `file://`, `javascript:`, `data:`.

### 1.11 Screenshot/clipboard access exposed to renderer
- **Severity:** MEDIUM
- **File:** `src/main/ipc-handlers.ts` (lines 378–397)
- **Issue:** Renderer can read clipboard and trigger full-screen screenshots silently.
- **Fix:** Restrict to explicit user gesture, add permission prompts, or remove these IPC methods from renderer builds.

---

## 2. Production Bugs & Issues

### 2.1 Recording artifacts and screenshots never cleaned up
- **Severity:** HIGH
- **File:** `src/main/recording.ts` (lines 270–272), `src/main/screenshot.ts` (lines 617–622), `src/main/cloud-upload.ts` (lines 127–145)
- **Issue:** Screenshots are written to `os.tmpdir()/Ondoki/*` and not deleted after successful upload or on crash. Failed uploads save JSON with raw paths.
- **Fix:** Delete screenshots after successful upload; on startup, clean old temp folders. For failed uploads, copy screenshots into a controlled fallback directory with retention policy.

### 2.2 Auto-annotation ignores user setting
- **Severity:** MEDIUM
- **File:** `src/main/ipc-handlers.ts` (lines 82–109)
- **Issue:** `autoAnnotateSteps` exists but is not checked; annotation runs whenever LLM/auth is available.
- **Fix:** Respect `settings.autoAnnotateSteps` and skip annotation when disabled.

### 2.3 Native hooks timeout doesn’t kill process
- **Severity:** MEDIUM
- **File:** `src/main/recording.ts` (lines 344–349)
- **Issue:** If the hooks process doesn’t send a ready message, the promise rejects but the process may continue running.
- **Fix:** On timeout, kill `hooksProcess`, close readline, and clear listeners.

### 2.4 Scroll handling code is dead / scroll steps never recorded
- **Severity:** LOW
- **File:** `src/main/recording.ts` (lines 438–440, 848–888)
- **Issue:** Scroll events are ignored in `handleNativeEvent`, but a full scroll handler exists and is never called. This is either dead code or a missing feature.
- **Fix:** Either wire `handleNativeScroll` into the dispatcher or remove the dead code and update product expectations.

### 2.5 No crash recovery or autosave for recordings
- **Severity:** MEDIUM
- **File:** `src/main/recording.ts`, `src/main/ipc-handlers.ts`
- **Issue:** Steps are in-memory only; app crash loses an in-progress recording.
- **Fix:** Periodically persist steps to disk during recording and recover on restart.

### 2.6 Upload flow blocks and has no retry queue
- **Severity:** LOW
- **File:** `src/main/ipc-handlers.ts` (lines 74–147), `src/main/cloud-upload.ts`
- **Issue:** Upload runs inline on stop; no background queue or auto-retry when offline.
- **Fix:** Implement a local upload queue with retry/backoff and resume on next launch.

### 2.7 Clipboard watching variables unused
- **Severity:** LOW
- **File:** `src/main/ipc-handlers.ts` (lines 252–387)
- **Issue:** `clipboardWatchingEnabled` / `lastClipboardText` are set but never used.
- **Fix:** Remove or implement clipboard monitoring properly.

---

## 3. Competitor Analysis & Missing Features (Scribe, Tango, Guidde, Loom, Notion, Mintlify, Whatfix, WalkMe)

> **File/Line:** N/A (product gaps)

- **Step editor & annotation tooling** (crop/blur/redact, arrows, callouts, step merging, rearrange, “smart” highlight boxes).
- **Video/GIF recording + voiceover** (Loom/Guidde-style narration and export).
- **Shareable/public links + permissions** (workspace sharing, view permissions, password‑protected links).
- **Export formats** (PDF, Markdown, HTML, DOCX, Confluence, Notion, GitHub, Mintlify docs pipelines).
- **Integrations** (Slack, Teams, Jira, Confluence, Notion, Google Drive, Zapier/Webhooks).
- **Analytics** (views, completion, engagement, drop‑off, search analytics).
- **Onboarding & guided setup** (first‑run tour, capture permission checks, device readiness).
- **Collaboration** (comments, version history, approvals, multi‑author edits).
- **AI features** (auto-title/summary, step grouping, “one‑click cleanup”, auto‑redaction, knowledge base Q&A).
- **Offline-first capture** (queue uploads and allow editing before upload).
- **Accessibility & localization** (ARIA support, keyboard-only navigation, multi‑language UI).
- **Auto-updates** (background update checks, release notes).

---

## 4. Code Quality & Dead Code

### 4.1 Unused / dead code
- **Severity:** LOW
- **File:** `src/main/index.ts` (lines 477–479) — `isStartingRecording` set but never used.
- **File:** `src/main/ipc-handlers.ts` (lines 252–387) — clipboard watching vars unused.
- **File:** `src/main/chat.ts` (line 11) — `supportsVision` is declared but never used.
- **Fix:** Remove or implement; dead code increases maintenance cost.

### 4.2 Unused settings fields
- **Severity:** LOW
- **File:** `src/main/settings.ts` (lines 10–17, 45–47)
- **Issue:** `apiKey`, `llmProvider`, `llmApiKey`, `llmModel`, `llmBaseUrl`, `autoGenerateGuide` aren’t surfaced in UI or consistently used.
- **Fix:** Implement UI and usage or remove to reduce confusion.

### 4.3 Test coverage gaps
- **Severity:** MEDIUM
- **File:** `test/` (general)
- **Issue:** Tests focus on coordinate math and protocol contracts. No tests for auth, IPC permissions, uploads, or UI flows.
- **Fix:** Add unit tests for auth/token storage, IPC authorization, upload retries, and core recording lifecycle; consider Playwright for UI.

---

## 5. General Issues / Observations

### 5.1 Sensitive data at rest not encrypted
- **Severity:** HIGH
- **File:** `src/main/recording.ts` (lines 270–272), `src/main/screenshot.ts` (lines 617–622), `src/main/cloud-upload.ts` (lines 127–145)
- **Issue:** Screenshots and metadata are stored unencrypted on disk (temp + userData fallback).
- **Fix:** Encrypt at rest (keychain‑backed key), secure deletion, and retention policies.

### 5.2 Insecure transport defaults
- **Severity:** MEDIUM
- **File:** `src/main/settings.ts` (lines 37–48)
- **Issue:** Defaults are `http://` endpoints, allowing MITM in production.
- **Fix:** Default to HTTPS, warn or block insecure origins in production builds.

### 5.3 CSP allows `connect-src http://*`
- **Severity:** MEDIUM
- **File:** `src/renderer/spotlight.html` (line 6), `src/renderer/settings.html` (line 6)
- **Issue:** Permits any HTTP connection.
- **Fix:** Restrict to known HTTPS endpoints only.

---

## Recommendations (Priority Order)
1. Tighten CSP and enable sandbox on all windows.
2. Remove `--no-sandbox` and validate all external URLs.
3. Reduce IPC surface with least privilege per window.
4. Secure token storage (keychain) and avoid WS query tokens.
5. Add cleanup + crash recovery + upload queue.
6. Implement core competitive features (editor, exports, integrations, onboarding).

---

## Files Reviewed
- All `src/main/*` and `src/renderer/*`
- `package.json`, `forge.config.js`, `webpack.config.js`, `tsconfig*.json`, `vitest.config.ts`, `tailwind.config.js`, `postcss.config.js`
- `test/` (all files)

---

*End of report.*
