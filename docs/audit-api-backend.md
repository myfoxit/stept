# API Backend Audit — Open-Source Release Readiness

**Auditor:** Automated deep audit  
**Date:** 2026-03-14  
**Scope:** `api/` directory — all Python files, config, templates, migrations  

---

## Critical

### 1. SSO Admin Endpoints Have No Authorization Check

**File:** `api/app/routers/sso_admin.py`, lines 55–58  
**Issue:** The `_require_admin()` dependency is supposed to restrict SSO management to admins, but it just returns the authenticated user with no actual role/permission check. **Any authenticated user can create, update, and delete SSO configurations**, including setting arbitrary `client_secret` values and enabling `auto_create_users`.

```python
async def _require_admin(user: User = Depends(get_current_user)) -> User:
    """For now, only the first registered user (lowest id) is admin."""
    # Simple admin check — extend later with a proper role system
    return user
```

**Fix:** Implement a real admin check (e.g., check `user.is_admin`, or compare against the first registered user as the comment suggests). At minimum, verify the user has an admin role before allowing SSO config mutations.

---

### 2. Duplicate, Divergent Settings Classes

**Files:**  
- `api/app/config.py` — `Settings` class (imported as `from app.config import settings`)  
- `api/app/core/config.py` — `Settings` class (imported as `from app.core.config import settings`)  

**Issue:** Two completely separate `Settings` singletons exist with overlapping but different fields. Different modules import from different locations:

| Module | Imports from |
|---|---|
| `auth.py`, `enterprise_api.py`, `emails.py`, `security.py`, `jwt.py`, `rate_limit.py`, `health.py` | `app.config` |
| `tts.py`, `transcription.py`, `project.py`, `llm.py`, `sendcloak.py`, `translation.py`, `process_recording crud` | `app.core.config` |

The `app.core.config.Settings` has fields like `SENDCLOAK_ENABLED`, `TTS_PROVIDER`, `LLM_PROVIDER`, `ENVIRONMENT`, `FIRST_SUPERUSER_PASSWORD` that don't exist in `app.config.Settings`, and vice versa. This means:
- Feature flags may silently be ignored depending on which settings object is queried.
- `ENVIRONMENT` is only in `app.core.config` — code using `app.config` falls back to `os.getenv()`.

**Fix:** Consolidate into a single Settings class. Audit every import site and unify to one canonical location.

---

### 3. `FIRST_SUPERUSER_PASSWORD` Defaults to `"changethis"`

**File:** `api/app/core/config.py`, line 67  
**Issue:** While there's a production validator that raises if unchanged, this default leaks into the open-source codebase and may be missed in staging/local deployments. The string `"changethis"` as a default password is a known anti-pattern.

**Fix:** Default to empty string `""` and require explicit setting in all environments (or at least warn loudly in non-production too).

---

## High

### 4. Legacy "ONDOKI" Environment Variable Fallbacks

**Files and lines:**
- `api/app/services/crypto.py:33` — `os.environ.get("ONDOKI_ENCRYPTION_KEY")`
- `api/app/services/crypto.py:5` — docstring mentions `ONDOKI_ENCRYPTION_KEY`
- `api/app/mcp_server.py:52` — docstring: "uses ONDOKI_API_KEY env var"
- `api/app/mcp_server.py:58` — `os.environ.get("ONDOKI_API_KEY")`
- `api/app/routers/video_import.py:19` — `os.getenv("ONDOKI_UPLOAD_DIR")`

**Issue:** References to the old product name "ondoki" in env var fallbacks. These should be removed before open-source release to avoid confusion and to complete the rebranding.

**Fix:** Remove all `ONDOKI_*` env var fallbacks. Keep only `STEPT_*` variants. Update documentation to reflect new variable names.

---

### 5. Legacy "SR_" (SnapRow) SMTP Environment Variable Fallbacks

**File:** `api/app/config.py`, lines 15–20  
**Issue:** SMTP config falls back to `SR_SMTP_HOST`, `SR_SMTP_PORT`, `SR_SMTP_USER`, `SR_SMTP_PASS`, `SR_FROM_EMAIL` — remnants of the "SnapRow" era.

```python
SMTP_HOST: str = os.getenv("SMTP_HOST", os.getenv("SR_SMTP_HOST", "127.0.0.1"))
```

**Fix:** Remove all `SR_*` fallbacks. Use only `SMTP_*` env vars.

---

### 6. "ProcessRecorder" Hardcoded as Client Name

**Files:**
- `api/app/models.py:273` — `client_name = Column(String, nullable=False, default="ProcessRecorder")`
- `api/app/schemas/process_recording.py:27` — `client: Optional[str] = "ProcessRecorder"`
- `api/app/crud/process_recording.py:29` — `client_name: str = "ProcessRecorder"`
- `api/app/routers/process_recording.py:237` — `client_name=session_data.client or "ProcessRecorder"`
- `api/app/routers/process_recording.py:527` — `if not session.client_name or session.client_name == "ProcessRecorder"`
- `api/app/routers/auth.py:578` — `"device_name": "ProcessRecorder Desktop"`
- `api/alembic/versions/001_initial.py:150` — `server_default="ProcessRecorder"`

**Issue:** "ProcessRecorder" is the old internal name for the desktop recording client. It's exposed in API responses, stored in the database, and referenced in the OAuth device info endpoint.

**Fix:** Rename to a brand-neutral term (e.g., `"SteptRecorder"` or `"desktop"`) throughout. Note: the migration `001_initial.py` sets a `server_default`, so existing DB rows will still have the old value — consider a data migration or leave as-is for backward compatibility.

---

### 7. "sr_" Dynamic Table Pattern in Alembic

**File:** `api/alembic/env.py`, line 30  
**Issue:** `DYNAMIC_TABLE_RE = re.compile(r"^sr_[A-Za-z0-9]{5}_")` — this regex filters out tables prefixed with `sr_` (SnapRow). If the product was rebranded, the prefix should match the new naming convention.

**Fix:** Either rename to `st_` or document why `sr_` is still used.

---

### 8. SQL Queries Use f-strings for ORDER BY and WHERE Clauses

**Files:**
- `api/app/routers/enterprise_api.py`, lines 314–323, 335–343, 473–481, 493–501
- `api/app/mcp_server.py`, lines 137–145

**Issue:** The `ORDER BY {order}` and `{date_filters}` / `{project_filter}` clauses are injected via f-strings into `sa_text()`. While the `order` variable is derived from a validated enum-like `sort_by` parameter (constrained by Pydantic regex), and `date_filters`/`project_filter` are built from hardcoded strings (not user input), this pattern is fragile and would be flagged by any security scanner. A future refactor could accidentally introduce injection.

**Fix:** Use SQLAlchemy's `text().columns()` or build the query with the ORM query builder instead of raw SQL with string interpolation. At minimum, add a comment explaining why it's safe (input is validated upstream).

---

## Medium

### 9. `datetime.utcnow()` Usage (Deprecated)

**Files:** ~20 occurrences across:
- `api/app/routers/auth.py:634,666,720`
- `api/app/routers/chat.py:647`
- `api/app/routers/document.py:251,281,399,446,464`
- `api/app/routers/process_recording.py:57,2108`
- `api/app/routers/search.py:1478`
- `api/app/routers/project.py:193,247`
- `api/app/tasks/ai_tasks.py:110`
- `api/app/crud/media_jobs.py:85`
- `api/app/crud/document.py:338`
- `api/app/crud/process_recording.py:142,227,278`

**Issue:** `datetime.utcnow()` is deprecated in Python 3.12+ in favor of `datetime.now(timezone.utc)`. Mixing timezone-naive and timezone-aware datetimes causes subtle comparison bugs. Some code already uses `datetime.now(dt.timezone.utc)` — inconsistent.

**Fix:** Replace all `datetime.utcnow()` with `datetime.now(timezone.utc)`. Standardize on timezone-aware datetimes.

---

### 10. Grammar Error in Email Template

**File:** `api/app/templates/email/verify.html`, line 48  
**Issue:** "You received this email because you created **an** Stept account" — should be "**a** Stept account" (Stept starts with a consonant sound).

**Fix:** Change "an Stept" to "a Stept".

---

### 11. TODO Comments Requiring Resolution

**Files:**
- `api/app/routers/context_links.py:451` — `# TODO: per-user view tracking`
- `api/app/routers/context_links.py:452` — `# TODO: onboarding status`
- `api/app/routers/project.py:197` — `# TODO: send invite email to request.email`
- `api/app/services/context_scoring.py:123` — `# TODO: check resource tags once tagging feature ships.`

**Fix:** Either implement or convert to tracked issues. The invite email TODO (project.py:197) is especially important — invites may silently fail without sending emails.

---

### 12. CORS Wildcard for Public/Enterprise/TTS Endpoints

**File:** `api/main.py`, lines 107–124 (`PublicCorsMiddleware`)  
**Issue:** The `PublicCorsMiddleware` sets `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: *` for all requests to `/api/v1/public/`, `/api/v1/tts/`, and `/api/v1/enterprise/`. While this is intentional for embed support, the enterprise API endpoint with `*` CORS could be surprising — enterprise endpoints are API-key authenticated and wide-open CORS combined with credential-bearing headers could have security implications.

**Fix:** Consider restricting enterprise CORS to specific origins or at least documenting this is intentional. The `*` origin disables credential forwarding per spec, so cookies won't be sent, but API keys in headers will work.

---

### 13. Test User Deletion Endpoint in Non-Production

**File:** `api/app/routers/auth.py`, lines ~520–530 (`test_delete_user`)  
**Issue:** `DELETE /api/v1/auth/test-utils/users/{email}` is available in any non-production environment (not just "test"). The guard checks `ENVIRONMENT != "production"` and either localhost or `E2E_ENABLE_DELETE_USER=1`. In staging environments, this endpoint is accessible from localhost.

**Fix:** Restrict to `ENVIRONMENT == "test"` only, or require both conditions (test env + localhost).

---

### 14. `stept://` in Default CORS Origins

**File:** `api/app/config.py`, line 55  
**Issue:** `BACKEND_CORS_ORIGINS` defaults to `"http://localhost:5173,stept://"`. The `stept://` custom protocol is for the desktop app. Ensure this doesn't conflict with CORS parsing (not a standard origin format).

**Fix:** Verify that CORSMiddleware handles custom protocol schemes correctly. If not, use a different mechanism for desktop app CORS.

---

## Low

### 15. Alembic Migration Docstring Inconsistency

**File:** `api/alembic/versions/027_add_step_element_info.py`, line 7  
**Issue:** The docstring says `Revises: 026_context_link_scoring` but `down_revision = "026"`. Alembic uses the `down_revision` variable, not the docstring, so this is cosmetic but confusing.

**Fix:** Update the docstring to `Revises: 026`.

---

### 16. `database_url_test` Uses Non-Standard Naming

**File:** `api/app/config.py`, line 13  
**Issue:** `database_url_test` uses snake_case while all other fields use UPPER_SNAKE_CASE. Similarly, `use_postgres` (line 12) deviates from convention.

**Fix:** Rename to `DATABASE_URL_TEST` and `USE_POSTGRES` for consistency, or remove if unused (they appear to be legacy fields).

---

### 17. Test Config Has Hardcoded Database Credentials

**File:** `api/app/core/test_config.py`, lines 10–11  
**Issue:** Default test database URL includes `postgres:postgres` credentials. This is normal for local dev/test but should be documented as test-only defaults.

```python
TEST_DATABASE_URL: str = os.getenv("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/stept_test")
```

**Fix:** Add a comment clarifying these are local-only test defaults. Already uses env var override, so this is acceptable.

---

### 18. `FIRST_SUPERUSER` Default Email

**File:** `api/app/core/config.py`, line 66  
**Issue:** `FIRST_SUPERUSER: EmailStr = "admin@example.com"` — if this is used to seed a superuser, the default email is an externally-owned domain. In an open-source release, someone could register `admin@example.com` on their instance.

**Fix:** Document that this must be changed, or use a more obviously placeholder value like `admin@stept.local`.

---

### 19. Unused `Base` Import in `database.py`

**File:** `api/app/database.py`, line 13  
**Issue:** `Base = declarative_base()` is created and exported from `database.py`, but `models.py` uses `SQLModel` base classes. The `Base` is imported in `alembic/env.py` for metadata, but the metadata comes from `SQLModel.metadata` via `init_db()`. This creates potential confusion about which metadata source is authoritative.

**Fix:** Verify that `Base.metadata` and `SQLModel.metadata` are synchronized. If models only use SQLModel, consider removing the separate `Base` or explicitly tying them together.

---

### 20. Copilot Auth Provider Token Persistence

**File:** `api/main.py`, lines 29–33  
**Issue:** On startup, `load_persisted_token()` is called to restore a Copilot auth token. This implies tokens are persisted to disk/DB. Ensure the persistence mechanism doesn't store tokens in plaintext in the repo or in easily-accessible locations.

**Fix:** Verify `app/services/auth_providers/copilot.py` stores tokens securely (e.g., encrypted with the Fernet key from `crypto.py`).

---

### 21. SendCloak Internal Service URL

**File:** `api/app/core/config.py`, line 147  
**Issue:** `SENDCLOAK_URL: str = "http://sendcloak:9090"` — this Docker service hostname is internal infrastructure. Not a security issue (it's a default), but may confuse open-source users.

**Fix:** Add a comment explaining this is an optional internal service and the default is only relevant for Docker Compose deployments.

---

### 22. Gotenberg Internal Service URL

**File:** `api/app/core/config.py`, line 131  
**Issue:** `GOTENBERG_URL: str = os.getenv("GOTENBERG_URL", "http://gotenberg:3000")` — same as above, internal Docker service hostname.

**Fix:** Document or make the default more obviously a placeholder.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 5 |
| Medium | 6 |
| Low | 8 |

**Top priorities for open-source release:**
1. Fix SSO admin authorization (Critical #1)
2. Consolidate duplicate Settings classes (Critical #2)
3. Remove all `ONDOKI_*` / `SR_*` / `ProcessRecorder` references (High #4, #5, #6)
4. Replace deprecated `datetime.utcnow()` calls (Medium #9)
5. Restrict test endpoints to test environment only (Medium #13)
