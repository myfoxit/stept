# Audit: Chrome Extension & Desktop Electron App

**Date:** 2026-03-14  
**Scope:** `extension/` and `desktop/` directories  
**Auditor:** Automated (subagent)

---

## Critical

### C1. Build-Breaking Import: `SteptLogo` vs `OndokiLogo.tsx`

**Files:**
- `desktop/src/renderer/components/spotlight/OndokiLogo.tsx` (line 3: exports `SteptLogo`)
- `desktop/src/renderer/spotlight-entry.tsx` (line 5: `import { SteptLogo } from './components/spotlight/SteptLogo'`)
- `desktop/src/renderer/components/spotlight/Footer.tsx` (line 2: `import { SteptLogo } from './SteptLogo'`)
- `desktop/src/renderer/components/spotlight/SpotlightHeader.tsx` (line 3: `import { SteptLogo } from './SteptLogo'`)

**Issue:** Three files import from `./SteptLogo` but the actual file is named `OndokiLogo.tsx`. There is no `SteptLogo.tsx` file. This will break the webpack build on case-sensitive filesystems (Linux CI/CD). On macOS it may work if the filesystem is case-insensitive, but it's unreliable.

**Fix:** Rename `OndokiLogo.tsx` → `SteptLogo.tsx`. This also removes the last old-name artifact from the codebase.

---

### C2. Old Repository References in `forge.config.js` and `package.json`

**Files:**
- `desktop/forge.config.js` (lines 39, 49): `homepage: 'https://github.com/myfoxit/stept-desktop-electron'`
- `desktop/forge.config.js` (lines 73–74): `owner: 'myfoxit', name: 'stept-desktop-electron'` (GitHub publisher config)
- `desktop/package.json` (line 7): `"homepage": "https://github.com/myfoxit/stept-desktop"`
- `desktop/package.json` (line 10): `"url": "https://github.com/myfoxit/stept-desktop.git"`
- `desktop/package.json` (line 86): `"appId": "com.myfoxit.stept-desktop"`

**Issue:** These reference the old separate `stept-desktop-electron` repo and the `myfoxit` GitHub org. The publisher config will attempt to publish releases to a repo that may not exist in the monorepo context. The `appId` uses `com.myfoxit` which may not be the intended open-source identity.

**Fix:** Update all URLs to the monorepo location (`stept`). Update `appId` to the project's own domain (e.g., `ai.stept.desktop`). Update publisher config to match.

---

### C3. `desktop/package.json` Author/Maintainer: `MyFoxIT`

**Files:**
- `desktop/package.json` (lines 13–14): `"name": "MyFoxIT", "email": "contact@myfoxit.com"`
- `desktop/forge.config.js` (lines 38, 48): `maintainer: 'MyFoxIT'`

**Issue:** The author and maintainer reference `MyFoxIT` / `contact@myfoxit.com` — an organization/brand name that may not be the intended attribution for an open-source release under the "Stept" brand.

**Fix:** Update to the correct open-source project author/org name and email.

---

## High

### H1. Hardcoded `localhost` Default URLs Throughout Codebase

**Files & Lines:**
- `extension/background.js` (line 8): `defaultApiUrl: 'http://localhost:8000/api/v1'`
- `extension/manifest.json` (line 16): `"http://localhost:8000/*"` in `host_permissions`
- `extension/sidepanel.js` (line 722): fallback `'http://localhost:8000/api/v1'`
- `extension/popup.html` (line 118): placeholder `http://localhost:5173`
- `extension/sidepanel.html` (line 186): placeholder `http://localhost:5173`
- `desktop/src/main/settings.ts` (line 40): `cloudEndpoint: 'http://localhost:8000/api/v1/process-recording'`
- `desktop/src/main/settings.ts` (line 41): `chatApiUrl: 'http://localhost:8000/api/v1'`
- `desktop/src/main/settings.ts` (line 49): `frontendUrl: 'http://localhost:5173'`
- `desktop/src/main/auth.ts` (line 55): fallback `'http://localhost:8000/api/v1'`
- `desktop/src/main/chat.ts` (line 56): fallback `'http://localhost:8000/api/v1'`
- `desktop/src/main/chat.ts` (line 158): `'http://localhost:11434'` (Ollama)
- `desktop/src/main/index.ts` (line 865): fallback `'http://localhost:5173'`
- `desktop/src/main/ipc-handlers.ts` (line 300): fallback `'http://localhost:8000/api/v1'`
- `desktop/src/main/ipc-handlers.ts` (line 362): fallback `'http://localhost:5173'`
- `desktop/src/renderer/spotlight-entry.tsx` (line 276): fallback `'http://localhost:5173'`
- `desktop/src/renderer/components/SettingsWindow.tsx` (lines 179, 187): placeholders

**Issue:** For self-hosted mode these defaults are intentional, but for a Chrome Web Store or production build, defaulting to `localhost` URLs means the app won't work out-of-the-box. The fallback chain means even when a user sets a production URL, any code path that hits a fallback silently reverts to localhost.

**Fix:**
1. Centralize all URL defaults into a single config file/module (one for extension, one for desktop).
2. For production/cloud builds, set defaults to `https://app.stept.ai/api/v1` and `https://app.stept.ai`.
3. Use environment variables or build-time constants to switch defaults.
4. For extension: the `build.sh` already patches for `store` mode — ensure **all** JS files are patched, not just `background.js`.

---

### H2. `cloudEndpoint` Default Includes Path Suffix `/process-recording`

**File:** `desktop/src/main/settings.ts` (line 40)
```
cloudEndpoint: 'http://localhost:8000/api/v1/process-recording'
```

**Issue:** The `cloudEndpoint` default includes `/process-recording` as a path suffix, but `cloud-upload.ts` appends additional path segments like `/session/create`, `/session/{id}/image`, etc. to this base URL. This means the effective URLs become `http://localhost:8000/api/v1/process-recording/session/create` — which is likely incorrect. The `chatApiUrl` default (`http://localhost:8000/api/v1`) is the correct pattern.

**Fix:** Change `cloudEndpoint` default to `'http://localhost:8000/api/v1'` (without the `/process-recording` suffix), or update `cloud-upload.ts` to not append paths to `cloudEndpoint`.

---

### H3. Chrome Extension: `<all_urls>` Host Permission

**File:** `extension/manifest.json` (line 18)
```json
"host_permissions": ["http://localhost:8000/*", "https://app.stept.ai/*", "<all_urls>"]
```

**Issue:** `<all_urls>` grants the extension access to every website. This is needed for `chrome.tabs.captureVisibleTab()` (screenshots) and content script injection, but Chrome Web Store reviewers will flag this. It also means the extension can read/modify any page, which is a significant attack surface.

**Fix:** For Chrome Web Store submission, consider:
1. Using `activeTab` permission (already present) instead of `<all_urls>` for screenshot capture
2. Using `host_permissions` only for the API server URLs
3. If content script injection on all pages is needed, document the justification clearly
4. The `build.sh` store mode retains `<all_urls>` — review whether it's truly necessary

---

### H4. Chrome Extension: Unused `identity` Permission

**File:** `extension/manifest.json` (line 10)

**Issue:** The `identity` permission is declared and `chrome.identity.launchWebAuthFlow()` is used in `background.js` (lines 431, 442, 493) for OAuth login. However, `chrome.identity.launchWebAuthFlow` with `interactive: true` works without the `identity` permission in Manifest V3 — the permission is only needed for `chrome.identity.getAuthToken()`. Removing unnecessary permissions reduces the Chrome Web Store review friction.

**Fix:** Test whether auth still works without the `identity` permission. If `launchWebAuthFlow` needs it, keep it but document why. If `getRedirectURL` is the only dependency, note that it does require the `identity` permission.

---

### H5. Electron: Missing `sandbox: true` on Two BrowserWindows

**Files:**
- `desktop/src/main/audio-capture.ts` (~line 226): Audio capture hidden window — has `nodeIntegration: false, contextIsolation: true` but no `sandbox: true`
- `desktop/src/main/recording.ts` (line 1283): Recording overlay window — has `nodeIntegration: false, contextIsolation: true` but no `sandbox: true`

**Issue:** While `nodeIntegration: false` and `contextIsolation: true` are set (good), the `sandbox` flag is not explicitly enabled. Without `sandbox: true`, the renderer process has access to some Node.js APIs even with `nodeIntegration: false`. Other windows in `index.ts` correctly set `sandbox: true`.

**Fix:** Add `sandbox: true` to both windows' `webPreferences` for defense-in-depth:
```ts
webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
```

---

### H6. WebSocket Auth Token in URL Query Parameter

**File:** `desktop/src/main/auth.ts` (line ~219)
```ts
const wsUrl = `${this.getWsBaseUrl()}/auth/ws/notifications?token=${encodeURIComponent(this.accessToken)}`;
```

**Issue:** The access token is passed as a URL query parameter for the WebSocket connection. Query parameters may be logged in server access logs, proxy logs, and browser history. This is a common but avoidable security concern.

**Fix:** If the server supports it, pass the token via a WebSocket subprotocol header or in the first message after connection. If query parameter is the only option, document the risk and ensure server-side log redaction.

---

## Medium

### M1. Old Filename Artifact: `OndokiLogo.tsx`

**File:** `desktop/src/renderer/components/spotlight/OndokiLogo.tsx`

**Issue:** The file is named after the old brand "Ondoki" even though its contents have been updated to export `SteptLogo`. This is confusing for contributors and a telltale sign of incomplete rebranding.

**Fix:** Rename to `SteptLogo.tsx` (also fixes C1 above).

---

### M2. Build Script `build.sh` Uses macOS-Only `sed -i ''`

**File:** `extension/build.sh` (lines 29, 32)
```bash
sed -i '' "s/mode: 'self-hosted'/mode: 'cloud'/" "$DIST_DIR/background.js"
```

**Issue:** The `sed -i ''` syntax is macOS-specific. On Linux/GNU sed, it requires `sed -i` (without `''`). This breaks CI/CD on Linux.

**Fix:** Use a portable pattern:
```bash
sed -i.bak "s/..." "$FILE" && rm -f "$FILE.bak"
```
Or use `perl -pi -e` which is portable across both.

---

### M3. Build Script Only Patches `background.js`, Not Other Files

**File:** `extension/build.sh`

**Issue:** The store build mode patches `BUILD_CONFIG.mode` in `background.js`, but `sidepanel.js` (line 722) and `popup.html` (line 118) also contain hardcoded localhost fallbacks and placeholders. These aren't patched for the store build.

**Fix:** Extend the build script to also patch `sidepanel.js` fallback URLs and HTML placeholder values for store builds.

---

### M4. Extension: Google Fonts Loaded from CDN in sidepanel.html

**File:** `extension/sidepanel.html` (line 8)
```html
<link href="https://fonts.googleapis.com/css2?family=Manrope..." rel="stylesheet">
```

**Issue:** Loading fonts from Google CDN introduces a privacy concern (Google can track users) and a network dependency. Chrome extensions should generally bundle their fonts for offline reliability and privacy.

**Fix:** Download the Manrope font files and bundle them in the extension, using `@font-face` in the CSS.

---

### M5. Desktop `cloudEndpoint` and `chatApiUrl` Are Confusingly Separate

**File:** `desktop/src/main/settings.ts` (lines 40–41)

**Issue:** Two separate URL settings (`cloudEndpoint` and `chatApiUrl`) both point to the same API server, but `cloudEndpoint` has a different path suffix. Multiple places in the codebase use `settings.chatApiUrl || settings.cloudEndpoint` as fallback, creating ambiguity about which is authoritative.

**Fix:** Unify to a single `apiBaseUrl` setting and derive specific endpoints from it:
```ts
const uploadUrl = `${apiBaseUrl}/session/create`;
const authUrl = `${apiBaseUrl}/auth/token`;
```

---

### M6. Extension Popup: Duplicate UI for Settings

**Files:**
- `extension/popup.html` — contains settings UI (API URL, frontend URL, display mode)
- `extension/sidepanel.html` — contains identical settings UI

**Issue:** The settings interface is duplicated between popup and side panel, meaning any UI change must be made in two places. The popup is effectively a simplified launcher that redirects to side panel mode.

**Fix:** Consider making the popup minimal (just login + open side panel button) and keeping all settings in the side panel only.

---

### M7. Desktop: `openExternal` Allows Only `https:` and `mailto:`

**File:** `desktop/src/main/ipc-handlers.ts` (lines ~129–134)

**Issue:** The `validateExternalUrl` function correctly restricts protocols to `https:` and `mailto:`. However, the `stept://` protocol URL handler (`handleProtocolUrl` in `index.ts`) is not validated through this path — it's handled directly. While currently only `stept://auth/callback` is handled, there's no allowlist enforcement on the protocol handler.

**Fix:** Add explicit path validation in `handleProtocolUrl` to reject unexpected `stept://` paths.

---

### M8. Refresh Token Storage Security

**File:** `desktop/src/main/settings.ts` (lines ~103–106)

**Issue:** The refresh token is stored in the encrypted electron-store alongside all other settings. The encryption key is derived from `safeStorage` (OS keychain) which is good. However, if `safeStorage` is unavailable (line ~84), the fallback derives the key from the `userData` path — this is deterministic and not secret, meaning the settings file is effectively unencrypted on systems without a keyring.

**Fix:** Document this limitation. On Linux systems without a keyring, consider warning the user. Alternatively, store the refresh token separately using `safeStorage.encryptString()` directly.

---

## Low

### L1. Inconsistent Version Strings

**Files:**
- `extension/manifest.json` (line 4): `"version": "1.0.1"`
- `extension/sidepanel.css` / `sidepanel.html`: references `Stept v1.0.1`
- `desktop/package.json` (line 5): `"version": "1.0.0"`

**Issue:** Extension is at 1.0.1, desktop at 1.0.0. For a monorepo, versions should either be synchronized or independently managed with clear documentation.

**Fix:** Decide on versioning strategy. Either sync versions or document that they're independent.

---

### L2. Hardcoded Ollama URL in Chat Service

**File:** `desktop/src/main/chat.ts` (line 158)
```ts
apiUrl = `${llmConfig.baseUrl || 'http://localhost:11434'}/api/chat`;
```

**Issue:** The Ollama fallback URL `http://localhost:11434` is hardcoded. While this is the standard Ollama default, it should be noted in documentation.

**Fix:** Document the Ollama default in settings UI or README.

---

### L3. Extension `build.sh` Depends on `python3` for JSON Patching

**File:** `extension/build.sh` (lines 36–43)

**Issue:** The store build uses `python3` to patch `manifest.json`. If `python3` is not available, it prints a warning but produces an unpatched manifest with `<all_urls>` and localhost permissions.

**Fix:** Use `jq` (more common in CI environments) or Node.js for JSON manipulation:
```bash
node -e "const m=require('./$DIST_DIR/manifest.json'); m.host_permissions=['https://app.stept.ai/*','<all_urls>']; require('fs').writeFileSync('./$DIST_DIR/manifest.json', JSON.stringify(m,null,2))"
```

---

### L4. Extension Content Script Injects `guide-runtime.js` on All Frames

**File:** `extension/background.js` (line ~88)
```js
await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['guide-runtime.js'] });
```

**Issue:** The guide runtime is injected into all frames (including cross-origin iframes). While the script is defensive about this (it returns early in child frames after setting up a message listener), injecting code into all frames increases the surface area and may cause CSP violations on strict sites.

**Fix:** Consider injecting only into the top frame first, and only into sub-frames when needed:
```js
await chrome.scripting.executeScript({ target: { tabId, allFrames: false }, files: ['guide-runtime.js'] });
```

---

### L5. No `.gitignore` for Extension `dist-*` Build Directories (Already Handled)

**File:** Root `.gitignore` (lines 47–48)
```
extension/dist-store/
extension/dist-self-hosted/
```

**Issue:** Already correctly ignored. However, the `build.sh` script creates `dist-store` or `dist-self-hosted` directories — the gitignore patterns are correct.

**Status:** ✅ No action needed.

---

### L6. Desktop `.gitignore` Coverage

**File:** Root `.gitignore`
```
desktop/out/
desktop/lib/
```

**Issue:** Desktop build outputs (`out/`, `lib/`) are correctly ignored. However, `desktop/.webpack/` (webpack dev server cache) is not explicitly listed — the root `.webpack` pattern may not match it if it's nested.

**Fix:** Add `desktop/.webpack/` to `.gitignore` for safety.

---

### L7. Extension: `tabs` Permission May Be Reducible

**File:** `extension/manifest.json` (line 7)

**Issue:** The `tabs` permission grants access to `tab.url` and `tab.title` for all tabs. The extension uses this extensively for URL matching, context links, and recording. While needed, this is another permission Chrome Web Store reviewers scrutinize.

**Fix:** Document the justification. If some uses can be replaced with `activeTab` events, consider it, but the current usage pattern (reading URLs of non-active tabs for context matching) genuinely requires `tabs`.

---

### L8. Desktop: Electron Version 30

**File:** `desktop/package.json` (devDependencies)
```json
"electron": "^30.0.0"
```

**Issue:** Electron 30 was current at time of development but check for security advisories. Ensure you're on the latest patch of the Electron 30.x line, or consider upgrading to the latest stable.

**Fix:** Run `npm audit` and check https://releases.electronjs.org for security patches.

---

### L9. No TODO/FIXME/HACK Comments Found

**Scope:** All `extension/` and `desktop/src/` files

**Status:** ✅ Clean — no TODO/FIXME/HACK comments were found in either directory.

---

### L10. No Hardcoded Extension IDs, OAuth Client IDs, or API Keys Found

**Scope:** All `extension/` and `desktop/src/` files

**Status:** ✅ Clean — no hardcoded secrets, extension IDs, or OAuth client IDs were found. The `apiKey` and `llmApiKey` settings fields exist but default to empty strings.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| Critical | 3 | Build-breaking import (OndokiLogo→SteptLogo), old repo URLs, old org attribution |
| High | 6 | Hardcoded localhost defaults, mismatched cloudEndpoint path, `<all_urls>` permission, missing sandbox, WebSocket token in URL |
| Medium | 8 | Old filename, non-portable build script, settings duplication, CDN font, confusing config keys |
| Low | 10 | Version mismatch, Ollama default, python3 dependency, minor gitignore, Electron version |

### Positive Findings

- ✅ No references to old names (ondoki/snaprow/SnapRow/Ondoki) in code content (only the filename `OndokiLogo.tsx`)
- ✅ No hardcoded secrets or API keys
- ✅ No TODO/FIXME/HACK comments
- ✅ Strong Electron security posture: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` on most windows
- ✅ Proper PKCE OAuth flow implementation
- ✅ Good CSP in extension manifest
- ✅ Input validation on all IPC handlers
- ✅ External URL protocol restriction (`https:` and `mailto:` only)
- ✅ No `eval()` usage anywhere
- ✅ Proper use of `contextBridge.exposeInMainWorld` (no direct `ipcRenderer` exposure)
