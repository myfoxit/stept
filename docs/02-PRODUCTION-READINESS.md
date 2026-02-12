# Ondoki v2 — Technical & Architectural Changes for Production

> Last updated: 2026-02-11  
> Honest assessment. No sugarcoating.

---

## Executive Summary

Ondoki has impressive feature breadth for a prototype — 90+ API endpoints, 10 AI tools, RAG search, desktop+web sync, 5 LLM providers. But almost everything is built for **"demo day"** not **"day 2,000"**. There's zero test coverage, no rate limiting, no API key encryption, no CI/CD, and several architectural decisions that will break under real load or attract security incidents.

This document lists every issue, prioritized:
- **P0**: Will lose customer data, get hacked, or crash in production
- **P1**: Will cause scaling pain, support tickets, or churn within months
- **P2**: Technical debt that slows development or limits features

---

## 1. Security (Multiple P0s)

### P0: API Keys Stored Unencrypted in Database

**Current**: `app_settings` table stores LLM API keys as plaintext JSON.  
**Risk**: Any DB access (backup leak, SQL injection, employee access) exposes all API keys.  
**Fix**: Encrypt at rest using Fernet symmetric encryption. Key from env var, never in DB.

```python
# services/crypto.py
from cryptography.fernet import Fernet
import os

_key = os.environ["ONDOKI_ENCRYPTION_KEY"]  # 32-byte base64
_fernet = Fernet(_key)

def encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()

def decrypt(ciphertext: str) -> str:
    return _fernet.decrypt(ciphertext.encode()).decode()
```

**Effort**: S (1-2 hours). Encrypt on save, decrypt on load in `llm.py`.

### P0: No Input Validation on AI Tool Parameters

**Current**: Tool `execute()` functions receive args directly from LLM output. A crafted prompt could inject malicious parameters (SQL-like folder names, path traversal in names).  
**Risk**: Indirect prompt injection → data manipulation.  
**Fix**: Pydantic validation on every tool's `execute()` input. Sanitize all string inputs. Limit name lengths.

**Effort**: M (4-6 hours for all 10 tools).

### P0: No Rate Limiting on LLM Endpoints

**Current**: Any authenticated user can call `/chat/completions` and `/chat/inline` unlimited times.  
**Risk**: One user burns through entire API budget. Denial-of-wallet attack.  
**Fix**: Token bucket rate limiter per user. Use Redis (already in stack).

```python
# middleware/rate_limit.py
from fastapi import Request, HTTPException
import redis.asyncio as redis

async def check_rate_limit(user_id: str, endpoint: str, r: redis.Redis):
    key = f"rl:{user_id}:{endpoint}"
    current = await r.incr(key)
    if current == 1:
        await r.expire(key, 60)  # 60-second window
    if current > 20:  # 20 requests per minute
        raise HTTPException(429, "Rate limit exceeded")
```

**Effort**: S (2-3 hours).

### P0: No CSRF Protection

**Current**: Cookie-based auth with no CSRF tokens.  
**Risk**: Cross-site request forgery on state-changing endpoints.  
**Fix**: SameSite=Strict cookies + CSRF token header validation.

**Effort**: S (1-2 hours).

### P1: No RBAC on AI Tools

**Current**: All authenticated users can use all tools. No per-project permission checks on tool execution.  
**Risk**: User A's chat could create folders in User B's project if `project_id` is guessed/known.  
**Fix**: Every tool must verify `user.id` has access to the target project/workflow before executing.

**Effort**: M (3-4 hours — audit all 10 tools).

### P1: JWT Secret Rotation

**Current**: Single static JWT secret. No rotation mechanism.  
**Fix**: Support multiple active secrets with oldest-first validation. Add rotation endpoint for admin.

**Effort**: S (2 hours).

### P2: No Audit Logging

**Current**: No record of who did what, when.  
**Fix**: Middleware that logs user_id + action + target + timestamp to audit table.

**Effort**: M (4-6 hours).

---

## 2. Architecture (Multiple P0/P1)

### P0: SSE Streams Hold Database Sessions

**Current**: `chat_completion_stream()` holds an async DB session open for the entire SSE stream duration (could be minutes). If user disconnects mid-stream, the session may not be properly cleaned up.  
**Risk**: Connection pool exhaustion under load. Deadlocks.  
**Fix**: Open DB session only when needed (for tool execution), close immediately after. Don't pass `db` session through the entire stream generator.

```python
# Instead of:
async def stream(db: AsyncSession):
    async for chunk in llm.stream():
        if chunk.is_tool_call:
            result = await tool.execute(args, db, user)  # db held open entire time
        yield chunk

# Do:
async def stream():
    async for chunk in llm.stream():
        if chunk.is_tool_call:
            async with AsyncSessionLocal() as db:  # fresh session per tool call
                result = await tool.execute(args, db, user)
                await db.commit()
        yield chunk
```

**Effort**: M (3-4 hours). Requires refactoring `chat.py` stream handlers.

### P0: No Health Checks

**Current**: No `/health` or `/ready` endpoint. Docker has no health checks configured.  
**Risk**: Container stays "running" even when DB is unreachable or LLM service is down.  
**Fix**: Add `/health` (basic liveness) and `/ready` (checks DB + Redis + LLM connectivity).

```yaml
# docker-compose.yml
backend:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

**Effort**: S (1-2 hours).

### P1: Celery Exists But AI Tasks Are Synchronous

**Current**: `celery-worker` service runs in Docker. But all AI processing (annotation, guide generation, embedding) runs synchronously in request handlers.  
**Risk**: Long-running AI tasks block HTTP workers. 10-step annotation can take 30+ seconds.  
**Fix**: Move these to Celery tasks:
1. Batch annotation (`/workflow/{id}/process`)
2. Embedding generation (on create/update)
3. Guide generation
4. Bulk re-indexing

Return immediately with a `task_id`, poll status via `/workflow/{id}/status`.

**Effort**: L (1-2 days). Need task results storage, status polling endpoints, frontend task tracking UI.

### P1: No Graceful LLM Degradation

**Current**: If LLM provider is down or API key invalid, features silently fail or return 500s.  
**Risk**: Entire annotation/chat/search UX breaks when LLM is unavailable.  
**Fix**: 
1. Circuit breaker pattern — after N failures, stop trying for cooldown period
2. Show clear "AI unavailable" state in frontend
3. Fall back gracefully (e.g., manual titles instead of AI-generated)
4. Cache recent LLM responses for common queries

**Effort**: M (4-6 hours).

### P1: No API Versioning

**Current**: All endpoints are unversioned. Any breaking change breaks all clients.  
**Fix**: Prefix all routes with `/api/v1/`. Add version negotiation header.

**Effort**: M (3-4 hours — mostly find-replace, but need to update desktop client + frontend API layer).

### P1: No WebSocket Support

**Current**: All real-time features use SSE (server → client only).  
**Risk**: Can't build collaborative editing, real-time chat, or live recording preview.  
**Fix**: Add WebSocket endpoint for bidirectional communication. FastAPI supports this natively.

**Effort**: L (1-2 days for proper implementation with rooms/channels).

### P2: No Caching Layer

**Current**: Every request hits the database. No Redis caching despite Redis being in the stack.  
**Risk**: Unnecessary DB load, slow responses for repeated queries.  
**Fix**: Cache workflow metadata, folder trees, search results. Invalidate on mutation.

**Effort**: M (4-6 hours).

### P2: Monolithic Backend

**Current**: Single FastAPI app handles auth, content, AI, search, exports, file storage.  
**Fix**: Not urgent to split, but extract AI/LLM services into a separate internal service when scaling becomes necessary.

**Effort**: XL (only do this when actually needed).

---

## 3. Database (P1s)

### P1: Missing Indexes

**Current**: No explicit indexes on commonly queried fields.  
**Fix**: Add indexes on:
```sql
CREATE INDEX idx_steps_session ON process_recording_step(session_id);
CREATE INDEX idx_steps_annotated ON process_recording_step(is_annotated);
CREATE INDEX idx_folders_project ON folder(project_id);
CREATE INDEX idx_folders_parent ON folder(parent_id);
CREATE INDEX idx_documents_folder ON document(folder_id);
CREATE INDEX idx_embeddings_type_id ON embedding(content_type, content_id);
CREATE INDEX idx_sessions_user ON process_recording_session(user_id);
CREATE INDEX idx_app_settings_key ON app_settings(key);
```

**Effort**: S (1 hour — new Alembic migration).

### P1: No Connection Pool Monitoring

**Current**: Default SQLAlchemy pool settings. No visibility into pool exhaustion.  
**Risk**: Silent connection starvation under load.  
**Fix**: Configure pool explicitly, add pool event listeners that log warnings at 80% capacity.

```python
engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
    echo_pool=True,  # log pool checkouts
)
```

**Effort**: S (1 hour).

### P1: Migrations Not Idempotent

**Current**: Running `alembic upgrade head` twice could fail if partial state exists.  
**Fix**: Use `op.execute()` with `IF NOT EXISTS` guards. Test migrations against empty and populated DBs.

**Effort**: S (2 hours).

### P2: No Soft Deletes

**Current**: `DELETE` removes rows permanently.  
**Fix**: Add `deleted_at` timestamp column. Filter in queries. Purge job for old deletions.

**Effort**: M (4-6 hours — touches all CRUD operations).

### P2: Large Workflows Load Eagerly

**Current**: `GET /workflow/{id}` loads ALL steps with ALL metadata in one query.  
**Risk**: 50+ step workflow = huge response. Slow on mobile.  
**Fix**: Paginate steps. Lazy-load screenshots. Return step summaries first, detail on expand.

**Effort**: M (4-6 hours — backend pagination + frontend virtual scroll).

---

## 4. Performance (P1/P2)

### P1: Embedding Generation Is Synchronous

**Current**: Creating/updating a workflow blocks the HTTP response while generating embeddings via OpenAI API (~1-3 seconds).  
**Fix**: Fire-and-forget via Celery task. Or use database trigger + background worker.

**Effort**: S (2 hours with Celery).

### P1: No CDN for Screenshots

**Current**: Screenshots served from backend filesystem via FastAPI `FileResponse`.  
**Risk**: Backend becomes a bottleneck for static files. No caching headers. No edge delivery.  
**Fix**: 
1. Short-term: Serve via nginx directly (already in stack)
2. Medium-term: Upload to S3-compatible storage + CloudFront/Cloudflare CDN

**Effort**: S (nginx static serving) / M (S3 + CDN).

### P2: No Image Optimization

**Current**: Screenshots stored and served at original resolution.  
**Fix**: Generate thumbnails on upload (e.g., 400px, 800px, full). Serve appropriate size per context. WebP format.

**Effort**: M (4-6 hours — Pillow/sharp processing + multiple sizes).

### P2: No Response Compression

**Current**: No gzip/brotli on API responses.  
**Fix**: Add `GZipMiddleware` to FastAPI. Configure nginx for static asset compression.

**Effort**: S (30 minutes).

---

## 5. Testing (P0)

### P0: Zero Tests

**Current**: No unit tests, no integration tests, no E2E tests. Nothing.  
**Risk**: Every change is deployed on prayer. Regressions guaranteed.  
**Fix (phased)**:

**Phase 1 — Critical Path** (1-2 days):
- Auth flow (register → login → token refresh)
- Workflow CRUD (create session → upload steps → finalize)
- AI tool execution (mock LLM, test tool logic)
- Chat completions (mock LLM, verify SSE format)

**Phase 2 — Integration** (2-3 days):
- Database operations (real test DB with transactions)
- Search (embedding + keyword)
- Export generation (all 4 formats)

**Phase 3 — E2E** (3-5 days):
- Playwright tests for critical frontend flows
- Desktop → Web upload flow

**Stack**: pytest + pytest-asyncio + httpx (async test client) + factory_boy (fixtures)

**Effort**: L (1 week for Phase 1+2).

---

## 6. Frontend (P1/P2)

### P1: No Error Boundaries

**Current**: Any component crash = white screen of death.  
**Fix**: Wrap route-level components in React error boundaries with fallback UI.

**Effort**: S (1-2 hours).

### P1: No Loading/Error States for AI Features

**Current**: Chat and inline AI have basic loading indicators. But failures show nothing useful.  
**Fix**: Proper error messages ("LLM provider not configured", "API key expired", "Rate limited"). Retry buttons.

**Effort**: M (3-4 hours).

### P2: No Optimistic Updates

**Current**: Every mutation waits for server response before updating UI.  
**Fix**: Optimistic update for common actions (rename, reorder, delete) with rollback on failure.

**Effort**: M (4-6 hours).

### P2: No Offline Support

**Current**: App requires constant server connection. No service worker.  
**Fix**: Not critical for MVP. Consider for desktop web-clip feature later.

**Effort**: L (skip for now).

### P2: Bundle Size Not Optimized

**Current**: Unknown bundle size. No code splitting beyond route-level.  
**Fix**: Analyze with `vite-bundle-visualizer`. Lazy-load heavy components (TipTap editor, Chat panel). Tree-shake icons.

**Effort**: S (2-3 hours).

---

## 7. DevOps (P1s)

### P1: No CI/CD Pipeline

**Current**: Manual `git push` + manual Docker rebuild.  
**Fix**: GitHub Actions workflow:
1. On PR: lint + type-check + tests
2. On merge to main: build Docker images → push to registry → deploy
3. Alembic migration check (compare head to DB)

**Effort**: M (4-6 hours).

### P1: No Staging Environment

**Current**: Development → production directly.  
**Fix**: Docker Compose profiles (`--profile staging`). Or separate `.env.staging`.

**Effort**: S (2-3 hours).

### P1: No Backup Strategy

**Current**: No automated database backups.  
**Fix**: pg_dump cron job to S3. Test restores monthly.

**Effort**: S (2 hours).

### P1: No Logging Infrastructure

**Current**: Python `logging` to stdout. No structured logging. No aggregation.  
**Fix**: 
1. Structured JSON logging (python-json-logger)
2. Correlate requests with request_id
3. Ship to Loki/CloudWatch/whatever
4. Dashboard for errors, slow queries, LLM failures

**Effort**: M (4-6 hours for structured logging + request correlation).

### P2: No Resource Limits in Docker

**Current**: Containers can consume unlimited resources.  
**Fix**: Set memory/CPU limits per service in `docker-compose.yml`.

**Effort**: S (30 minutes).

### P2: Secrets in .env File

**Current**: All secrets in `.env` file.  
**Fix**: Docker secrets or external secret manager (Vault/AWS Secrets Manager) for production.

**Effort**: M (depends on infrastructure choice).

---

## 8. LLM-Specific Issues (P1s)

### P1: No Token Budget / Cost Tracking

**Current**: No tracking of token usage, no cost estimation, no spending alerts.  
**Risk**: Surprise $500 API bill.  
**Fix**: 
1. Count input/output tokens per request (from LLM response headers)
2. Store in `llm_usage` table (user_id, model, input_tokens, output_tokens, cost_estimate, timestamp)
3. Dashboard showing usage trends
4. Configurable monthly budget with hard cutoff

**Effort**: M (4-6 hours).

### P1: No Prompt Versioning

**Current**: System prompts hardcoded in Python files. Changes require redeployment.  
**Fix**: Store prompts in DB or config files. Version them. A/B test different prompts.

**Effort**: M (4-6 hours).

### P1: No LLM Response Caching

**Current**: Every identical question = new LLM call.  
**Fix**: Content-hash cache in Redis. Same prompt + same context = cached response. TTL-based expiry.

**Effort**: S (2-3 hours).

### P2: No Streaming Error Recovery

**Current**: If SSE stream breaks mid-response, content is lost.  
**Fix**: Buffer streamed content server-side. Allow client to resume from last received chunk.

**Effort**: M (4-6 hours).

---

## Priority Summary

| Priority | Count | Theme |
|----------|-------|-------|
| **P0** | 6 | Security (encryption, validation, rate limiting, CSRF), DB sessions in SSE, zero tests |
| **P1** | 18 | Architecture (health, degradation, versioning), DB (indexes, pool), DevOps (CI/CD, backups, logging), LLM (budgets, caching), Frontend (errors) |
| **P2** | 10 | Polish (caching, soft deletes, pagination, bundle size, offline, resource limits) |

### Recommended Order of Attack

1. **Week 1**: P0 security (encryption, rate limiting, input validation, CSRF) + health checks
2. **Week 2**: Tests (Phase 1 — auth, workflow CRUD, AI tools) + CI/CD pipeline
3. **Week 3**: DB indexes + connection pool + SSE refactor + error boundaries
4. **Week 4**: LLM token tracking + caching + graceful degradation + logging
5. **Ongoing**: P2 items as capacity allows
