# Ondoki Desktop Electron — Comprehensive Code Review

**Date:** 2026-03-03  
**Reviewer:** Automated (Claude Opus)  
**Codebase:** ~9K lines, 34 files under `src/`  
**Electron:** v30 | **Node:** v20+ | **Build:** Electron Forge + Webpack

---

## Executive Summary

Ondoki Desktop is a well-structured Electron app for recording user workflows into step-by-step guides. The architecture is clean—proper context isolation, typed preload bridge, native binary integration for accessibility data. However, there are **critical security gaps** (no CSP, token storage issues, unvalidated deep links), **production bugs** (memory leaks, race conditions), and **significant feature gaps** vs competitors. The codebase is early-stage but has a solid foundation.

---

## 1. Security Issues

### SEC-01: No Content Security Policy (CSP)
**Severity: CRITICAL**  
**Files:** `src/main/index.ts` (all BrowserWindow creation)  
**Lines:** ~170-185 (createSpotlightWindow), ~235 (createSettingsWindow), ~280+ (createPickerWindow), ~155 (countdownWindow)

No CSP headers or meta tags are set on any window. The picker and countdown windows use inline `<script>` tags via `data:` URLs. An XSS in the renderer could execute arbitrary code with full preload API access.

**Fix:** Set CSP via `session.defaultSession.webRequest.onHeadersReceived` or use `<meta>` tags. At minimum:
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*
```
For the `data:` URL windows (picker, countdown), consider loading from file instead.

### SEC-02: Deep Link URL Not Validated
**Severity: CRITICAL**  
**File:** `src/main/index.ts`  
**Lines:** ~480-495 (`handleProtocolUrl`)

The `ondoki://` protocol handler only checks for `ondoki://auth/callback` prefix, then passes the full URL to `authService.handleCallback()`. There's no origin validation, URL sanitization, or allowlist check.

**Fix:** Parse the URL, validate the hostname/path against expected values, strip unexpected query parameters. Reject anything that doesn't match `ondoki://auth/callback?code=...&state=...`.

### SEC-03: Auth Token Stored via electron-store (Unencrypted)
**Severity: HIGH**  
**File:** `src/main/auth.ts`  
**Lines:** Throughout (uses `electron-store` for token persistence)

Tokens are stored in a JSON file on disk without encryption. On macOS, should use Keychain (`keytar` or `safeStorage`). On Windows, should use DPAPI via `safeStorage.encryptString()`.

**Fix:** Use `electron.safeStorage.encryptString()` / `decryptString()` for token storage, or use the `keytar` package for OS keychain integration.

### SEC-04: API Keys Stored in Settings File (Plaintext)
**Severity: HIGH**  
**File:** `src/main/settings.ts`  
**Lines:** Settings include `apiKey`, `llmApiKey` stored via electron-store

LLM API keys and other secrets are stored alongside regular settings in plaintext JSON.

**Fix:** Separate sensitive values and encrypt them with `safeStorage`.

### SEC-05: Bearer Token Sent to User-Configurable Endpoints
**Severity: HIGH**  
**Files:** `src/main/ipc-handlers.ts`, `src/main/cloud-upload.ts`, `src/main/context-watcher.ts`  
**Lines:** All API calls use `settings.cloudEndpoint` or `settings.chatApiUrl`

Users can change the cloud endpoint in settings. The bearer token is then sent to whatever URL is configured. A malicious settings change (or settings file tamper) could exfiltrate tokens.

**Fix:** Pin the auth token to specific trusted domains. Validate that `cloudEndpoint` / `chatApiUrl` match an allowlist before sending tokens.

### SEC-06: `shell.openExternal()` with Dynamic URLs
**Severity: MEDIUM**  
**File:** `src/main/ipc-handlers.ts`  
**Lines:** ~105 (`shell.openExternal(result.url)`), ~110 (constructed URL from `frontendUrl`), utility handler

URLs from API responses and user-configurable `frontendUrl` are passed directly to `shell.openExternal()`, which can open arbitrary protocols.

**Fix:** Validate URLs are `https://` before passing to `shell.openExternal()`.

### SEC-07: Picker Window Loads External Font (CDN)
**Severity: MEDIUM**  
**File:** `src/main/index.ts`  
**Lines:** `generatePickerHtml()` — `@import url('https://fonts.googleapis.com/css2?...')`

The picker window imports Google Fonts via external CDN. This leaks the user's IP to Google during every picker open, and the external resource could theoretically be compromised.

**Fix:** Bundle fonts locally or use system fonts.

### SEC-08: Preload Exposes Broad IPC Surface
**Severity: MEDIUM**  
**File:** `src/main/preload.ts`  
**Lines:** Entire file (~200 lines)

The preload bridge exposes ~40+ methods to the renderer. While context isolation is correctly enabled, the attack surface is large. Methods like `openExternal`, `saveSettings`, `contextTakeScreenshot` could be abused if the renderer is compromised.

**Fix:** Audit each exposed method. Consider reducing surface area—e.g., remove `contextTakeScreenshot` from the preload if not used by the renderer. Add input validation on the main process side for all IPC handlers.

### SEC-09: No Sandbox Enabled
**Severity: MEDIUM**  
**File:** `src/main/index.ts`  
**Lines:** All `BrowserWindow` `webPreferences`

`sandbox: true` is not explicitly set on any BrowserWindow. While `contextIsolation: true` and `nodeIntegration: false` are correctly set, the sandbox provides additional OS-level isolation.

**Fix:** Add `sandbox: true` to all BrowserWindow webPreferences (test for compatibility with preload).

### SEC-10: No Certificate Pinning or TLS Validation
**Severity: LOW**  
**Files:** All files using `fetch()`

No custom certificate validation. Standard Node.js TLS is used, which is fine for most cases, but for a security-sensitive app handling auth tokens, certificate pinning would be beneficial.

---

## 2. Production Bugs

### BUG-01: Screenshot Temp Files Never Cleaned Up
**Severity: HIGH**  
**File:** `src/main/recording.ts`  
**Lines:** ~235 (`screenshotFolder = path.join(os.tmpdir(), 'Ondoki', sessionId)`)

Screenshots are written to temp directory but never cleaned up after upload. Each recording session creates a new folder with potentially dozens of PNG files (each 1-5MB). Over time, this consumes significant disk space.

**Fix:** Clean up `screenshotFolder` after successful upload in `ipc-handlers.ts` (after `upload:complete`). Also clean up on app exit and on startup (stale sessions).

### BUG-02: Memory Leak in `pendingElementSupplements` Map
**Severity: HIGH**  
**File:** `src/main/recording.ts`  
**Lines:** ~338 (`pendingElementSupplements`)

The 5-second auto-expiry timeout in `handleNativeEvent` prevents unbounded growth, but during rapid clicking (e.g., UI testing), many timers accumulate. More critically, if the recording is stopped while timers are pending, they continue firing on a disposed service.

**Fix:** Clear all pending supplements and their timers in `dispose()`. Use a single cleanup interval instead of per-entry `setTimeout`.

### BUG-03: Race Condition — Recording Stop During Click Processing
**Severity: HIGH**  
**File:** `src/main/recording.ts`  
**Lines:** ~370 (`processClick` / `_processClickInner`)

If `stopRecording()` is called while `_processClickInner` is awaiting a screenshot, the screenshot service may be accessed after disposal. The `clickQueue` may also still have entries.

**Fix:** Add a guard check `if (!this.isRecording) return;` at the start of `_processClickInner` and after each `await`. Clear the click queue in `stopRecording()`.

### BUG-04: Window Tracking Interval Leak
**Severity: MEDIUM**  
**File:** `src/main/recording.ts`  
**Lines:** ~680 (`startWindowTracking`)

The `setInterval` for overlay window tracking is only cleared when the callback detects recording has stopped. If `hideOverlay()` destroys the window but the interval fires before the next check, it will throw. The interval handle is not stored for cleanup.

**Fix:** Store the interval ID and clear it explicitly in `hideOverlay()` and `dispose()`.

### BUG-05: Native Subprocess Not Killed on App Crash
**Severity: MEDIUM**  
**Files:** `src/main/recording.ts`, `src/main/screenshot.ts`, `src/main/context-watcher.ts`

Three separate native subprocesses can be spawned (hooks, serve, watch). If the Electron app crashes (not clean exit), these orphaned processes continue running. The `before-quit` handler in `ipc-handlers.ts` calls `dispose()`, but this doesn't fire on crashes.

**Fix:** Use `process.on('exit')` (synchronous) to kill child processes. Consider process groups or writing PID files for cleanup on next launch.

### BUG-06: `uploadRecording` Parameter Order Mismatch
**Severity: MEDIUM**  
**File:** `src/main/ipc-handlers.ts`  
**Lines:** ~220 (cloud:upload handler)

```typescript
// IPC handler receives: (steps, projectId, userId)
ipcMain.handle('cloud:upload', async (event, steps, projectId, userId) => {
  // But calls: uploadRecording(steps, userId, projectId)
  return await cloudUploadService.uploadRecording(steps, userId, projectId);
```

The `uploadRecording` method signature is `(steps, userId, projectId, workflowTitle?)` — so `userId` and `projectId` are swapped compared to the IPC call. The auto-upload in `recording:stop` passes them correctly, but the manual `cloud:upload` handler swaps them.

**Fix:** Align parameter order: change the IPC handler to `uploadRecording(steps, userId, projectId)` with correct parameter mapping.

### BUG-07: `electron-store` Import at Runtime
**Severity: MEDIUM**  
**File:** `src/main/settings.ts`, `src/main/auth.ts`

`electron-store` v8 is an ESM-only package. Using it with CommonJS (which Electron main process typically is) can cause runtime import failures depending on the bundler configuration.

**Fix:** Verify the Webpack/Forge config handles ESM→CJS interop correctly. Consider pinning to `electron-store@^6` (last CJS version) or using dynamic `import()`.

### BUG-08: `uncaughtException` Handler Doesn't Exit
**Severity: MEDIUM**  
**File:** `src/main/index.ts`  
**Lines:** ~500-505

The `uncaughtException` handler only logs the error but doesn't exit. After an uncaught exception, Node.js is in an undefined state. Continuing can cause data corruption or silent failures.

**Fix:** Log, attempt cleanup (kill native processes), then `process.exit(1)`.

### BUG-09: No Timeout on `fetch()` Calls (Cloud Upload)
**Severity: MEDIUM**  
**File:** `src/main/cloud-upload.ts`  
**Lines:** All `fetch()` calls

Upload `fetch()` calls have no timeout/AbortController. A hung server connection will block the upload indefinitely, leaving the app in an "uploading" state.

**Fix:** Add `AbortSignal.timeout(30000)` to all fetch calls, with longer timeout for image uploads proportional to file size.

### BUG-10: `desktopCapturer.getSources()` Called During Recording
**Severity: LOW**  
**File:** `src/main/screenshot.ts`  
**Lines:** `takeScreenshotNative()` (~line 290)

`desktopCapturer.getSources()` is an expensive async call that briefly pauses the renderer. During active recording, this is called for every click event. On slower machines or with many windows, this can cause noticeable lag.

**Fix:** Cache the source matching for the duration of a recording session. Only re-query if the display configuration changes.

---

## 3. Competitor Analysis & Missing Features

### Feature Matrix

| Feature | Ondoki | Scribe | Tango | Guidde | Loom | WalkMe | Whatfix |
|---------|--------|--------|-------|--------|------|--------|---------|
| Screenshot capture | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Video capture | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Click annotation | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| AI step titles | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Multi-monitor | ✅ | ✅ | ✅ | ❓ | ✅ | ❌ | ❌ |
| Selective capture | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Step editing | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Screenshot editing/annotation | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Blur/redact PII | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Export: PDF | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Export: Markdown | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Export: HTML | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Export: Confluence/Notion | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Browser extension | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auto-update | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Offline mode | Partial | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Team sharing | Cloud only | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Analytics/views | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Interactive walkthroughs | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Context-aware suggestions | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| AI chat about docs | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### FEAT-01: No Step Editing or Reordering
**Severity: HIGH**  
**Impact:** Users cannot fix mistakes, remove sensitive steps, or reorder after recording.

All competitors allow post-recording editing. This is table-stakes for any documentation tool.

**Fix:** Add a review/edit screen after recording stops but before upload. Allow reorder, delete, edit title/description, and re-crop screenshots.

### FEAT-02: No Screenshot Annotation/Editing
**Severity: HIGH**  
**Impact:** Users cannot add arrows, highlights, blur areas, or crop screenshots.

Scribe and Tango both offer rich screenshot annotation. This is essential for professional documentation.

### FEAT-03: No PII Blur/Redaction
**Severity: HIGH**  
**Impact:** Users recording internal tools may capture sensitive data (emails, names, financial data). No way to redact before sharing.

### FEAT-04: No Export Formats (PDF, Markdown, HTML, Confluence)
**Severity: HIGH**  
**Impact:** Guides are locked into the Ondoki cloud platform. No way to export for offline use, embed in wikis, or share with non-Ondoki users.

### FEAT-05: No Auto-Update Mechanism
**Severity: HIGH**  
**File:** `package.json`

No `electron-updater`, `@electron-forge/publisher-*`, or `autoUpdater` integration. Users must manually download updates.

**Fix:** Integrate `electron-updater` with GitHub Releases or a custom update server.

### FEAT-06: No Browser Extension
**Severity: MEDIUM**  
**Impact:** Desktop app can capture any application, but a Chrome/Firefox extension would provide richer web-specific data (URL, DOM elements, form fields) and reach users who can't install desktop apps.

### FEAT-07: No Video Recording
**Severity: MEDIUM**  
**Impact:** Guidde and Loom offer video capture alongside step-by-step guides. Some workflows are better explained with video.

### FEAT-08: No Accessibility Features
**Severity: MEDIUM**  
**Impact:** No keyboard navigation in the UI, no screen reader labels, no high-contrast mode.

### FEAT-09: No Onboarding/Tutorial
**Severity: LOW**  
**Impact:** New users see the spotlight UI with no guidance on how to start recording.

### FEAT-10: No Usage Analytics
**Severity: LOW**  
**Impact:** No way to track guide views, completion rates, or most-viewed steps.

---

## 4. Code Quality

### CQ-01: No Test Suite
**Severity: HIGH**  
**Files:** `package.json` has `vitest` and `@vitest/coverage-v8` in devDeps

Vitest is installed but there are zero test files. No unit tests, integration tests, or E2E tests.

**Fix:** Add tests for at minimum: `RecordingService` (event handling, state machine), `CloudUploadService` (retry logic), `AuthService` (token refresh), `SmartAnnotationService` (prompt building, response parsing), `ScreenshotService` (coordinate transforms).

### CQ-02: Dead Code — `SmartAnnotationService.annotationQueue` and `pendingCount`
**Severity: LOW**  
**File:** `src/main/smart-annotation.ts`  
**Lines:** ~8-9, ~80-87

`annotationQueue` and `pendingCount` are declared and manipulated in `clearQueue()` and `getPendingCount()` but never actually used by any code path. The service only uses `annotateWorkflow()` which doesn't touch the queue.

**Fix:** Remove dead queue/pending logic or implement queued per-step annotation.

### CQ-03: Dead Code — `handleNativeScroll` Method
**Severity: LOW**  
**File:** `src/main/recording.ts`  
**Lines:** ~485-520

The `handleNativeScroll` method exists but is never called — the `switch` in `handleNativeEvent` has a comment "Scroll events are intentionally not tracked" and returns without calling it.

**Fix:** Remove the dead method or wire it up behind a setting.

### CQ-04: Dead Code — `clipboardWatchingEnabled` / `lastClipboardText`
**Severity: LOW**  
**File:** `src/main/ipc-handlers.ts`  
**Lines:** ~180-182, ~255-260

Variables declared and set but never read/used by any polling logic.

### CQ-05: Duplicated Type Definitions
**Severity: MEDIUM**  
**Files:** `src/main/preload.ts`, `src/main/recording.ts`, `src/main/screenshot.ts`

`CaptureArea`, `Rectangle`, `RecordedStep`, `RecordingState` are defined independently in multiple files with slight variations.

**Fix:** Create a shared `src/shared/types.ts` and import everywhere.

### CQ-06: Excessive `console.log` — DIAG Logs Left In
**Severity: LOW**  
**Files:** `src/main/recording.ts`, `src/main/screenshot.ts`

Many `[DIAG]` debug log lines throughout. These should be behind a debug flag or removed for production builds.

**Fix:** Use a logging utility with log levels. Strip debug logs in production builds.

### CQ-07: Large Inline HTML Strings
**Severity: LOW**  
**File:** `src/main/index.ts`  
**Lines:** `generatePickerHtml()` (~150 lines of HTML), countdown overlay (~30 lines)

Significant HTML/CSS/JS is inline as template strings in the main process. Hard to maintain and no syntax highlighting.

**Fix:** Move to separate `.html` files and load with `loadFile()`.

### CQ-08: No ESLint/TypeScript Strict Mode
**Severity: LOW**  
**File:** `tsconfig.json` (not checked but worth noting)

Many `any` types throughout: `steps: any[]`, `event: any`, `data: any`. The code would benefit from stricter TypeScript settings (`strict: true`, `noImplicitAny`).

### CQ-09: `ws` Dependency Unused
**Severity: LOW**  
**File:** `package.json`

`ws` (WebSocket) is listed as a production dependency but is not imported anywhere in the codebase.

**Fix:** Remove from `dependencies`.

### CQ-10: Architecture — God Class `OndokiApp`
**Severity: LOW**  
**File:** `src/main/index.ts`  
**Lines:** Entire file (~500 lines)

`OndokiApp` handles window management, tray, shortcuts, IPC setup, protocol handling, overlay generation, and picker HTML generation. Should be split into focused modules.

---

## 5. General Observations

### Strengths
1. **Proper Electron security basics** — `contextIsolation: true`, `nodeIntegration: false` on all windows
2. **Typed preload bridge** — Clean typed API between main and renderer
3. **Native binary integration** — Smart architecture using Swift (macOS) and .NET (Windows) for accessibility data, with persistent subprocess mode and fallback to one-shot
4. **Multi-monitor support** — Handles mixed DPI, physical→logical coordinate conversion
5. **Pre-click screenshot capture** — Captures screen state at click time (before UI changes), matching Scribe/Tango behavior
6. **Context watcher** — Unique feature that suggests relevant docs based on active window. Not seen in most competitors
7. **AI chat integration** — Built-in LLM chat about documentation is a differentiator
8. **Cloud upload with retry + local fallback** — Graceful degradation when upload fails
9. **Window/display capture picker** — Live-updating thumbnails, clean UI

### Weaknesses
1. **No tests** — Zero test coverage for a complex event-driven system
2. **No CSP** — Biggest security gap
3. **No step editing** — Biggest feature gap vs competitors
4. **No export formats** — Locks users into Ondoki platform
5. **No auto-update** — Critical for desktop app distribution
6. **Temp file accumulation** — Will fill user's disk over time

### Recommendations (Priority Order)
1. **Immediate:** Add CSP, validate deep link URLs, fix parameter order bug (BUG-06)
2. **Short-term:** Add temp file cleanup, fix race conditions, encrypt stored tokens
3. **Medium-term:** Add step editing/review screen, export to PDF/Markdown, auto-update
4. **Long-term:** Browser extension, video recording, annotation tools, test suite

---

*End of review.*
