# Open-Source Release Audit: Secrets, Naming & Hygiene Sweep

> Generated: 2026-03-14
> Scope: Full monorepo `stept` (api/, app/, desktop/, extension/, packages/, docs/, scripts/, root configs)
> Excluded: `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `__pycache__/`

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 3 | Hardcoded encryption keys in tracked files, committed `.env` with real Fernet key |
| 🟠 HIGH | 5 | Old `ONDOKI_` branding in config/code, `contact@myfoxit.com` author email, hardcoded dev passwords |
| 🟡 MEDIUM | 6 | Debug print statements in production code, oversized image, `myfoxit` GitHub org refs |
| 🟢 LOW | 4 | Legitimate localhost dev defaults, console.log in desktop/extension, test-only emails |

---

## 1. Old Brand Names

### `ONDOKI` / `ondoki` references

**🟠 HIGH — Must rename env vars before release**

These are tracked files still using the old `ONDOKI_` prefix:

| File | Line | Match |
|------|------|-------|
| `docker-compose.dev.yml` | 22 | `ONDOKI_ENCRYPTION_KEY: ${ONDOKI_ENCRYPTION_KEY:-exX5...}` |
| `docker-compose.dev.yml` | 25 | `ONDOKI_UPLOAD_DIR: /data/uploads/videos` |
| `docker-compose.dev.yml` | 71 | `ONDOKI_ENCRYPTION_KEY: ${ONDOKI_ENCRYPTION_KEY:-exX5...}` |
| `docker-compose.dev.yml` | 74 | `ONDOKI_UPLOAD_DIR: /data/uploads/videos` |
| `docker-compose.yml` | 58 | `ONDOKI_ENCRYPTION_KEY: ${ONDOKI_ENCRYPTION_KEY:?...}` |
| `docker-compose.yml` | 134 | `ONDOKI_ENCRYPTION_KEY: ${ONDOKI_ENCRYPTION_KEY:?...}` |
| `docker-compose.yml` | 137 | `ONDOKI_UPLOAD_DIR: /data/uploads/videos` |
| `docker-compose.prod.yml` | 86 | `ONDOKI_ENCRYPTION_KEY: ${ONDOKI_ENCRYPTION_KEY}` |
| `docker-compose.prod.yml` | 139 | `ONDOKI_ENCRYPTION_KEY: ${ONDOKI_ENCRYPTION_KEY}` |
| `docker-compose.prod.yml` | 142 | `ONDOKI_UPLOAD_DIR: /app/storage/videos` |
| `docker-compose.test.yml` | 20 | `ONDOKI_ENCRYPTION_KEY: ${ONDOKI_ENCRYPTION_KEY:-test-key...}` |
| `.github/workflows/deploy.yml` | 148 | `ONDOKI_ENCRYPTION_KEY=${{ secrets.ONDOKI_ENCRYPTION_KEY }}` |
| `.github/workflows/ci.yml` | 54 | `ONDOKI_ENCRYPTION_KEY: ci-test-key-must-be-32-bytes-pad` |
| `api/app/routers/video_import.py` | 19 | Fallback: `os.getenv("ONDOKI_UPLOAD_DIR", ...)` |
| `api/app/services/crypto.py` | 5 | Docstring mentions `ONDOKI_ENCRYPTION_KEY` |
| `api/app/services/crypto.py` | 33 | `os.environ.get("ONDOKI_ENCRYPTION_KEY")` |
| `api/app/mcp_server.py` | 52 | Docstring: `ONDOKI_API_KEY env var` |
| `api/app/mcp_server.py` | 58 | `os.environ.get("ONDOKI_API_KEY")` |

**Action:** Rename all `ONDOKI_*` env vars to `STEPT_*`. The Python code already has `STEPT_` as primary with `ONDOKI_` fallbacks — remove the fallbacks. Update all docker-compose and CI files.

### `SnapRow` / `snap_row` / `snap-row` / `snaprow`

✅ **No matches found** — clean.

### `myfoxit` references

**🟡 MEDIUM — Organization name in public-facing files**

| File | Line | Match |
|------|------|-------|
| `desktop/forge.config.js` | 39 | `homepage: 'https://github.com/myfoxit/stept-desktop-electron'` |
| `desktop/forge.config.js` | 49 | `homepage: 'https://github.com/myfoxit/stept-desktop-electron'` |
| `desktop/forge.config.js` | 73 | `owner: 'myfoxit'` |
| `desktop/package.json` | 7 | `"homepage": "https://github.com/myfoxit/stept-desktop"` |
| `desktop/package.json` | 10 | `"url": "https://github.com/myfoxit/stept-desktop.git"` |
| `desktop/package.json` | 14 | `"email": "contact@myfoxit.com"` |
| `desktop/package.json` | 86 | `"appId": "com.myfoxit.stept-desktop"` |
| `docs/` (multiple) | various | `github.com/myfoxit/stept` references |
| `docs/mint.json` | 21,26,38,43,101 | GitHub links to `myfoxit/stept` |
| `.github/workflows/deploy.yml` | 25 | `IMAGE_PREFIX: ghcr.io/myfoxit/stept-web` |
| `.github/workflows/ci.yml` | 117,124 | `ghcr.io/myfoxit/stept-web-api:latest` |
| `docker-compose.prod.yml` | 72,125,158,169 | `ghcr.io/myfoxit/stept-*:latest` |
| `docker-compose.yml` | 149 | `ghcr.io/myfoxit/sendcloak:latest` |

**Note:** If `myfoxit` is the correct GitHub org for the open-source release, these are fine. If the org is changing, update all references. The `contact@myfoxit.com` email in `desktop/package.json:14` should be verified as intentional.

---

## 2. Secrets & Keys

### 🔴 CRITICAL — Hardcoded encryption keys in tracked files

| File | Line | Issue |
|------|------|-------|
| `docker-compose.dev.yml` | 22 | Hardcoded Fernet key as default: `exX5o2vhMgT48Eho4ShGcD-vx_iKKZQMBGgOfw7dhRM=` |
| `docker-compose.dev.yml` | 71 | Same key repeated |
| `docker-compose.test.yml` | 20 | Hardcoded test key: `test-key-for-testing-only-32bytes` |

**Action:** While these are dev/test defaults, having real-looking Fernet keys in tracked files risks users accidentally using them in production. Replace with placeholder like `CHANGE_ME_GENERATE_WITH_FERNET` or add prominent warnings. The test key is acceptable but should be clearly marked.

### 🟠 HIGH — Committed `.env` with real Fernet key

| File | Line | Issue |
|------|------|-------|
| `.env` | 28 | `ONDOKI_ENCRYPTION_KEY=nK-tzkx88ltQnL-_8UMiK5siRA01ft59Hesgha6JB98=` |

**Status:** `.env` is in `.gitignore` and NOT tracked by git (verified with `git ls-files`). However, if this file was ever committed in history, the key is leaked. The `.env.example` correctly has `STEPT_ENCRYPTION_KEY=` (empty). ✅ Currently safe, but verify git history.

### 🟠 HIGH — Hardcoded dev database passwords

| File | Line | Issue |
|------|------|-------|
| `.env.example` | 15-16 | `POSTGRES_USER=postgres` / `POSTGRES_PASSWORD=postgres` |
| `.env.test` | 2-3 | `postgresql+asyncpg://postgres:postgres@localhost:5432/stept_test` |
| `scripts/run-tests-local.sh` | 26 | `postgresql+asyncpg://postgres:postgres@localhost:5432/stept_test` |
| `api/tests/conftest.py` | 41 | `postgresql+asyncpg://postgres:postgres@localhost:5432/stept_test` |

**Verdict:** 🟢 **Acceptable** — These are standard dev/test defaults. The `.env.example` has clear comments about production. No action needed.

### Placeholder API key references (safe)

| File | Line | Note |
|------|------|------|
| `.env` (untracked) | 109 | `# ONDOKI_LLM_API_KEY=sk-...` — commented placeholder |
| `app/src/components/Settings/LlmSetupWizard.tsx` | 527 | `placeholder={... 'sk-…' ...}` — UI placeholder text |
| `api/docs/enterprise-api.md` | 186,212 | `"stept_your_key_here"` — documentation example |

✅ All safe — placeholder/example values only.

---

## 3. Internal URLs / localhost References

### 🟢 LOW — Legitimate dev defaults (no action needed)

All `localhost` references are proper development defaults with env var overrides for production:

| Category | Files | Notes |
|----------|-------|-------|
| **App dev config** | `app/.env.development:1`, `app/.env.test:1,3` | `VITE_API_BASE_URL=http://localhost:8000/api/v1` |
| **Test configs** | `app/tests/e2e/helpers/config.ts:15-16`, `app/playwright.config.ts:21,43,48,51` | Fallback to localhost in tests |
| **Test mocks** | `app/src/api/__tests__/*.test.ts` (12 files) | `getApiBaseUrl: () => 'http://localhost:8000/api/v1'` |
| **Backend config** | `api/app/config.py:11,55,58,59`, `api/app/core/config.py:59,64` | Default values with `os.getenv()` |
| **Docker health checks** | `docker-compose*.yml` | `http://localhost:8000/health` — internal container checks |
| **Desktop defaults** | `desktop/src/main/settings.ts:40-49` | Default settings for dev |
| **Extension defaults** | `extension/background.js:8`, `extension/manifest.json:16` | `http://localhost:8000/api/v1` |
| **Shared constants** | `packages/shared/src/constants.ts:27` | `DEFAULT_API_BASE = 'http://localhost:8000'` |
| **Scripts** | `scripts/run-tests-local.sh`, `api/app/scripts/test-env.sh` | Test infrastructure |

### 🟢 LOW — Ollama localhost references (intentional)

| File | Line | Match |
|------|------|-------|
| `app/src/components/Settings/LlmSetupWizard.tsx` | 166,186,497,516,708 | `http://localhost:11434` — Ollama local LLM |
| `desktop/src/main/chat.ts` | 158 | `http://localhost:11434` — Ollama fallback |

✅ Correct behavior for local LLM integration.

### 🟢 LOW — Auth localhost checks (security feature)

| File | Line | Match |
|------|------|-------|
| `api/app/routers/auth.py` | 45-50 | Localhost origins for CORS in dev |
| `api/app/routers/auth.py` | 117,127 | Secure cookie handling for localhost |
| `api/app/routers/auth.py` | 930,942 | E2E test endpoint restricted to localhost |

✅ These are proper security-aware localhost handling.

### No private IPs (192.168.x, 10.0.x) found

✅ Clean — all `10.0.` matches were version numbers in lock files.

---

## 4. Email Addresses

### 🟠 HIGH — Author email to verify

| File | Line | Email | Action |
|------|------|-------|--------|
| `desktop/package.json` | 14 | `contact@myfoxit.com` | Verify this is intentional for OSS release |

### 🟢 LOW — Brand/product emails (intentional)

| File | Line | Email |
|------|------|-------|
| `app/src/components/app-sidebar.tsx` | 52 | `hello@stept.ai` |
| `.env` (untracked) | 64 | `noreply@stept.ai` |
| `api/app/config.py` | 20 | `noreply@stept.ai` (default) |
| `api/app/routers/test_helpers.py` | 19 | `e2e-test@stept.ai` |
| `app/src/pages/theme-explorer.jsx` | 144 | `hello@stept.com` |

### ✅ Safe — Test/example emails only

All other email matches are `@test.com`, `@example.com`, `@nowhere.com`, or `@test.com` — standard test fixtures.

---

## 5. Private Registry References

### 🟡 MEDIUM — `ghcr.io/myfoxit` references

Already listed in Section 1 under `myfoxit`. These are the GitHub Container Registry references:

| File | Lines | Images |
|------|-------|--------|
| `docker-compose.prod.yml` | 72,125,158,169 | `ghcr.io/myfoxit/stept-api`, `stept-media-worker`, `stept-app`, `sendcloak` |
| `docker-compose.yml` | 149 | `ghcr.io/myfoxit/sendcloak:latest` |
| `.github/workflows/deploy.yml` | 24-25,57,136 | Registry login and push |
| `.github/workflows/ci.yml` | 108,117,124 | CI build and push |
| `docs/self-hosting/docker-compose.mdx` | 89-91 | Documentation references |

**Action:** These are correct if `myfoxit` is the public GitHub org. If the registry will change for OSS, update all references.

No `docker.io` or `npm.pkg` references found. ✅

---

## 6. Debug Statements

### 🟡 MEDIUM — Python `print()` debug statements in production code

| File | Line | Statement |
|------|------|-----------|
| `api/app/routers/process_recording.py` | 633 | `print(f"DEBUG: Docker is looking for image at: {local_path}")` |
| `api/app/routers/process_recording.py` | 1183 | `print(f"[PDF Export] Session ID: {session_id}")` |
| `api/app/routers/process_recording.py` | 1184 | `print(f"[PDF Export] Storage path: ...")` |
| `api/app/routers/process_recording.py` | 1185 | `print(f"[PDF Export] Storage type: ...")` |
| `api/app/routers/process_recording.py` | 1186 | `print(f"[PDF Export] Files: ...")` |
| `api/app/routers/process_recording.py` | 1198 | `print(f"[PDF Export] Gotenberg error: ...")` |
| `api/app/workflow_export.py` | 29 | `print(f"[Export] Error reading image...")` |
| `api/app/workflow_export.py` | 37 | `print(f"[Export] Read image, size: ...")` |
| `api/app/workflow_export.py` | 176 | `print(f"[PDF Export] Storage path: ...")` |
| `api/app/workflow_export.py` | 177 | `print(f"[PDF Export] Files dict: ...")` |
| `api/app/workflow_export.py` | 206 | `print(f"[PDF Export] Step {step_number} has file: ...")` |
| `api/app/workflow_export.py` | 218 | `print(f"[PDF Export] Step {step_number} has no file...")` |
| `api/app/workflow_export.py` | 554-604 | Multiple `[DOCX Export]` prints (6 statements) |

**Action:** Replace all `print()` with proper `logger.debug()` or `logger.info()` calls. The `DEBUG:` prefix on line 633 is especially problematic.

### 🟢 LOW — JavaScript console.log (83 instances in non-test code)

Most are in `desktop/src/main/` (Electron main process — appropriate for desktop logging) and `extension/` (browser extension — behind DEBUG flag). Notable ones:

| File | Line | Note |
|------|------|------|
| `app/src/lib/apiClient.ts` | 14 | `console.log('[API] Base URL:', url, {...})` — may leak config |
| `app/src/api/workflows.ts` | 132 | `console.log('Uploading image:', {...})` |
| `app/src/pages/workflow-view.tsx` | 473,480,484 | Various debug logs |
| `extension/sidepanel.js` | 957,969,973,1013 | `[Guide]` debug logs |

**Action:** Consider removing `console.log` from `app/src/` (web frontend). Desktop and extension logs are generally acceptable but should be behind a debug flag (extension already has this).

### ✅ No `breakpoint()` or `import pdb` found

---

## 7. Committed Environment Files

| File | Tracked? | Status |
|------|----------|--------|
| `.env` | ❌ Not tracked (in `.gitignore`) | ✅ Safe |
| `.env.example` | ✅ Tracked | ✅ Correct — template with empty secrets |
| `.env.test` | ✅ Tracked | ✅ Acceptable — test-only values |
| `app/.env.development` | ✅ Tracked | ✅ Acceptable — just `localhost` URL |
| `app/.env.test` | ✅ Tracked | ✅ Acceptable — test-only values |

No `.env.local` or `.env.production` files found. ✅

---

## 8. Large Binary Files

### 🟡 MEDIUM — Oversized image

| File | Size | Type |
|------|------|------|
| `app/public/login_side_banner.png` | **7.4 MB** | PNG 2848×1504 RGBA |

**Action:** Compress or resize. A 2848×1504 login banner at 7.4 MB is excessive. Consider:
- Converting to WebP (~500KB)
- Reducing resolution to 1424×752 (~1-2MB as PNG)
- Using JPEG at 85% quality (~300KB)

### ✅ Native binary (acceptable)

| File | Size | Type |
|------|------|------|
| `desktop/native/macos/window-info` | 320K | Mach-O 64-bit arm64 |

Small enough and necessary for functionality.

---

## 9. `SR_` Prefix (Old SnapRow env vars in docs)

### 🟡 MEDIUM — Legacy `SR_` prefixed env vars in documentation

| File | Lines | Variables |
|------|-------|-----------|
| `docs/self-hosting/email.mdx` | 23-27, 34-62 | `SR_SMTP_HOST`, `SR_SMTP_PORT`, `SR_SMTP_USER`, `SR_SMTP_PASS`, `SR_FROM_EMAIL` |
| `docs/self-hosting/environment-variables.mdx` | 74 | `SR_FROM_EMAIL` |
| `api/app/config.py` | 16,20 | Fallback reads: `os.getenv("SR_SMTP_HOST", ...)`, `os.getenv("SR_FROM_EMAIL", ...)` |

**Action:** The `SR_` prefix appears to be from the SnapRow era. Docs should use `SMTP_*` / `STEPT_*` prefixes. Code fallbacks can remain for backward compat but should be documented as deprecated.

---

## Priority Action Items

### 🔴 CRITICAL (Blocks Release)

1. **Remove hardcoded Fernet key defaults** from `docker-compose.dev.yml:22,71` — replace with empty or clearly fake placeholder
2. **Verify git history** for `.env` — if ever committed, the Fernet key `nK-tzkx88...` is compromised
3. **Rename `ONDOKI_ENCRYPTION_KEY`** → `STEPT_ENCRYPTION_KEY` in all docker-compose files and CI workflows

### 🟠 HIGH (Must Fix)

4. **Rename all `ONDOKI_*` env vars** to `STEPT_*` across docker-compose, CI, and Python fallbacks
5. **Remove `ONDOKI_` fallbacks** from `api/app/services/crypto.py:33`, `api/app/mcp_server.py:58`, `api/app/routers/video_import.py:19`
6. **Verify `contact@myfoxit.com`** in `desktop/package.json:14` — update or confirm for OSS
7. **Replace Python `print()` debug statements** with proper logging (18 instances in 2 files)
8. **Review `.env.example`** — uses `STEPT_ENCRYPTION_KEY` (good) but `.env` template comments still reference `ONDOKI_` naming

### 🟡 MEDIUM (Should Fix)

9. **Compress `app/public/login_side_banner.png`** (7.4 MB → target <500KB)
10. **Update `SR_` prefixed env vars** in docs to `SMTP_*`/`STEPT_*`
11. **Remove stray `console.log`** from `app/src/` frontend code (at least the API client one)
12. **Confirm `myfoxit` GitHub org** is correct for public release — update all `ghcr.io/myfoxit/*` and `github.com/myfoxit/*` refs if changing
13. **Update old repo names** in `desktop/forge.config.js:39,49` (`stept-desktop-electron` → current name)
14. **Clean `desktop/package.json:86`** — `com.myfoxit.stept-desktop` app ID

### 🟢 LOW (Nice to Fix)

15. Desktop/extension `console.log` statements — functional but noisy (behind DEBUG flags is fine)
16. Test fixture emails — all use safe `@test.com`/`@example.com` domains
17. Localhost defaults — all have proper env var overrides
