# ondoki-desktop-electron — Consolidated Issues

> Cross-referenced from 3 independent reviews (Opus, Codex, Gemini) — 2026-03-03
> ondoki: open-source process documentation platform (Scribe/Tango/Guidde competitor)

---

## CRITICAL

### 1. No Electron sandbox on BrowserWindows
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Files:** `src/main/index.ts` (all BrowserWindow constructors), `package.json` (`--no-sandbox` scripts)
- **Impact:** Renderer compromise gives Node.js access via preload. `--no-sandbox` disables Chromium sandbox.
- **Fix:** Add `sandbox: true` to all `webPreferences`. Remove `--no-sandbox` from scripts.

### 2. No Content Security Policy / permissive CSP
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Files:** `src/renderer/spotlight.html`, `src/renderer/settings.html`
- **Impact:** `unsafe-inline`, `unsafe-eval`, broad `connect-src`. XSS in renderer can execute arbitrary code.
- **Fix:** Remove `unsafe-inline`/`unsafe-eval`, use nonces. Restrict `connect-src` to known API origins.

### 3. No auto-update mechanism
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Impact:** Users must manually update. Security patches can't be pushed. Critical for any production desktop app.
- **Fix:** Integrate `electron-updater` or Forge publisher with `autoUpdater`.

---

## HIGH

### 4. Large IPC surface exposed via preload without validation
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Files:** `src/main/preload.ts` (~30 channels), `src/main/ipc-handlers.ts`
- **Impact:** Compromised renderer gets screenshots, clipboard, openExternal, uploads.
- **Fix:** Reduce surface, add input validation per channel, validate sender, per-window preloads.

### 5. WebSocket token in URL query parameter
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **File:** `src/main/auth.ts`
- **Fix:** Use subprotocol header or send token as first WS message.

### 6. Unencrypted screenshots + temp files at rest
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Files:** `src/main/recording.ts`, `src/main/screenshot.ts`, `src/main/cloud-upload.ts`
- **Impact:** Screenshots stored as plain files in temp dir. Not cleaned up after upload or on crash.
- **Fix:** Encrypt or restrict permissions (0o600), delete after upload, startup cleanup.

### 7. Token stored to user-configurable endpoint without validation
- **Confirmed by:** Opus ✅
- **File:** `src/main/auth.ts`
- **Impact:** User can set any API URL — token sent to arbitrary servers.
- **Fix:** Validate URL against allowlist or warn prominently for custom endpoints.

### 8. Refresh token storage fallback uses weak key
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **File:** `src/main/settings.ts` (lines ~78-87)
- **Fix:** Warn user when safeStorage unavailable. Refuse to store if no secure mechanism.

### 9. No logging / crash reporting
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Impact:** Only console.log. No persistent logs, no crash recovery diagnostics.
- **Fix:** Add `electron-log` + Sentry. "Send Diagnostics" toggle in settings.

### 10. No auto-save / crash recovery for recordings
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Impact:** Crash mid-recording = total data loss.
- **Fix:** Periodic state serialization. Recovery check on startup.

### 11. Recording start/stop race conditions
- **Confirmed by:** Opus ✅, Codex ✅
- **File:** `src/main/recording.ts`
- **Impact:** Rapid start/stop → overlapping sessions, orphaned processes.
- **Fix:** State machine with guards for transitions.

### 12. Keep-alive timer leak in WS reconnection
- **Confirmed by:** Opus ✅
- **File:** `src/main/auth.ts` (lines ~401-408)
- **Fix:** Store timer ID, clear on disconnect, use `setInterval`.

### 13. Access token expiry not tracked
- **Confirmed by:** Opus ✅
- **File:** `src/main/auth.ts`
- **Fix:** Track `expires_in`, implement proactive refresh.

### 14. Temp screenshots never cleaned up
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Files:** `src/main/recording.ts`, `src/main/screenshot.ts`
- **Fix:** Delete after upload. Cleanup stale dirs on startup.

---

## MEDIUM — Security

### 15. Deep link handler (ondoki://) insufficient validation
- **Confirmed by:** Opus ✅, Codex ✅
- **File:** `src/main/index.ts` (lines ~884-901)
- **Fix:** Strict URL validation, don't log auth codes.

### 16. `shell.openExternal` without URL scheme validation
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Fix:** Only allow `https:` and `http:`. Block `file:`, `javascript:`.

### 17. Inline JSON injection in picker HTML
- **Confirmed by:** Codex ✅
- **File:** `src/main/index.ts` (lines ~578-652)
- **Fix:** Escape `</script>`, use IPC for data transfer.

### 18. Clipboard access exposed to renderer
- **Confirmed by:** Codex ✅
- **File:** `src/main/ipc-handlers.ts` (lines ~378-387)

### 19. Console logging of sensitive data
- **Confirmed by:** Opus ✅, Gemini ✅
- **Fix:** Structured logger with levels. Redact PII at INFO.

### 20. Picker window uses data: URL (CSP bypass)
- **Confirmed by:** Opus ✅, Gemini ✅
- **Fix:** Use dedicated HTML file.

---

## MEDIUM — Bugs

### 21. Auto-annotation ignores user setting
- **Confirmed by:** Codex ✅, Gemini ✅
- **File:** `src/main/ipc-handlers.ts` (lines ~82-109)
- **Fix:** Check `settings.autoAnnotateSteps` before invoking.

### 22. Native hooks timeout doesn't kill spawned process
- **Confirmed by:** Codex ✅
- **File:** `src/main/recording.ts` (lines ~344-349)

### 23. No upload timeout — fetch hangs indefinitely
- **Confirmed by:** Opus ✅
- **File:** `src/main/cloud-upload.ts`
- **Fix:** Add `AbortSignal.timeout()`.

### 24. Event listener leak on ChatService
- **Confirmed by:** Opus ✅
- **File:** `src/main/guide-generation.ts` (lines ~73-102)

### 25. No graceful shutdown — active recordings lost on quit
- **Confirmed by:** Opus ✅
- **Fix:** Shutdown sequence: stop recordings, save state, clean temp, close WS.

### 26. WS reconnection bugs (no backoff, isReconnecting not reset)
- **Confirmed by:** Opus ✅
- **File:** `src/main/auth.ts`

### 27. Cloud endpoint mismatch (defaults vs uploader expectations)
- **Confirmed by:** Gemini ✅
- **Fix:** Align default endpoint paths.

### 28. Context watcher base URL broken if chatApiUrl missing
- **Confirmed by:** Gemini ✅

### 29. Vision-support cache not reset on settings change
- **Confirmed by:** Gemini ✅

---

## MEDIUM — Missing Features (vs Scribe/Tango/Guidde/Loom)

### 30. No video + audio recording (only screenshots)
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Impact:** Guidde/Loom offer video. Some workflows need video explanation.

### 31. No screenshot annotation / markup tools
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Impact:** Tango/Loom offer in-app annotation. Steps need callouts, arrows, highlights.

### 32. No step editing in desktop app (reorder, edit description, crop)
- **Confirmed by:** Opus ✅, Codex ✅
- **Impact:** Scribe/Tango allow full editing before publishing.

### 33. No auto-redaction / PII blur for screenshots
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Impact:** Scribe offers automatic PII detection. Critical for enterprise workflows.

### 34. No export formats (PDF, Markdown, ZIP)
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

### 35. No integrations (Slack, Teams, Jira, Confluence)
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

### 36. No multi-monitor / region selection capture
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

### 37. Limited keyboard shortcuts / accessibility
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Fix:** ARIA labels, keyboard nav, WCAG 2.1 basics.

### 38. No onboarding flow
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

---

## MEDIUM — Code Quality

### 39. Test coverage ~0-15% — no tests for auth, IPC, upload, renderer
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

### 40. `any` type abuse throughout
- **Confirmed by:** Opus ✅, Gemini ✅
- **Files:** smart-annotation.ts, guide-generation.ts, settings.ts, recording.ts

### 41. Duplicated logic: recording.ts vs recording-utils.ts
- **Confirmed by:** Gemini ✅

### 42. Duplicated BrowserWindow creation
- **Confirmed by:** Opus ✅
- **Fix:** Extract `createWindow(opts)` helper.

---

## LOW

### 43. Unused queue logic in SmartAnnotationService
### 44. `isStartingRecording` set but never used
### 45. Unused clipboard watching variables
### 46. Dead IPC handlers not exposed in preload
### 47. Unused `groupStepsByContext` result
### 48. Unused `ws` dependency in package.json
### 49. Default endpoints point to localhost (no env detection)
### 50. No telemetry / analytics (opt-in)

---

## Ondoki Desktop Strengths (noted by reviewers)
- ✅ Proper context isolation + nodeIntegration disabled
- ✅ PKCE OAuth with CSRF state protection
- ✅ Settings encryption via OS keyring (safeStorage)
- ✅ Excellent test coverage on recording-utils
- ✅ Upload retry with backoff
- ✅ Native binary watcher with restart + backoff
- ✅ Pre-click screenshots (captures state before action)
- ✅ Context watcher for rich step metadata
- ✅ AI chat integration for guide generation
