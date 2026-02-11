"""
Chat / LLM gateway router.

Endpoints:
    POST /chat/completions — streaming (SSE) or non-streaming chat
    GET  /chat/models       — list available models
    GET  /chat/config       — current LLM configuration (no secrets)
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_session as get_db
from app.models import (
    Document,
    ProcessRecordingSession,
    ProcessRecordingStep,
    User,
)
from app.security import get_current_user
from app.services import llm as llm_service
from app.services import dataveil as dataveil_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class MessageIn(BaseModel):
    role: str
    content: str


class ChatContext(BaseModel):
    recording_id: Optional[str] = None
    document_id: Optional[str] = None


class ChatCompletionRequest(BaseModel):
    messages: list[MessageIn]
    model: Optional[str] = None
    stream: bool = True
    context: Optional[ChatContext] = None


class ChatConfigUpdate(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    dataveil_enabled: Optional[bool] = None
    dataveil_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Context injection helpers
# ---------------------------------------------------------------------------

async def _inject_recording_context(
    db: AsyncSession,
    recording_id: str,
    messages: list[dict],
) -> list[dict]:
    """Prepend recording steps as system context."""
    stmt = (
        select(ProcessRecordingSession)
        .where(ProcessRecordingSession.id == recording_id)
        .options(selectinload(ProcessRecordingSession.steps))
    )
    session = await db.scalar(stmt)
    if not session:
        return messages

    steps_text = []
    for step in sorted(session.steps, key=lambda s: s.step_number):
        parts = [f"Step {step.step_number}"]
        if step.step_type:
            parts.append(f"({step.step_type})")
        if step.window_title:
            parts.append(f"Window: {step.window_title}")
        if step.description:
            parts.append(f"Description: {step.description}")
        if step.content:
            parts.append(f"Content: {step.content}")
        if step.action_type:
            parts.append(f"Action: {step.action_type}")
        if step.text_typed:
            parts.append(f"Typed: {step.text_typed}")
        if step.key_pressed:
            parts.append(f"Key: {step.key_pressed}")
        steps_text.append(" | ".join(parts))

    context_msg = {
        "role": "system",
        "content": (
            f"You are assisting with a process recording called "
            f"'{session.name or 'Untitled Workflow'}'. "
            f"It has {len(session.steps)} steps. "
            f"Here are the steps:\n\n" + "\n".join(steps_text)
        ),
    }
    return [context_msg] + messages


async def _inject_document_context(
    db: AsyncSession,
    document_id: str,
    messages: list[dict],
) -> list[dict]:
    """Prepend document content as system context."""
    stmt = select(Document).where(Document.id == document_id)
    doc = await db.scalar(stmt)
    if not doc:
        return messages

    # Extract text content from TipTap JSON
    content_text = _extract_tiptap_text(doc.content) if doc.content else ""

    if not content_text.strip():
        return messages

    context_msg = {
        "role": "system",
        "content": (
            f"You are assisting with a document called "
            f"'{doc.name or 'Untitled'}'. "
            f"Here is the document content:\n\n{content_text}"
        ),
    }
    return [context_msg] + messages


def _extract_tiptap_text(content: dict) -> str:
    """Recursively extract text from a TipTap JSON document."""
    if not isinstance(content, dict):
        return str(content) if content else ""

    texts: list[str] = []

    if "text" in content:
        texts.append(content["text"])

    for child in content.get("content", []):
        texts.append(_extract_tiptap_text(child))

    return " ".join(t for t in texts if t)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/completions")
async def chat_completions(
    body: ChatCompletionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Chat completion endpoint. Supports streaming (SSE) and non-streaming.
    Optionally injects recording/document context.
    """
    # Convert messages
    messages = [m.model_dump() for m in body.messages]

    # Inject context if provided
    if body.context:
        if body.context.recording_id:
            messages = await _inject_recording_context(
                db, body.context.recording_id, messages
            )
        if body.context.document_id:
            messages = await _inject_document_context(
                db, body.context.document_id, messages
            )

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
            model=body.model,
            stream=body.stream,
            base_url_override=base_url_override,
        )
    except Exception as exc:
        logger.error("LLM request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM request failed: {exc}",
        )

    if body.stream:
        # result is an AsyncIterator[str]
        return StreamingResponse(
            result,  # type: ignore[arg-type]
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    else:
        # result is an httpx.Response
        resp = result  # type: ignore[assignment]
        if resp.status_code != 200:
            raise HTTPException(
                status_code=resp.status_code,
                detail=resp.text,
            )
        return resp.json()


@router.get("/models")
async def list_models(
    current_user: User = Depends(get_current_user),
):
    """List available models from the configured provider."""
    models = await llm_service.list_models()
    return {"models": models}


@router.get("/config")
async def get_config(
    current_user: User = Depends(get_current_user),
):
    """Return current LLM config (no secrets)."""
    return llm_service.get_config()
