from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.security import get_current_user
from app.models import User
from app.core.config import settings
import httpx
import logging
import os

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Transcribe an audio file using OpenAI Whisper API.
    Returns timestamped segments for alignment with recording steps.

    Accepts: audio/webm, audio/wav, audio/mp3, audio/mpeg, audio/ogg, audio/mp4
    Returns: { segments: [{start, end, text}], fullText: "..." }
    """
    # Validate file type
    allowed = {
        "audio/webm", "audio/wav", "audio/mpeg", "audio/mp3",
        "audio/ogg", "audio/mp4", "audio/x-wav", "video/webm",
    }
    content_type = file.content_type or ""
    if content_type not in allowed:
        raise HTTPException(400, f"Unsupported audio type: {content_type}")

    # Max 25MB (OpenAI Whisper limit)
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(400, "Audio file too large (max 25MB)")

    # Get OpenAI API key from LLM config
    api_key = _get_openai_key()
    if not api_key:
        raise HTTPException(503, "Transcription not available — no OpenAI API key configured")

    try:
        # Call OpenAI Whisper API with verbose_json for timestamps
        async with httpx.AsyncClient(timeout=120.0) as client:
            ext = _get_extension(file.filename or "audio.webm", content_type)

            response = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (f"audio{ext}", content, content_type)},
                data={
                    "model": "whisper-1",
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": "segment",
                },
            )

        if response.status_code != 200:
            logger.error("Whisper API error %d: %s", response.status_code, response.text[:500])
            raise HTTPException(502, "Transcription service error")

        data = response.json()

        # Extract segments with timestamps
        segments = []
        for seg in data.get("segments", []):
            segments.append({
                "start": round(seg.get("start", 0), 2),
                "end": round(seg.get("end", 0), 2),
                "text": seg.get("text", "").strip(),
            })

        full_text = data.get("text", "").strip()

        return {
            "segments": segments,
            "fullText": full_text,
            "language": data.get("language"),
            "duration": data.get("duration"),
        }

    except httpx.TimeoutException:
        raise HTTPException(504, "Transcription timed out")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Transcription failed")
        raise HTTPException(500, f"Transcription failed: {str(e)}")


def _get_openai_key() -> str | None:
    """Get OpenAI API key from DB config or environment."""
    # Check DB-backed LLM config first
    try:
        from app.services.llm import _get_cached_db_config
        db_config = _get_cached_db_config()
        if db_config.get("api_key"):
            provider = (db_config.get("provider") or "").lower()
            if provider == "openai":
                return db_config["api_key"]
    except Exception:
        pass

    # Fall back to env var
    return settings.OPENAI_API_KEY


def _get_extension(filename: str, content_type: str) -> str:
    """Get file extension for OpenAI API."""
    ext = os.path.splitext(filename)[1].lower()
    if ext in {".webm", ".wav", ".mp3", ".ogg", ".mp4", ".m4a", ".mpeg"}:
        return ext
    # Infer from content type
    ct_map = {
        "audio/webm": ".webm", "video/webm": ".webm",
        "audio/wav": ".wav", "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3", "audio/mp3": ".mp3",
        "audio/ogg": ".ogg", "audio/mp4": ".mp4",
    }
    return ct_map.get(content_type, ".webm")
