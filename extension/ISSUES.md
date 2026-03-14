# ondoki-plugin-chrome — Consolidated Issues

> Cross-referenced from 3 independent reviews (Opus, Codex, Gemini) — 2026-03-03
> ondoki: open-source process documentation platform (Scribe/Tango/Guidde competitor)

---

## CRITICAL

### 1. Default API URL is HTTP — tokens/data sent in cleartext
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **File:** `background.js` line 1
- **Fix:** Default to `https://app.ondoki.com/api/v1`. Reject HTTP for non-localhost in settings.

---

## HIGH

### 2. `<all_urls>` host permission — overly broad
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **File:** `manifest.json` line 14
- **Fix:** Use `activeTab` + `optional_host_permissions`. Request on recording start.

### 3. Keystroke capture too broad — captures sensitive fields
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **File:** `content.js` lines ~229-272
- **Impact:** Captures all text except password/CC. Misses SSN, 2FA, search on sensitive sites.
- **Fix:** Broaden sensitive detection. Default text capture OFF. Domain blocklist.

### 4. Screenshots on all sites without consent/redaction
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Fix:** Per-site consent, domain allowlist, auto-redaction/blur option.

### 5. Service worker termination loses pause state + PKCE state
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **File:** `background.js` lines 29-35
- **Fix:** Persist `isPaused`. Use `chrome.storage.session` for PKCE.

### 6. Pause doesn't stop content scripts from capturing
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Files:** `background.js`, `content.js`
- **Fix:** Broadcast `PAUSE_RECORDING` to all tabs. Stop listeners in content.js.

### 7. `RESUME_RECORDING` not handled in content.js
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Impact:** After pause+resume, content scripts stay paused. Recording silently broken.
- **Fix:** Add handler that sets `isRecording = true` and reattaches listeners.

### 8. No offline handling — network errors clear auth state
- **Confirmed by:** Opus ✅
- **Impact:** Any fetch error triggers full logout.
- **Fix:** Check `navigator.onLine`. Queue uploads. Only clear auth on 401/403.

### 9. Async sendResponse — port closes on long operations
- **Confirmed by:** Opus ✅, Codex ✅
- **Fix:** Immediate ack, results via separate message.

---

## MEDIUM — Security

### 10. Tokens stored unencrypted in chrome.storage.local
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Fix:** Access token in `chrome.storage.session`. Only persist refresh token.

### 11. Screenshots as data URLs — unencrypted on disk
- **Confirmed by:** Opus ✅, Codex ✅
- **Fix:** Don't persist. Upload immediately or keep in-memory.

### 12. No message origin validation on runtime.onMessage
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Fix:** Validate `sender.tab` vs `!sender.tab`.

### 13. No session timeout / auto-lock
- **Confirmed by:** Opus ✅
- **Fix:** Configurable inactivity timeout.

---

## MEDIUM — Bugs

### 14. Dock "Complete" clears steps even on upload failure
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Fix:** Don't clear on failure. Show error state.

### 15. Double-click detection — screenshot timing mismatch
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Fix:** Capture on mousedown, attach when click resolves.

### 16. `lastTrackedPage` global — breaks multi-window
- **Confirmed by:** Opus ✅, Codex ✅
- **Fix:** Track per-window.

### 17. Step renumbering after delete — UI desync
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Fix:** UUID-based step IDs, display from array position.

### 18. Storage quota risk for screenshots
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Fix:** IndexedDB, in-memory, or `unlimitedStorage`.

### 19. SW restart doesn't re-inject existing tabs
- **Confirmed by:** Gemini ✅
- **Fix:** Re-broadcast state to open tabs after restore.

### 20. Dock UI doesn't update on pause/resume
- **Confirmed by:** Gemini ✅

### 21. Fake upload progress bar
- **Confirmed by:** Opus ✅, Codex ✅

---

## MEDIUM — Missing Features (vs Scribe/Tango/Guidde/Loom)

### 22. No smart step detection / grouping
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Impact:** Raw clicks → verbose guides (20+ steps vs 5-6 in competitors).
- **Fix:** Heuristic step merging (click→select, rapid clicks, form fills).

### 23. No auto-redaction / PII blur
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Impact:** Critical for enterprise adoption.

### 24. No video recording option
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

### 25. No instant sharing (upload-only workflow)
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Fix:** Generate shareable link immediately after upload.

### 26. No step editing before upload (only delete)
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Fix:** Inline edit descriptions, reorder, add manual steps.

### 27. No interactive guide playback
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

### 28. No keyboard shortcuts
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **Fix:** Add `commands` to manifest.json.

### 29. No local export (PDF/ZIP/JSON)
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

### 30. No domain allowlist / per-site settings
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

### 31. No team/workspace switcher
- **Confirmed by:** Opus ✅, Codex ✅

### 32. No onboarding / consent flow
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

### 33. No recording indicator in sidepanel mode
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

---

## MEDIUM — Code Quality

### 34. `drawClickMarker` — 44 lines of dead code
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅
- **File:** `background.js` lines 253-296

### 35. Duplicated upload logic (popup.js vs sidepanel.js)
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

### 36. Inconsistent error handling — silent failures
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

### 37. No automated tests
- **Confirmed by:** Opus ✅, Codex ✅, Gemini ✅

### 38. No build step / linting / TypeScript
- **Confirmed by:** Opus ✅

---

## LOW

### 39. `preventDoubleCapture` is a no-op
### 40. JSX syntax in popup.html (invalid HTML)
### 41. Google Fonts loaded remotely
### 42. Magic numbers scattered (no config)
### 43. No i18n support
### 44. No telemetry / error reporting
### 45. Unused preview panel in popup
### 46. Logout doesn't retry server-side revocation
### 47. No undo/redo during recording

---

## Ondoki Chrome Extension Strengths (noted by reviewers)
- ✅ Clean MV3 architecture
- ✅ PKCE OAuth correctly implemented
- ✅ Good SW lifecycle handling (persistence + auth restore)
- ✅ Dual-mode UI (sidepanel + dock) — nice UX
- ✅ Shadow DOM isolation for dock overlay
- ✅ Open source + self-hostable — unique differentiator
- ✅ Pre-click screenshots (captures before action)

---

## Competitor Feature Gap Matrix

| Feature | Scribe | Tango | Guidde | Loom | Ondoki |
|---------|--------|-------|--------|------|--------|
| Smart step detection | ✅ | ✅ | ✅ | — | ❌ |
| Auto-redaction / blur | ✅ | ✅ | ❌ | ❌ | ❌ |
| Video recording | ❌ | ❌ | ✅ | ✅ | ❌ |
| Instant sharing | ✅ | ✅ | ✅ | ✅ | ❌ |
| Step editing | ✅ | ✅ | ✅ | — | ⚠️ delete only |
| Interactive playback | ✅ | ✅ | ✅ | ❌ | ❌ |
| Keyboard shortcuts | ✅ | ✅ | ✅ | ✅ | ❌ |
| Export (PDF/MD) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Domain allowlist | ✅ | ✅ | — | — | ❌ |
| Undo/redo | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Open source** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Self-hostable** | ❌ | ❌ | ❌ | ❌ | ✅ |
