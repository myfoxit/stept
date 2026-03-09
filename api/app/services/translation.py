"""AI content translation service with caching."""

import hashlib
import json
import logging
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import ContentTranslation

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "pt-BR": "Portuguese (Brazil)",
    "it": "Italian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh-CN": "Simplified Chinese",
    "nl": "Dutch",
    "ru": "Russian",
}


def _get_api_key() -> Optional[str]:
    return settings.OPENAI_API_KEY or settings.LLM_API_KEY or None


def _get_base_url() -> str:
    return settings.LLM_BASE_URL or "https://api.openai.com/v1"


def _get_model() -> str:
    return settings.LLM_MODEL or "gpt-4o-mini"


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def _get_cached(
    content_hash: str, target_lang: str, db: AsyncSession
) -> Optional[str]:
    stmt = select(ContentTranslation.translated_text).where(
        ContentTranslation.content_hash == content_hash,
        ContentTranslation.target_language == target_lang,
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    return row


async def _store_cached(
    content_hash: str,
    source_text: str,
    target_lang: str,
    translated_text: str,
    db: AsyncSession,
) -> None:
    entry = ContentTranslation(
        content_hash=content_hash,
        source_text=source_text[:5000],  # truncate source for storage
        target_language=target_lang,
        translated_text=translated_text,
    )
    db.add(entry)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        # Likely duplicate — that's fine, another request cached it first
        logger.debug("Translation cache write conflict, ignoring")


async def _call_llm(prompt: str, system: str) -> Optional[str]:
    api_key = _get_api_key()
    if not api_key:
        logger.warning("No API key configured for translation (OPENAI_API_KEY or LLM_API_KEY)")
        return None

    base_url = _get_base_url().rstrip("/")
    model = _get_model()

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.1,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.error(f"Translation LLM call failed: {e}")
        return None


async def translate_text(
    text: str, target_lang: str, db: AsyncSession
) -> tuple[str, bool]:
    """Translate a single text. Returns (translated_text, was_cached)."""
    if not text or not text.strip():
        return text, False

    if target_lang not in SUPPORTED_LANGUAGES:
        return text, False

    ch = _content_hash(text)
    cached = await _get_cached(ch, target_lang, db)
    if cached:
        return cached, True

    lang_name = SUPPORTED_LANGUAGES[target_lang]
    system = (
        f"You are a professional translator. Translate the following text to {lang_name}. "
        "Preserve all formatting, markdown, code blocks, and technical terms. "
        "Return ONLY the translation, nothing else."
    )

    result = await _call_llm(text, system)
    if not result:
        return text, False

    await _store_cached(ch, text, target_lang, result, db)
    return result, False


async def translate_batch(
    items: list[dict], target_lang: str, db: AsyncSession
) -> list[dict]:
    """Translate a batch of items. Each item has 'key' and 'text'.
    Returns same items with 'translated' field added.
    Uses cache for already-translated items and batches the rest in one LLM call.
    """
    if target_lang not in SUPPORTED_LANGUAGES:
        for item in items:
            item["translated"] = item["text"]
        return items

    # Check cache for each item
    uncached = []
    for item in items:
        if not item.get("text") or not item["text"].strip():
            item["translated"] = item.get("text", "")
            continue

        ch = _content_hash(item["text"])
        cached = await _get_cached(ch, target_lang, db)
        if cached:
            item["translated"] = cached
        else:
            item["_hash"] = ch
            uncached.append(item)

    if not uncached:
        return items

    # Batch translate uncached items in one LLM call
    lang_name = SUPPORTED_LANGUAGES[target_lang]
    system = (
        f"You are a professional translator. Translate each numbered text block to {lang_name}. "
        "Preserve all formatting, markdown, and technical terms. "
        "Return a JSON array of strings, where each string is the translation of the "
        "corresponding numbered item. Return ONLY the JSON array, no other text."
    )

    prompt_parts = []
    for i, item in enumerate(uncached):
        prompt_parts.append(f"[{i}] {item['text']}")
    prompt = "\n\n".join(prompt_parts)

    result = await _call_llm(prompt, system)
    if not result:
        # Fallback: return originals
        for item in uncached:
            item["translated"] = item["text"]
            item.pop("_hash", None)
        return items

    # Parse JSON array response
    try:
        # Try to extract JSON array from response
        text = result.strip()
        if not text.startswith("["):
            # Try to find JSON array in response
            start = text.find("[")
            end = text.rfind("]") + 1
            if start >= 0 and end > start:
                text = text[start:end]
        translations = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        # If batch parsing fails, try line-by-line fallback
        logger.warning("Batch translation JSON parse failed, falling back to line split")
        translations = [line.strip() for line in result.strip().split("\n") if line.strip()]

    for i, item in enumerate(uncached):
        if i < len(translations):
            translated = translations[i] if isinstance(translations[i], str) else str(translations[i])
            item["translated"] = translated
            await _store_cached(item["_hash"], item["text"], target_lang, translated, db)
        else:
            item["translated"] = item["text"]
        item.pop("_hash", None)

    return items
