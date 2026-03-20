"""Public endpoint exposing which experimental features are enabled."""
from fastapi import APIRouter
from app.core.config import settings

router = APIRouter(prefix="/features", tags=["features"])

@router.get("")
async def get_features():
    return {
        "video_import": settings.STEPT_ENABLE_VIDEO_IMPORT,
        "knowledge_base": settings.STEPT_ENABLE_KNOWLEDGE_BASE,
        "ai_chat": settings.STEPT_ENABLE_AI_CHAT,
        "mcp": settings.STEPT_ENABLE_MCP,
    }
