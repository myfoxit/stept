"""TTS (Text-to-Speech) endpoints — public, rate-limited.

Audio is cached persistently using the configured storage backend (S3, local, etc.)
so rebuilding the Docker container doesn't lose cached audio.
"""

import hashlib
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.core.config import settings
from app.middleware.rate_limit import RateLimiter
from app.services.storage import get_storage_backend

router = APIRouter()
logger = logging.getLogger(__name__)

_tts_rate_limiter = RateLimiter(limit=30, window=60)

TTS_STORAGE_PREFIX = "tts_cache"


class SpeakRequest(BaseModel):
    text: str
    voice: str | None = None
    language: str | None = None


def _cache_key(text: str, voice: str) -> str:
    return hashlib.sha256(f"{text}|{voice}".encode()).hexdigest()


async def _read_cached(key: str) -> bytes | None:
    """Try to read cached TTS audio from persistent storage."""
    backend = get_storage_backend(prefix_override=TTS_STORAGE_PREFIX)
    try:
        data = await backend.read_file(TTS_STORAGE_PREFIX, f"{key}.mp3")
        return data
    except Exception:
        return None


async def _write_cached(key: str, audio_bytes: bytes) -> None:
    """Write TTS audio to persistent storage."""
    backend = get_storage_backend(prefix_override=TTS_STORAGE_PREFIX)
    try:
        await backend.save_file(TTS_STORAGE_PREFIX, f"{key}.mp3", audio_bytes, "audio/mpeg")
    except Exception:
        logger.warning("Failed to cache TTS audio to storage", exc_info=True)


async def _generate_tts(text: str, voice: str) -> bytes:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            json={
                "model": "tts-1",
                "input": text,
                "voice": voice,
                "response_format": "mp3",
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.content


@router.get("/config")
async def tts_config():
    """Return TTS configuration (public — no auth)."""
    provider = settings.TTS_PROVIDER
    available = provider == "openai" and bool(settings.OPENAI_API_KEY)
    return {"provider": provider, "available": available}


@router.post("/speak")
async def tts_speak(body: SpeakRequest, _rl=Depends(_tts_rate_limiter)):
    """Generate speech from text via OpenAI TTS. Rate limited: 30/60s."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="TTS not configured")

    voice = body.voice or settings.TTS_VOICE
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    # Check persistent cache (S3 / local storage)
    key = _cache_key(text, voice)
    cached = await _read_cached(key)
    if cached:
        return Response(content=cached, media_type="audio/mpeg")

    try:
        audio_bytes = await _generate_tts(text, voice)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI TTS error: {exc.response.status_code}")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Failed to reach OpenAI TTS service")

    # Cache persistently
    await _write_cached(key, audio_bytes)

    return Response(content=audio_bytes, media_type="audio/mpeg")
