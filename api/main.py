import os
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager

from app.routers import auth, text_container, user, project, document, process_recording, folder, chat, search, inline_ai, auth_providers, health, shared, context_links, comments, git_sync, mcp_keys, audit, knowledge, analytics, upload, privacy, sso_admin, tts, enterprise_api, translation, transcription, video_import, staleness
from app.logging_config import setup_logging, RequestIdMiddleware

from app.database import Base, engine, AsyncSessionLocal
from app.core.config import settings

# Configure structured logging early
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load DB-backed LLM config into memory
    from app.services.llm import load_db_config
    try:
        await load_db_config()
    except Exception:
        pass  # DB may not be ready; env vars used as fallback

    # Startup: restore persisted Copilot token if available
    from app.services.auth_providers.copilot import load_persisted_token
    try:
        await load_persisted_token()
    except Exception:
        pass  # Not critical — user can re-authenticate

    # Startup: launch verification scheduler + worker as background tasks
    # Skip in test environment to avoid DB connection conflicts
    import asyncio
    _bg_tasks = []
    if settings.ENVIRONMENT != "test" and os.environ.get("PYTEST_CURRENT_TEST") is None:
        try:
            from app.services.verification_scheduler import verification_scheduler_loop
            from app.services.playwright_worker import verification_worker_loop
            _bg_tasks.append(asyncio.create_task(verification_scheduler_loop()))
            _bg_tasks.append(asyncio.create_task(verification_worker_loop()))
        except Exception:
            pass  # Playwright may not be installed — verification features disabled

    yield

    # Shutdown: cancel background tasks
    for task in _bg_tasks:
        task.cancel()
    if _bg_tasks:
        await asyncio.gather(*_bg_tasks, return_exceptions=True)


app = FastAPI(title="Ondoki", lifespan=lifespan)

# Versioned API router
api_router = APIRouter(prefix=settings.API_V1_STR)


app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(RequestIdMiddleware)

# Security headers middleware
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

        # Allow embedding for embed routes; deny framing for everything else
        path = request.url.path
        is_embed = "/public/workflow/" in path and path.rstrip("/").endswith("/embed")
        is_public_asset = "/public/" in path

        if is_embed:
            # No X-Frame-Options — allow framing from any origin
            response.headers["Content-Security-Policy"] = "frame-ancestors *"
        else:
            response.headers["X-Frame-Options"] = os.getenv("X_FRAME_OPTIONS", "DENY")
            csp = os.getenv("CSP_POLICY", "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'")
            response.headers["Content-Security-Policy"] = csp

        if os.getenv("ENVIRONMENT", "local") == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# CORS: prefer explicit CORS_ORIGINS (comma-separated) over regex
_cors_origins_str = os.getenv("CORS_ORIGINS", "")
_cors_origins = [o.strip() for o in _cors_origins_str.split(",") if o.strip()] if _cors_origins_str else []
_cors_origin_regex = os.getenv("CORS_ORIGIN_REGEX", r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$") if not _cors_origins else None
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or [],
    allow_origin_regex=_cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# Permissive CORS for /api/v1/public/* — allows embeds on any domain
from starlette.middleware.base import BaseHTTPMiddleware as _BHTTPM

class PublicCorsMiddleware(_BHTTPM):
    """Override CORS for public endpoints to allow any origin (no credentials)."""
    async def dispatch(self, request, call_next):
        is_public = request.url.path.startswith("/api/v1/public/") or request.url.path.startswith("/api/v1/tts/") or request.url.path.startswith("/api/v1/enterprise/")
        origin = request.headers.get("origin", "")

        if is_public and origin:
            if request.method == "OPTIONS":
                from starlette.responses import Response
                resp = Response(status_code=204)
                resp.headers["Access-Control-Allow-Origin"] = "*"
                resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
                resp.headers["Access-Control-Allow-Headers"] = "*"
                resp.headers["Access-Control-Max-Age"] = "86400"
                return resp
            response = await call_next(request)
            response.headers["Access-Control-Allow-Origin"] = "*"
            return response
        return await call_next(request)

app.add_middleware(PublicCorsMiddleware)


# Register all feature routers under the versioned router
api_router.include_router(user.router,    prefix="/users",    tags=["users"])
api_router.include_router(project.router, prefix="/projects", tags=["projects"])
api_router.include_router(document.router, prefix="/documents", tags=["documents"])
api_router.include_router(text_container.router, prefix="/text_container", tags=["text_container"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(process_recording.router, prefix="/process-recording", tags=["process_recording"])
api_router.include_router(folder.router, prefix="/folders", tags=["folders"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(inline_ai.router, prefix="/chat", tags=["chat"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(auth_providers.router, prefix="/auth/providers", tags=["auth_providers"])
api_router.include_router(shared.router, tags=["shared"])
api_router.include_router(context_links.router, tags=["context-links"])
api_router.include_router(comments.router, tags=["comments"])
api_router.include_router(git_sync.router, tags=["git-sync"])
api_router.include_router(mcp_keys.router, tags=["mcp"])
api_router.include_router(audit.router, prefix="/audit", tags=["audit"])
api_router.include_router(knowledge.router, prefix="/knowledge", tags=["knowledge"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(upload.router, prefix="/uploads", tags=["uploads"])
api_router.include_router(privacy.router, tags=["privacy"])
api_router.include_router(sso_admin.router, tags=["sso-admin"])
api_router.include_router(tts.router, prefix="/tts", tags=["tts"])
api_router.include_router(enterprise_api.router, prefix="/enterprise", tags=["enterprise-api"])
api_router.include_router(translation.router, tags=["translation"])
api_router.include_router(transcription.router, prefix="/transcription", tags=["transcription"])
api_router.include_router(video_import.router, prefix="/video-import", tags=["video-import"])
api_router.include_router(staleness.router, tags=["staleness"])


# Mount the versioned router on the main app
app.include_router(api_router)

# Public endpoints (no auth required) — mounted outside versioned router
from app.routers.public import router as public_router
app.include_router(public_router, prefix="/api/v1/public", tags=["public"])

# Health/ready endpoints (no version prefix — used by load balancers/Docker)
app.include_router(health.router)

# MCP (Model Context Protocol) server — mounted outside versioned API
try:
    from app.mcp_server import mcp as mcp_server
    app.mount("/mcp", mcp_server.streamable_http_app())
except ImportError:
    pass  # mcp package not installed — MCP endpoints disabled

# Test-only endpoints (seed/cleanup) — only in test/development environments
if os.getenv("ENVIRONMENT") == "test":
    from app.routers.test_helpers import router as test_router
    app.include_router(test_router)
