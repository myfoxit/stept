"""TTS (Text-to-Speech) endpoints — public, rate-limited."""

import hashlib
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.core.config import settings
from app.middleware.rate_limit import RateLimiter

router = APIRouter()

_tts_rate_limiter = RateLimiter(limit=30, window=60)

TTS_CACHE_DIR = Path("/tmp/tts_cache")
TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)


class SpeakRequest(BaseModel):
    text: str
    voice: str | None = None
    language: str | None = None


def _cache_key(text: str, voice: str) -> str:
    return hashlib.sha256(f"{text}|{voice}".encode()).hexdigest()


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

    # Check cache
    key = _cache_key(text, voice)
    cache_path = TTS_CACHE_DIR / f"{key}.mp3"

    if cache_path.exists():
        return Response(content=cache_path.read_bytes(), media_type="audio/mpeg")

    try:
        audio_bytes = await _generate_tts(text, voice)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI TTS error: {exc.response.status_code}")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Failed to reach OpenAI TTS service")

    # Cache the result
    cache_path.write_bytes(audio_bytes)

    return Response(content=audio_bytes, media_type="audio/mpeg")
