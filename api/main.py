from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager

from app.routers import auth, text_container, user, project, document, process_recording, folder, chat, search

from app.database import Base, engine, AsyncSessionLocal
from app.core.config import settings


app = FastAPI(title="Ondoki")

# Versioned API router
api_router = APIRouter(prefix=settings.API_V1_STR)


app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    # Wildcard + credentials do not work.
    # Reflect any http/https origin – change to a stricter regex or an explicit list in production.
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,  # ← enable cookies
)


# Register all feature routers under the versioned router
api_router.include_router(user.router,    prefix="/users",    tags=["users"])
api_router.include_router(project.router, prefix="/projects", tags=["projects"])
api_router.include_router(document.router, prefix="/documents", tags=["documents"])
api_router.include_router(text_container.router, prefix="/text_container", tags=["text_container"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(process_recording.router, prefix="/process-recording", tags=["process_recording"])
api_router.include_router(folder.router, prefix="/folders", tags=["folders"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(search.router, prefix="/search", tags=["search"])


# Mount the versioned router on the main app
app.include_router(api_router)


@app.get("/health")
async def health_check():
    """Health check endpoint for Docker health checks"""
    return {"status": "healthy"}
