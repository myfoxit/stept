# Monorepo Structure, DevOps & Shared Packages Audit

**Date:** 2026-03-14
**Scope:** Root configs, Docker, CI/CD, shared packages, docs, git hygiene, env vars

---

## Critical

### 1. `.env` contains real encryption key — committed to repo history risk

- **File:** `.env`, line 28
- **Issue:** `.env` contains `ONDOKI_ENCRYPTION_KEY=nK-tzkx88ltQnL-_8UMiK5siRA01ft59Hesgha6JB98=` — a real Fernet key. While `.env` is in `.gitignore` and not currently tracked, it ships in the working tree. If it was ever committed, the key is in git history.
- **Fix:** Rotate the key before open-source release. Run `git log --all -- .env` to verify it was never committed. Add a pre-commit hook or CI check to block `.env` commits.

### 2. `ONDOKI_ENCRYPTION_KEY` used everywhere — old name not renamed

- **Files & lines:**
  - `docker-compose.yml`: lines 58, 134
  - `docker-compose.dev.yml`: lines 22, 25, 71, 74
  - `docker-compose.prod.yml`: lines 86, 139, 142
  - `docker-compose.test.yml`: line 20
  - `.github/workflows/ci.yml`: line 54
  - `.github/workflows/deploy.yml`: line 148
  - `Makefile`: lines 35, 45
  - `.env`: lines 28, 108–111
  - `api/app/services/crypto.py`: line 33 (fallback)
  - `api/app/routers/video_import.py`: line 19 (fallback)
  - `api/app/mcp_server.py`: line 58 (fallback)
- **Issue:** All Docker Compose files, CI workflows, Makefile, and `.env` use `ONDOKI_ENCRYPTION_KEY` as the primary env var name. The `.env.example` correctly uses `STEPT_ENCRYPTION_KEY`, but nothing else does. The Python code supports both as fallback, but the infrastructure only sets the old name.
- **Fix:** Rename `ONDOKI_ENCRYPTION_KEY` → `STEPT_ENCRYPTION_KEY` in all compose files, CI workflows, Makefile, `.env`, and deploy scripts. Keep the Python fallback for one release cycle, then remove.

### 3. `ONDOKI_UPLOAD_DIR` env var — old name in Docker configs

- **Files & lines:**
  - `docker-compose.yml`: line 137
  - `docker-compose.dev.yml`: lines 25, 74
  - `docker-compose.prod.yml`: line 142
- **Issue:** Uses `ONDOKI_UPLOAD_DIR` instead of a `STEPT_`-prefixed name.
- **Fix:** Rename to `STEPT_UPLOAD_DIR` or just `UPLOAD_DIR` (which is already used elsewhere). Update `api/app/routers/video_import.py` line 19 fallback chain accordingly.

### 4. `ONDOKI_LLM_*` env vars in `.env` — old name

- **File:** `.env`, lines 108–111
- **Issue:** Commented-out LLM config uses `ONDOKI_LLM_PROVIDER`, `ONDOKI_LLM_API_KEY`, etc. The `.env.example` correctly uses `STEPT_LLM_*`.
- **Fix:** Update `.env` to use `STEPT_LLM_*` prefix. (`.env` is not tracked, but it's the actual working config developers copy.)

---

## High

### 5. CI pushes Docker images with old `stept-web` prefix

- **Files & lines:**
  - `.github/workflows/ci.yml`: lines 117, 124 — pushes `ghcr.io/myfoxit/stept-web-api:latest` and `ghcr.io/myfoxit/stept-web-app:latest`
  - `.github/workflows/deploy.yml`: line 25 — `IMAGE_PREFIX: ghcr.io/myfoxit/stept-web`
- **Issue:** CI builds and pushes images as `stept-web-api` and `stept-web-app`, but `docker-compose.prod.yml` pulls `stept-api` and `stept-app` (lines 72, 158). **Images will never be found** — production deploy is broken.
- **Fix:** Align image names. Either:
  - Update CI to push `ghcr.io/myfoxit/stept-api` and `ghcr.io/myfoxit/stept-app`, or
  - Update `docker-compose.prod.yml` to pull the `-web-` variants.

### 6. CONTRIBUTING.md references old repo name

- **File:** `CONTRIBUTING.md`, lines 16–17
- **Issue:** Clone instructions say `git clone https://github.com/myfoxit/stept-web.git` / `cd stept-web`. The repo is now `stept`.
- **Fix:** Change to `git clone https://github.com/myfoxit/stept.git` / `cd stept`.

### 7. CONTRIBUTING.md has wrong frontend port

- **File:** `CONTRIBUTING.md`, line ~27
- **Issue:** Says "Frontend: http://localhost:3000" but the actual Vite dev server runs on port 5173 (as documented in README and Makefile).
- **Fix:** Change to `http://localhost:5173`.

### 8. SMTP env var naming inconsistency between dev and prod

- **Files:**
  - `docker-compose.yml`: lines 81–85 — uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
  - `docker-compose.prod.yml`: lines 95–99 — uses `SR_SMTP_HOST`, `SR_SMTP_PORT`, `SR_SMTP_USER`, `SR_SMTP_PASS`, `SR_FROM_EMAIL`
  - `.env.example`: uses `SMTP_*` (no `SR_` prefix)
  - `.github/workflows/deploy.yml`: line ~155 — uses `SR_SMTP_*` and `SR_FROM_EMAIL`
- **Issue:** Dev compose uses `SMTP_*`, prod compose uses `SR_SMTP_*` / `SR_FROM_EMAIL`. The `SR_` prefix appears to be a SnapRow-era relic. The backend likely reads one set — whichever doesn't match will be silently ignored.
- **Fix:** Standardize on `SMTP_*` everywhere. Update `docker-compose.prod.yml` and `deploy.yml` to match.

### 9. `desktop/package.json` points to separate repo

- **File:** `desktop/package.json`, lines 7, 10
- **Issue:** `homepage` is `https://github.com/myfoxit/stept-desktop` and `repository.url` is `https://github.com/myfoxit/stept-desktop.git`. These repos likely don't exist anymore since everything merged into `stept`.
- **Fix:** Update to `https://github.com/myfoxit/stept` and `https://github.com/myfoxit/stept.git`.

### 10. `desktop/forge.config.js` references old repo name

- **File:** `desktop/forge.config.js`, lines 39, 49, 74
- **Issue:** References `stept-desktop-electron` (the pre-merge repo name) in `homepage` URLs and package `name`.
- **Fix:** Update homepage to `https://github.com/myfoxit/stept/tree/master/desktop` and name to `stept-desktop`.

### 11. No `.dockerignore` for `api/` or `video-worker/`

- **Files:** `api/Dockerfile`, `video-worker/Dockerfile`
- **Issue:** `api/` has no `.dockerignore`. The `COPY . .` in `api/Dockerfile` copies `.venv`, `__pycache__`, tests, `.env` files, and other unnecessary files into the image. `video-worker/Dockerfile` builds from repo root context (`context: .`) with no root `.dockerignore`.
- **Fix:** Add `api/.dockerignore` (exclude `.venv`, `__pycache__`, `tests/`, `.env*`, `*.pyc`, `.git`). Add root `.dockerignore` for the video-worker build context.

### 12. `@stept/shared` not consumed by any package

- **Files:** `app/package.json`, `desktop/package.json`, `extension/` (no package.json)
- **Issue:** `packages/shared/` defines `@stept/shared` with types and constants, but no package declares it as a dependency. The shared package also has no `dist/` built. The types/constants appear unused.
- **Fix:** Either wire up `@stept/shared` as a `workspace:*` dependency in `app` and `desktop`, or remove the package if it's aspirational. Ensure `pnpm build` in the shared package runs before consumers.

---

## Medium

### 13. 7.4 MB PNG tracked in git

- **File:** `app/public/login_side_banner.png` (7,734,174 bytes)
- **Issue:** A 2848×1504 PNG image is tracked in git. This bloats the repo for every clone.
- **Fix:** Compress the image (lossy PNG or convert to WebP/JPEG — could drop to ~500KB). Consider Git LFS for assets this large.

### 14. `desktop/package-lock.json` tracked alongside pnpm workspace

- **File:** `desktop/package-lock.json` (600KB)
- **Issue:** The monorepo uses pnpm (per `pnpm-workspace.yaml` and root `package.json`), but `desktop/` has an npm `package-lock.json` tracked. This suggests desktop still uses npm, creating a split package manager situation.
- **Fix:** Migrate desktop to pnpm and remove `package-lock.json`, or document that desktop intentionally uses npm (e.g., because electron-forge requires it). Add `package-lock.json` to `.gitignore` if using pnpm.

### 15. `turbo.json` missing `outputs` for `app/` Vite build

- **File:** `turbo.json`, build task
- **Issue:** Build outputs are configured as `["dist/**", "lib/**"]` but app builds to `app/dist/` and desktop builds to `desktop/lib/`. These should work, but if any package uses a different output dir (e.g., `.next/`), caching will be wrong. More importantly, extension has no build step at all.
- **Fix:** Verify all packages' build output dirs match. Consider per-package turbo config if needed.

### 16. `extension/` has no `package.json`

- **File:** `extension/`
- **Issue:** Listed in `pnpm-workspace.yaml` as a workspace package, but has no `package.json`. This means `pnpm install` and `turbo` commands will error or skip it silently.
- **Fix:** Either add a minimal `package.json` to `extension/` or remove it from `pnpm-workspace.yaml`.

### 17. `docker-compose.yml` frontend exposes port 80 — conflicts with prod

- **File:** `docker-compose.yml`, line ~116
- **Issue:** Base compose maps frontend to host port 80. The dev override (`docker-compose.dev.yml`) maps to 5173. But if someone runs just `docker compose up` without the dev overlay, port 80 will be used — and will conflict with `docker-compose.prod.yml` which also uses 80 (via Caddy).
- **Fix:** Remove the port mapping from the base `docker-compose.yml` and keep it only in the overlay files.

### 18. `video-worker/` not in pnpm workspace

- **File:** `pnpm-workspace.yaml`
- **Issue:** `video-worker/` exists as a directory but isn't listed in the workspace. It's a Python/Docker-only component so this is acceptable, but it's invisible to turbo/pnpm.
- **Fix:** Document that `video-worker/` is a Python component built via Docker only. No pnpm workspace entry needed.

### 19. `.env.example` vs `.env` drift — missing `STEPT_ENCRYPTION_KEY`

- **Files:** `.env.example`, `.env`
- **Issue:** `.env.example` defines `STEPT_ENCRYPTION_KEY` (new name), but `.env` uses `ONDOKI_ENCRYPTION_KEY` (old name). Developers copying `.env.example` will have a non-functional key name because Docker Compose expects `ONDOKI_ENCRYPTION_KEY`.
- **Fix:** After renaming in compose files (finding #2), ensure `.env`, `.env.example`, and all compose files agree on `STEPT_ENCRYPTION_KEY`.

### 20. `deploy.yml` writes `ONDOKI_ENCRYPTION_KEY` in server `.env`

- **File:** `.github/workflows/deploy.yml`, line 148
- **Issue:** First-deploy `.env` template writes `ONDOKI_ENCRYPTION_KEY=${{ secrets.ONDOKI_ENCRYPTION_KEY }}`. Should use the new name.
- **Fix:** Change to `STEPT_ENCRYPTION_KEY=${{ secrets.STEPT_ENCRYPTION_KEY }}` (and rename the GitHub secret).

### 21. CHANGELOG references ".NET/WPF" desktop app

- **File:** `CHANGELOG.md`, line ~15
- **Issue:** Says "Desktop Sync — Upload recordings from the Stept Desktop app (.NET/WPF)". The desktop app is now Electron, not .NET/WPF.
- **Fix:** Update to "Upload recordings from the Stept Desktop app (Electron)".

---

## Low

### 22. `app/package.json` has no `license` field

- **File:** `app/package.json`
- **Issue:** Root `package.json` and `desktop/package.json` both specify `"license": "MIT"`, but `app/package.json` has no license field.
- **Fix:** Add `"license": "MIT"` to `app/package.json`.

### 23. `app/package.json` has generic name and version

- **File:** `app/package.json`, lines 2–4
- **Issue:** Name is `"app"` and version is `"0.0.0"`. Should be `"@stept/app"` or `"stept-app"` with a real version for clarity.
- **Fix:** Rename to `"@stept/app"` and set version to `"1.0.0"` or match root.

### 24. `desktop/package.json` uses npm scripts, not pnpm

- **File:** `desktop/package.json`
- **Issue:** All scripts use `npm run` internally (e.g., `"build": "npm run build:main && npm run build:renderer && ..."`). In a pnpm workspace, `pnpm run` is the expected runner.
- **Fix:** Cosmetic — pnpm can run npm scripts. But for consistency, consider changing to `pnpm run` or using turbo for orchestration.

### 25. `docs/` uses Mintlify structure but no build/deploy config

- **File:** `docs/mint.json`
- **Issue:** Documentation uses Mintlify (`.mdx` files, `mint.json`), but there's no CI job to deploy docs and no instructions on how to build/preview locally.
- **Fix:** Add a `docs:dev` script or document how to run `mintlify dev` locally. Consider adding a docs deploy workflow.

### 26. `Caddyfile` has no domain — uses bare `:443` and `:80`

- **File:** `Caddyfile`
- **Issue:** Uses port-based matchers (`:443`, `:80`) instead of domain-based. This works but means Caddy can't auto-provision Let's Encrypt certs. The setup relies on pre-placed origin certs.
- **Fix:** Consider using `{$DOMAIN}` placeholder for automatic HTTPS, or document the cert placement requirement in the self-hosting guide.

### 27. `.DS_Store` in repo root

- **File:** `.DS_Store`
- **Issue:** macOS metadata file at repo root. Already in `.gitignore` but the file exists locally.
- **Fix:** Remove with `git rm --cached .DS_Store` if tracked. Already handled by `.gitignore` for future.

### 28. `app/package-lock.json` tracked (466KB)

- **File:** `app/package-lock.json`
- **Issue:** Similar to desktop — npm lockfile tracked but the workspace uses pnpm. `app/pnpm-lock.yaml` also exists (307KB), so both lockfiles are present.
- **Fix:** Remove `app/package-lock.json` and add it to `.gitignore`. Keep only `pnpm-lock.yaml`.

### 29. Scripts lack executable permission check

- **Files:** `scripts/find-port.sh`, `scripts/run-tests-local.sh`, `scripts/run-tests.sh`, `scripts/setup-test-db.sh`
- **Issue:** Minor — scripts exist but aren't referenced from Makefile or CI. Their relationship to the `make test-*` targets is unclear.
- **Fix:** Either integrate into Makefile/CI or document their purpose. Ensure they have `chmod +x`.

### 30. `desktop/native/macos/window-info` binary tracked in git

- **File:** `desktop/native/macos/window-info` (324KB compiled binary)
- **Issue:** A compiled macOS binary is tracked directly in git. This is platform-specific and should be built from source or distributed separately.
- **Fix:** Add build instructions for native helpers. Consider using Git LFS or building in CI.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| **Critical** | 4 | `ONDOKI_*` env vars throughout all infrastructure |
| **High** | 8 | CI/CD image name mismatch, old repo references, missing dockerignore, unused shared package |
| **Medium** | 9 | Large tracked files, env var drift, workspace inconsistencies |
| **Low** | 9 | Missing license fields, naming conventions, docs config |

### Top 3 Actions Before Open-Source Release

1. **Rename all `ONDOKI_*` → `STEPT_*`** across compose files, CI, Makefile, `.env`, and deploy scripts (findings #2, #3, #4, #19, #20)
2. **Fix CI image names** to match `docker-compose.prod.yml` (finding #5) — production deploys are currently broken
3. **Update CONTRIBUTING.md** with correct repo URL and port (findings #6, #7)
