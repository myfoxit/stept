# Backward-compatible re-export — canonical settings live in app.core.config
from app.core.config import settings, Settings  # re-export

__all__ = ["settings", "Settings"]
