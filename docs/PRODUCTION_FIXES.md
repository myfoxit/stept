# Ondoki — Production Fix List

Generated: 2025-02-20 — based on full codebase audit of ondoki-web, ondoki-plugin-chrome, ondoki-cli, ondoki-desktop-electron, dataveil.

---

## Critical (must fix before any public launch)

| # | Component | Issue | File:Line | Fix |
|---|-----------|-------|-----------|-----|
| 1 | API | **Missing auth on ~10 process-recording endpoints** — `upload_session_metadata`, `upload_image`, `get_session_status`, `get_image`, `list_sessions` (x2), `update_workflow`, `delete_workflow`, `duplicate_workflow` accept `authorization: Optional[str] = Header(None)` but **never validate it**. Anyone can read/delete/modify any workflow. | `api/app/routers/process_recording.py:104-510` | Replace `authorization: Optional[str] = Header(None)` with `current_user: User = Depends(get_current_user)` on every endpoint. Add ownership checks. |
| 2 | API | **Missing auth on document list endpoint** — `GET /documents/` has no `get_current_user` dependency. Returns ALL documents for ALL users. | `api/app/routers/document.py:80-85` | Add `current_user: User = Depends(get_current_user)` and filter by user's projects. |
| 3 | API | **JWT secret defaults to hardcoded string** — `JWT_SECRET` defaults to `"your-secret-key-change-in-production"`. If env var is missing, all tokens are signed with a known key. | `api/app/config.py:7` | Remove default; crash on startup if `JWT_SECRET` not set in production. |
| 4 | API | **CORS Access-Control-Allow-Origin: \*** on image endpoint — returns `*` with `allow_credentials=true`, which is a browser-rejected contradiction but signals sloppy CORS thinking. | `api/app/routers/process_recording.py:348-349` | Remove manual CORS headers; let the middleware handle it. |
| 5 | API | **Test endpoints exposed in development** — `ENVIRONMENT=development` enables `/test/seed` and `/test/cleanup` which **TRUNCATE ALL TABLES**. | `api/main.py:94-96` | Only enable for `ENVIRONMENT=test`, never `development`. |
| 6 | API | **Default superuser password is "changethis"** — `FIRST_SUPERUSER_PASSWORD` defaults to `"changethis"` in config. | `api/app/core/config.py:47` | Crash on startup if default password is used in production. |
| 7 | Desktop | **Hardcoded localhost URLs everywhere** — `chat.ts:11`, `auth.ts:35-36`, `settings.ts:35-36,44` all hardcode `http://localhost:8000`. If user forgets to configure, desktop app hits localhost. | `ondoki-desktop-electron/src/main/settings.ts:35-44`, `auth.ts:35-36`, `chat.ts:11` | Load from settings only; show setup wizard if not configured. Remove hardcoded fallbacks. |
| 8 | Chrome Ext | **Default API URL is localhost** — `DEFAULT_API_BASE_URL = 'http://localhost:8000/api/v1'` and `host_permissions` includes `http://localhost:8000/*`. | `ondoki-plugin-chrome/background.js:1`, `manifest.json` | Require user to set server URL on first use; remove localhost from `host_permissions` in production build. |
| 9 | API | **No file upload validation** — `upload_image` accepts any file (no size limit, no type check, no filename sanitization). An attacker can upload GBs or malicious files. | `api/app/routers/process_recording.py:120-167` | Add file size limit (e.g., 10MB), validate content-type is image/*, sanitize filename. |

## High (should fix before launch, but won't break things)

| # | Component | Issue | File:Line | Fix |
|---|-----------|-------|-----------|-----|
| 10 | API | **No rate limiting on most endpoints** — only `auth/login`, `password_reset`, `public/*`, and `chat` have rate limiting. All other endpoints are unprotected. | Various | Add global rate limiter middleware or per-router limits. |
| 11 | API | **CORS regex too permissive by default** — `^https?://(localhost\|127\.0\.0\.1)(:\d+)?$` allows any port on localhost. In production, `CORS_ORIGIN_REGEX` must be set or it stays localhost-only (safe but broken). | `api/main.py:49` | Document that `CORS_ORIGIN_REGEX` MUST be set in production. Add startup check. |
| 12 | API | **traceback.print_exc() in production** — error handler in upload_image prints full traceback to stdout. | `api/app/routers/process_recording.py:165` | Use `logger.exception()` instead. |
| 13 | API | **~20 print() statements left in production code** — debug prints throughout `workflow_export.py` and `process_recording.py`. | `api/app/workflow_export.py:23-610`, `process_recording.py:341,825-840` | Replace all with `logger.debug()` or remove. |
| 14 | Frontend | **43 console.log statements** in production app code (mostly in docx-export and tiptap extensions). | `app/src/components/tiptap-extensions/docx-export/index.ts`, `pagination/index.ts` | Remove or gate behind `import.meta.env.DEV`. |
| 15 | API | **Returning error details in responses** — `upload_image` returns `str(e)` as `message` in successful-looking response (200 OK with `success=False`). Leaks internals. | `api/app/routers/process_recording.py:162-167` | Return proper HTTP error codes. Don't embed errors in 200 responses. |
| 16 | API | **No CSRF protection** — cookie-based auth with no CSRF tokens. The CORS middleware helps but isn't sufficient (e.g., form POSTs from other origins bypass CORS). | `api/app/security.py` | Add CSRF token validation for state-changing requests, or switch to `SameSite=Strict` cookies + verify Origin header. |
| 17 | Desktop | **30+ console.log statements** in production electron code — screenshots, recording, IPC handlers all log verbosely. | `ondoki-desktop-electron/src/main/screenshot.ts`, `recording.ts`, etc. | Gate behind debug flag or use proper logger. |
| 18 | API | **Session cookie lacks security attributes** — need to verify `Secure`, `HttpOnly`, `SameSite=Lax` flags are set on `session_ondoki` cookie. | `api/app/routers/auth.py` (cookie set location) | Ensure `Secure=True` (HTTPS only), `HttpOnly=True`, `SameSite=Lax`. |
| 19 | Desktop | **WS connection uses ws:// not wss://** — `auth.ts:36` hardcodes `ws://localhost:8000` with no TLS. | `ondoki-desktop-electron/src/main/auth.ts:36` | Derive ws/wss from the configured endpoint URL scheme. |

## Medium (fix soon after launch)

| # | Component | Issue | File:Line | Fix |
|---|-----------|-------|-----------|-----|
| 20 | Frontend | **TODO: step duplication not implemented** | `app/src/pages/workflow-view.tsx:309` | Implement or remove the UI button. |
| 21 | Frontend | **TODO: guide link update not implemented** | `app/src/pages/workflow-view.tsx:320` | Implement or remove. |
| 22 | Frontend | **TODO: real pop-over list in ComponentEditor** | `app/src/components/Editor/ComponentEditor.tsx:78` | Implement component picker. |
| 23 | API | **TODO: send invite email** — project invite doesn't actually send email. | `api/app/routers/project.py:184` | Implement email sending or remove invite feature from UI. |
| 24 | API | **Two competing config systems** — `api/app/config.py` (Settings with JWT_SECRET) AND `api/app/core/config.py` (Settings with SECRET_KEY). Duplicated, potentially conflicting. | `api/app/config.py`, `api/app/core/config.py` | Consolidate into one config file. |
| 25 | API | **`dotenv` package in requirements is wrong** — `dotenv==0.9.9` is not `python-dotenv`. The actual import uses `python-dotenv` (via `from dotenv import load_dotenv`). | `api/requirements.txt:4` | Change to `python-dotenv>=1.0.0`. |
| 26 | API | **init_db() uses SQLModel.metadata but models use Base** — `database.py:init_db` calls `SQLModel.metadata.create_all` but all models inherit from `Base` (declarative_base). Tables won't be created. | `api/app/database.py:56-59` | Use Alembic migrations only (which exists). Remove `init_db()` or fix it to use `Base.metadata`. |
| 27 | Chrome Ext | **host_permissions includes localhost** — `"http://localhost:8000/*"` in manifest will cause Chrome Web Store rejection. | `ondoki-plugin-chrome/manifest.json` | Remove; use `<all_urls>` or make configurable. |
| 28 | API | **No pagination on document list** — `GET /documents/` defaults to `limit=100` which could be too many. No total count returned. | `api/app/routers/document.py:80-85` | Return total count, enforce reasonable limits. |

## Low (nice to have)

| # | Component | Issue | File:Line | Fix |
|---|-----------|-------|-----------|-----|
| 29 | API | **aioredis is deprecated** — `aioredis==2.0.1` is unmaintained; `redis-py>=4.2` includes async support natively. | `api/requirements.txt` | Remove `aioredis`, use `redis[hiredis]` async client. |
| 30 | API | **bcrypt version pinned below 4.1** — `bcrypt<4.1` due to passlib incompatibility. passlib itself is unmaintained. | `api/requirements.txt` | Consider switching to `argon2-cffi` or `bcrypt` directly. |
| 31 | Frontend | **Tiptap util TODO** — "Needed?" comment on line 200. | `app/src/lib/tiptap-utils.ts:200` | Investigate and remove if dead code. |
| 32 | Desktop | **Two Chrome extensions exist** — `ondoki-plugin-chrome/` (recorder) and `ondoki-web/extension/` (context). Confusing for users. | Both repos | Merge into one extension or clearly differentiate. |
| 33 | CLI | **Compiled binary checked into git** — 9.5MB `ondoki` binary in repo root. | `ondoki-cli/ondoki` | Add to `.gitignore`, use releases instead. |
| 34 | API | **PROJECT_NAME still says "SnapRow"** — leftover from rename. | `api/app/core/config.py:44` | Change to "Ondoki". |

---

## Security Audit Summary

### Critical
- **Broken auth on process-recording endpoints** (#1) — entire workflow CRUD is unauthenticated
- **Broken auth on document list** (#2) — all documents exposed
- **Hardcoded JWT secret** (#3) — trivial token forgery
- **No file upload validation** (#9) — arbitrary file upload

### High
- **No CSRF protection** (#16) — cookie auth without CSRF tokens
- **Missing rate limiting** (#10) — only 3 of ~25 routers have rate limits
- **Session cookie security** (#18) — must verify Secure/HttpOnly/SameSite flags
- **CORS `Access-Control-Allow-Origin: *` with credentials** (#4)

### Medium
- No input validation on `session_id` parameters (used directly in file paths — potential path traversal)
- No audit logging on destructive operations (delete workflow, delete document)
- Test helper endpoint truncates all tables in development mode (#5)
- Tokens stored in Chrome extension `chrome.storage.local` (accessible to other extensions with permissions)

---

## Performance Concerns

| Issue | Location | Impact |
|-------|----------|--------|
| No obvious database indexes defined on `ProcessRecordingSession.user_id`, `project_id`, `folder_id` | Models need audit | Slow queries as data grows |
| `list_sessions` does `select(ProcessRecordingSession).order_by(created_at.desc())` — may need composite index | `process_recording.py:370` | Full table scan |
| Document listing has no project-scoped filter in base endpoint | `document.py:80` | Returns ALL docs |
| No query result caching for static workflows | General | Unnecessary DB load |
| `get_session_status` loads all steps then paginates in Python | `process_recording.py:290` | Loads full dataset for pagination |

---

## DevOps/Deployment

| Issue | Location | Fix |
|-------|----------|-----|
| **No env var documentation** — no `.env.example` found for production. Operators must guess required vars. | Root | Create `.env.example` with all required vars documented. |
| **No health check on frontend container** | `docker-compose.prod.yml` | Add healthcheck. |
| **No backup strategy documented** — postgres data volume has no backup config. | `docker-compose.prod.yml` | Document backup strategy. |
| **No monitoring/alerting** — no Sentry DSN set, no metrics endpoint. | `core/config.py` | Set up Sentry; add `/metrics` for Prometheus. |
| **Caddy config is minimal** — no security headers, no rate limiting at edge. | `Caddyfile` | Add `header` directives for CSP, HSTS, X-Frame-Options. |
| **Video worker runs all API code** — Celery worker image copies entire API, could run any endpoint code. | `video-worker/Dockerfile` | Slim down worker image to only needed modules. |
| **No CI/CD pipeline visible** — no GitHub Actions / deployment automation in ondoki-web. | Root | Add CI: lint, test, build, deploy. |
| **Redis has no persistence config** — rate limit state and cache lost on restart. | `docker-compose.prod.yml` | Acceptable for rate limiting; document. |
