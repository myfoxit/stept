"""Translation endpoints — translate content on demand."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.middleware.rate_limit import RateLimiter
from app.services.translation import SUPPORTED_LANGUAGES, translate_text, translate_batch

router = APIRouter()

_translate_limiter = RateLimiter(limit=30, window=60)  # used via Depends()


class TranslateRequest(BaseModel):
    text: str
    target_language: str


class TranslateResponse(BaseModel):
    translated: str
    language: str
    cached: bool


class LanguageInfo(BaseModel):
    code: str
    name: str


@router.get("/translation/languages")
async def list_languages() -> list[LanguageInfo]:
    """Return the list of supported translation languages."""
    return [
        LanguageInfo(code=code, name=name)
        for code, name in SUPPORTED_LANGUAGES.items()
    ]


@router.post("/translation/translate")
async def translate(
    body: TranslateRequest,
    db: AsyncSession = Depends(get_db),
    _rl=Depends(_translate_limiter),
) -> TranslateResponse:
    """Translate a single text to the target language."""

    if body.target_language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language: {body.target_language}. "
            f"Supported: {', '.join(SUPPORTED_LANGUAGES.keys())}",
        )

    if not body.text.strip():
        return TranslateResponse(
            translated=body.text,
            language=body.target_language,
            cached=False,
        )

    translated, cached = await translate_text(body.text, body.target_language, db)
    return TranslateResponse(
        translated=translated,
        language=body.target_language,
        cached=cached,
    )


class BatchItem(BaseModel):
    key: str
    text: str


class BatchTranslateRequest(BaseModel):
    items: list[BatchItem]
    target_language: str


class BatchTranslateResponse(BaseModel):
    results: dict[str, str]
    language: str


@router.post("/translation/translate-batch")
async def translate_batch_endpoint(
    body: BatchTranslateRequest,
    db: AsyncSession = Depends(get_db),
    _rl=Depends(_translate_limiter),
) -> BatchTranslateResponse:
    """Translate multiple texts in one request. Uses cache + batched LLM call."""

    if body.target_language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language: {body.target_language}",
        )

    items = [{"key": item.key, "text": item.text} for item in body.items]
    translated_items = await translate_batch(items, body.target_language, db)

    results = {item["key"]: item["translated"] for item in translated_items}
    return BatchTranslateResponse(results=results, language=body.target_language)
