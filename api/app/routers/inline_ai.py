"""
Inline AI completion endpoint for the TipTap editor.

Lightweight SSE endpoint that handles inline AI commands
(write, summarize, improve, expand, simplify, translate, explain).
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.security import get_current_user
from app.models import User
from app.services import llm as llm_service
from app.services import dataveil as dataveil_service
from app.services import sendcloak

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class InlineAIRequest(BaseModel):
    command: str  # write, summarize, improve, expand, simplify, translate, explain
    prompt: Optional[str] = None  # user-typed prompt (for /ai write)
    context: Optional[str] = None  # selected text or surrounding paragraphs
    language: Optional[str] = None  # target language for translate


# ---------------------------------------------------------------------------
# System prompts per command
# ---------------------------------------------------------------------------

_SYSTEM_PROMPTS: dict[str, str] = {
    "write": (
        "You are a helpful writing assistant embedded in a document editor. "
        "The user will give you a prompt. Generate the requested text directly. "
        "Do NOT wrap your response in markdown code blocks. "
        "Write in the same language and tone as the surrounding document context if provided. "
        "Output only the generated text, no preamble or explanation."
    ),
    "summarize": (
        "You are a concise summarizer embedded in a document editor. "
        "Summarize the provided text clearly and concisely. "
        "Output only the summary, no preamble."
    ),
    "improve": (
        "You are an expert editor embedded in a document editor. "
        "Rewrite the provided text to be clearer, more professional, and better structured. "
        "Preserve the original meaning and intent. "
        "Output only the improved text, no preamble or explanation."
    ),
    "expand": (
        "You are a writing assistant embedded in a document editor. "
        "Expand the provided text with more detail, examples, or elaboration. "
        "Keep the same tone and style. "
        "Output only the expanded text, no preamble."
    ),
    "simplify": (
        "You are a writing assistant embedded in a document editor. "
        "Simplify the provided text to be easier to understand. "
        "Use shorter sentences and simpler words while preserving the meaning. "
        "Output only the simplified text, no preamble."
    ),
    "translate": (
        "You are a professional translator embedded in a document editor. "
        "Translate the provided text to the requested target language. "
        "If no target language is specified, translate to English. "
        "Preserve formatting and tone. "
        "Output only the translated text, no preamble."
    ),
    "explain": (
        "You are a knowledgeable assistant embedded in a document editor. "
        "Explain the provided text, concept, or workflow step clearly. "
        "Be concise but thorough. "
        "Output only the explanation, no preamble."
    ),
}


def _build_messages(req: InlineAIRequest) -> list[dict]:
    """Build the message array for the LLM request."""
    command = req.command.lower()
    system_prompt = _SYSTEM_PROMPTS.get(command, _SYSTEM_PROMPTS["write"])

    messages = [{"role": "system", "content": system_prompt}]

    if command == "write":
        user_content = req.prompt or "Write something interesting."
        if req.context:
            user_content = (
                f"Document context:\n---\n{req.context}\n---\n\n"
                f"Request: {user_content}"
            )
    elif command == "translate":
        lang = req.language or "English"
        user_content = f"Translate the following text to {lang}:\n\n{req.context or req.prompt or ''}"
    else:
        # summarize, improve, expand, simplify, explain
        user_content = req.context or req.prompt or ""
        if req.prompt and req.context:
            user_content = f"{req.prompt}\n\nText:\n{req.context}"

    messages.append({"role": "user", "content": user_content})
    return messages


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/inline")
async def inline_ai_completion(
    body: InlineAIRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Inline AI completion for the TipTap editor.
    Streams the response as SSE.
    """
    valid_commands = set(_SYSTEM_PROMPTS.keys())
    if body.command.lower() not in valid_commands:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown command: {body.command}. Valid: {', '.join(sorted(valid_commands))}",
        )

    messages = _build_messages(body)

    # Resolve DataVeil proxy
    try:
        base_url_override = await dataveil_service.get_proxied_base_url_with_fallback()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )

    try:
        result = await llm_service.chat_completion(
            messages=messages,
            stream=True,
            base_url_override=base_url_override,
            sendcloak_user_id=str(current_user.id) if sendcloak.is_enabled() else None,
        )
    except Exception as exc:
        logger.error("Inline AI request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM request failed: {exc}",
        )

    return StreamingResponse(
        result,  # type: ignore[arg-type]
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
