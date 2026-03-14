# Ondoki Desktop Electron — Comprehensive Review (Gemini)

This review covers all source files under `src/`, plus key config files. Findings are grouped by category with severity, file path(s), and recommended fixes. **This is a productivity/documentation tool** (not a medical app), so findings focus on general security, privacy, stability, and product gaps.

---

## 1) Security Issues

### 1.1 Overly permissive CSP (inline/eval + wide network access)
- **Severity:** HIGH
- **Files:** `src/renderer/spotlight.html`, `src/renderer/settings.html`
- **Issue:** CSP allows `unsafe-inline`, `unsafe-eval`, and `connect-src https://* http://*`. This negates CSP protections and allows inline script execution + arbitrary network calls from the renderer.
- **Fix:** Remove `unsafe-inline` / `unsafe-eval` by moving inline JS/CSS into bundles and using nonces if required. Restrict `connect-src` to the API domains you control.

### 1.2 No Electron sandbox; dev scripts disable it
- **Severity:** HIGH
- **Files:** `package.json` (scripts), `src/main/index.ts` (BrowserWindow `webPreferences`)
- **Issue:** App is launched with `--no-sandbox` in `start`/`dev:electron`. Windows do not set `webPreferences.sandbox = true`.
- **Fix:** Remove `--no-sandbox` from production scripts; enable `sandbox: true` for all windows. Validate preload APIs under sandbox.

### 1.3 Preload exposes a broad, powerful IPC surface
- **Severity:** HIGH
- **File:** `src/main/preload.ts`
- **Issue:** Renderer gets a large API surface (recording, screenshots, cloud uploads, context link CRUD, openExternal). Any renderer compromise becomes a system-level compromise.
- **Fix:** Reduce APIs per window with separate preload files. Require explicit user gestures for sensitive actions; add runtime permission gates.

### 1.4 IPC handlers lack sender validation and input schema checks
- **Severity:** HIGH
- **File:** `src/main/ipc-handlers.ts`
- **Issue:** `ipcMain.handle` routes do not verify sender origin nor validate payload types. A compromised renderer can call `shell.openExternal`, upload arbitrary files, or create context links.
- **Fix:** Validate payloads with zod/io-ts, check `event.senderFrame`/`event.sender.getURL()`, and restrict calls to approved windows.

### 1.5 Token storage uses weak fallback encryption
- **Severity:** MEDIUM
- **File:** `src/main/settings.ts`
- **Issue:** `electron-store` encryption falls back to a hash of the `userData` path when `safeStorage` is unavailable. That key is not secret.
- **Fix:** On platforms without `safeStorage`, avoid persisting refresh tokens or LLM API keys. Prefer OS keychain only.

### 1.6 WebSocket auth token passed in URL query
- **Severity:** MEDIUM
- **File:** `src/main/auth.ts`
- **Issue:** Access token is placed in the WebSocket URL query string. URL tokens can leak via logs or proxies.
- **Fix:** Use an `Authorization` header if the server supports it, or mint a short-lived WS token via POST.

### 1.7 Sensitive local artifacts stored unencrypted
- **Severity:** HIGH
- **Files:** `src/main/recording.ts`, `src/main/cloud-upload.ts`, `src/main/screenshot.ts`
- **Issue:** Screenshots are written to `os.tmpdir()/Ondoki/...` and failed uploads to `userData/Ondoki/failed-uploads` with no encryption or cleanup.
- **Fix:** Encrypt artifacts at rest, delete after successful upload, and provide a “purge local cache” option.

### 1.8 Broad `shell.openExternal` usage with no scheme validation
- **Severity:** MEDIUM
- **Files:** `src/main/index.ts`, `src/main/ipc-handlers.ts`, renderer openResult
- **Issue:** Any URL can be opened (`file://`, `javascript:`). This is a common Electron escalation vector.
- **Fix:** Allowlist schemes (`https`, `mailto`) and reject everything else.

### 1.9 Data URL windows with inline scripts and no CSP
- **Severity:** MEDIUM
- **File:** `src/main/index.ts` (countdown and picker HTML)
- **Issue:** `data:text/html` windows are constructed with inline JS and no CSP. If any content becomes injectable, it can execute scripts.
- **Fix:** Load local HTML files with strict CSP; avoid inline scripts.

### 1.10 Potential sensitive logging
- **Severity:** LOW
- **Files:** `src/main/chat.ts`, `src/main/recording.ts`, `src/main/screenshot.ts`
- **Issue:** Logs include config details and diagnostics about window titles and element data.
- **Fix:** Gate detailed logs behind a debug flag and scrub potentially sensitive data.

---

## 2) Production Bugs & Reliability Issues

### 2.1 Auto‑annotate toggle ignored
- **Severity:** MEDIUM
- **File:** `src/main/ipc-handlers.ts`
- **Issue:** `autoAnnotateSteps` setting is not checked. If AI is available, annotation always runs.
- **Fix:** Honor `settingsManager.getSettings().autoAnnotateSteps` before calling `annotateWorkflow()`.

### 2.2 Recording artifacts are never cleaned up
- **Severity:** MEDIUM
- **Files:** `src/main/recording.ts`, `src/main/cloud-upload.ts`
- **Issue:** Screenshot folders under `os.tmpdir()` remain forever, even after successful upload.
- **Fix:** Delete the recording folder after upload completes; clean orphaned folders on app start.

### 2.3 Failed upload fallback references temp screenshots
- **Severity:** MEDIUM
- **File:** `src/main/cloud-upload.ts`
- **Issue:** The JSON fallback stores `screenshotPath` pointing to temp files that may be deleted by OS cleanup, making retry impossible.
- **Fix:** Copy screenshots into the failed-uploads directory or embed them in the fallback package.

### 2.4 Cloud endpoint mismatch
- **Severity:** MEDIUM
- **Files:** `src/main/settings.ts`, `src/renderer/components/SettingsWindow.tsx`, `src/main/cloud-upload.ts`
- **Issue:** Defaults set `cloudEndpoint` to `/api/v1/process-recording`, but uploader expects a base URL for `/session/*`. This can break uploads unless the user manually corrects it.
- **Fix:** Store a true API base in settings (e.g., `/api/v1`) and build all endpoints consistently.

### 2.5 `isStartingRecording` state is unused
- **Severity:** LOW
- **File:** `src/main/index.ts` / `ipc-handlers.ts`
- **Issue:** Renderer toggles `recording:set-starting`, but main process never reads it. Likely leftover or missing logic (e.g., suppress blur hiding).
- **Fix:** Remove or wire to the intended behavior.

### 2.6 Context watcher uses wrong base when chatApiUrl missing
- **Severity:** MEDIUM
- **File:** `src/main/ipc-handlers.ts`
- **Issue:** `contextWatcher.configure(settings.chatApiUrl || settings.cloudEndpoint, ...)`. If chatApiUrl is empty and cloudEndpoint is `/process-recording`, context link APIs are broken.
- **Fix:** Separate API base from upload endpoint; use API base for context/search.

### 2.7 Vision-support cache not reset on config changes
- **Severity:** LOW
- **File:** `src/main/chat.ts`
- **Issue:** `supportsVision` is cached and never reset when LLM settings change. Users who switch models may get incorrect support detection.
- **Fix:** Call `resetVisionDetection()` whenever LLM settings are saved.

### 2.8 No recovery after crash mid‑recording
- **Severity:** MEDIUM
- **File:** `src/main/recording.ts`
- **Issue:** If the app crashes mid-recording, steps and screenshots are lost; no recovery or resume flow.
- **Fix:** Persist step metadata periodically and on startup prompt to recover or delete.

### 2.9 IPC errors mostly surfaced in console only
- **Severity:** LOW
- **Files:** renderer components, `spotlight-entry.tsx`
- **Issue:** Many errors are logged but not shown to the user (e.g., failed upload, failed start).
- **Fix:** Use toasts or inline error states with retry actions.

---

## 3) Competitor Analysis & Missing Features

Compared to Scribe, Tango, Guidde, Loom, Notion, Whatfix, WalkMe, Ondoki is missing several table‑stakes features:

### Recording & Capture
- **Video capture (screen + webcam)** with optional audio.
- **Region selection** (freeform / rectangle), not just window or full display.
- **Multi‑monitor capture rules** (choose specific monitor set, per-step window focus).
- **Blur/redaction** of sensitive content (auto + manual).
- **Auto‑pause on idle** or sensitive app detection.

### Editing & Annotation
- **Step editor** (reorder, merge, delete, rename, add tips).
- **Annotation tools** (arrows, highlights, boxes) and screenshot cropping.
- **Template styles** (SOP, checklist, onboarding).
- **Versioning & approvals** (review flow, locked edits).

### AI Features
- **Auto‑summaries & titles per step** (already started but toggle bug).
- **AI cleanup** (remove redundant steps, group steps into sections).
- **AI rewrite into multiple formats** (SOP, onboarding, quickstart).
- **Multilingual output**.

### Sharing & Export
- **Export formats** (PDF, DOCX, HTML package, Markdown, Confluence/Notion).
- **Public share links** with access control (password, expiry).
- **Embeds** for knowledge bases and intranets.

### Integrations
- **Slack / Teams / Jira / Confluence** publishing.
- **Browser extension** for web-only workflows.
- **SSO / SCIM** for team management (enterprise).

### Product Infrastructure
- **Auto‑update mechanism** (electron-updater or Forge publisher + update UI).
- **Crash reporting** (Sentry, Bugsnag) + structured logs.
- **Analytics** (feature usage, retention).
- **Accessibility** (ARIA labels, keyboard nav beyond basics, screen reader support).

---

## 4) Code Quality & Maintainability

### 4.1 Duplicated logic between `recording.ts` and `recording-utils.ts`
- **Severity:** LOW
- **Issue:** Keycode maps and click description logic are duplicated. Tests cover utils, but production code uses its own copy.
- **Fix:** Import utils into `recording.ts` to keep logic consistent and tested.

### 4.2 Dead/unused IPC channels
- **Severity:** LOW
- **File:** `src/main/ipc-handlers.ts`, `src/main/preload.ts`
- **Issue:** Several context/clipboard/screenshot IPCs exist in the main process but are not exposed in preload (`context:add-manual`, `context:take-screenshot`, clipboard watching). Likely dead.
- **Fix:** Remove or expose via preload/UI if needed.

### 4.3 Scroll handling dead code
- **Severity:** LOW
- **File:** `src/main/recording.ts`
- **Issue:** `handleNativeScroll` exists but is never called (scroll events are ignored). If scroll steps are intended, this is a bug; if not, the code is dead.
- **Fix:** Either wire `scroll` events or delete the handler.

### 4.4 Missing strict IPC typings & validation
- **Severity:** MEDIUM
- **Files:** `ipc-handlers.ts`, `preload.ts`
- **Issue:** Many IPC payloads are `any`. No schema validation for inputs.
- **Fix:** Use zod/io-ts for IPC payloads and `strict` TypeScript typing.

### 4.5 Dependency bloat / heavy native deps
- **Severity:** LOW
- **File:** `package.json`
- **Issue:** `sharp` and `screenshot-desktop` are heavy native dependencies with potential cross‑platform issues.
- **Fix:** Audit usage, consider optional deps, or lazy-load.

---

## 5) General Observations

- **Network security defaults** use HTTP endpoints in settings (development-friendly but risky if shipped). Consider enforcing HTTPS for production builds.
- **Single preload for all windows** creates a large shared trust surface. Use minimal preloads per window.
- **No auto‑update** integration—users will stay on old builds.
- **No tests** for IPC security, auth flow, cloud upload, or recovery.

---

## Quick Priority Fixes (Suggested order)
1. **Enable sandbox** and remove `--no-sandbox` (HIGH)
2. **Lock down CSP** for renderer and data windows (HIGH)
3. **Reduce IPC exposure + add validation + sender checks** (HIGH)
4. **Encrypt and clean local artifacts** (HIGH)
5. **Fix cloud endpoint mismatch** (MEDIUM)
6. **Implement crash recovery + auto‑update** (MEDIUM)

---

If you want, I can draft a concrete hardening plan with minimal diffs (CSP, sandbox, IPC schema validation, cleanup + secure storage).