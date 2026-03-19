"""
Chat / LLM gateway router.

Endpoints:
    POST /chat/completions — streaming (SSE) or non-streaming chat
    GET  /chat/models       — list available models
    GET  /chat/config       — current LLM configuration (no secrets)

Supports AI tool/function calling: the LLM can invoke tools (create pages,
analyze workflows, etc.) and results are returned inline in the chat stream.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional, AsyncIterator, Any

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database import get_session as get_db, AsyncSessionLocal
from app.models import (
    Document,
    ProcessRecordingSession,
    ProcessRecordingStep,
    User,
    LLMUsage,
    ChatSession,
    ChatMessage,
)
from app.security import get_current_user
from app.services import llm as llm_service
from app.services import sendcloak
from app.services.ai_tools import registry as tool_registry
from app.middleware.rate_limit import chat_rate_limiter

logger = logging.getLogger(__name__)

router = APIRouter()

# Max tool call rounds to prevent infinite loops
MAX_TOOL_ROUNDS = 5


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class MessageIn(BaseModel):
    role: str
    content: str
    tool_calls: Optional[list] = None
    tool_call_id: Optional[str] = None
    name: Optional[str] = None


class ChatContext(BaseModel):
    recording_id: Optional[str] = None
    document_id: Optional[str] = None
    project_id: Optional[str] = None


class ChatCompletionRequest(BaseModel):
    messages: list[MessageIn]
    model: Optional[str] = None
    stream: bool = True
    context: Optional[ChatContext] = None
    session_id: Optional[str] = None
    parent_message_id: Optional[str] = None


class ChatSessionOut(BaseModel):
    id: str
    title: Optional[str] = None
    project_id: Optional[str] = None
    recording_id: Optional[str] = None
    document_id: Optional[str] = None
    latest_message_id: Optional[str] = None
    created_at: Any
    updated_at: Any


class ChatMessageOut(BaseModel):
    id: str
    session_id: str
    parent_message_id: Optional[str] = None
    role: str
    content: str
    tool_calls: Optional[list] = None
    tool_results: Optional[list] = None
    meta: Optional[dict] = None
    position: int
    created_at: Any
    deleted_at: Optional[Any] = None


class ChatSessionDetailOut(BaseModel):
    session: ChatSessionOut
    messages: list[ChatMessageOut]


class ChatConfigUpdate(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None


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


def _build_system_prompt_with_tools() -> str:
    """Build system prompt that tells the LLM about available tools."""
    tools = tool_registry.all_tools()
    if not tools:
        return ""

    tool_descriptions = []
    for t in tools:
        tool_descriptions.append(f"- **{t.name}**: {t.description}")

    return (
        "You are Stept's AI assistant. You help users manage their recorded workflows, "
        "documents, and folders.\n\n"
        "IMPORTANT BEHAVIORS:\n"
        "- When a user asks 'how do I...', 'how to...', or any knowledge question about "
        "processes/tasks, ALWAYS use rag_search first to find relevant workflows and documents.\n"
        "- When rag_search returns results, ALWAYS treat them as relevant and answer based on their CONTENT, "
        "not their titles. Document titles may not describe their content — a document titled 'Meeting' "
        "could contain course assignments, project specs, or anything else. READ the actual content "
        "returned by rag_search and use it to answer the user's question.\n"
        "- NEVER dismiss rag_search results just because the title seems unrelated. The content is what matters.\n"
        "- When rag_search returns results, USE the source citations in your response exactly as provided. "
        "They are markdown links that the user can click to open the document. "
        "Example: [📝 Setup Guide](/editor/abc123) or [📄 Deploy to Production](/workflow/def456).\n"
        "- When a user asks to FILL, UPDATE, or EDIT an existing page, ALWAYS use search_pages "
        "first to find the document_id, then use update_page with the found document_id. "
        "NEVER use create_page if the page already exists.\n"
        "- When creating NEW pages, use create_page with folder_name/folder_id parameters. "
        "If a folder doesn't exist, the tools will create it automatically.\n"
        "- When referencing workflows, you can use name_query (partial name match) "
        "instead of requiring exact IDs.\n"
        "- To rename steps, first use read_workflow to see current step details, then "
        "use rename_steps with descriptive, human-readable titles.\n"
        "- When you use a tool, briefly explain what you're doing.\n"
        "- Write tool calls (create, update, rename, merge) require user confirmation. "
        "Read-only tools (search, list, analyze, read, rag_search, read_document) execute immediately.\n"
        "- When a user asks to 'show me', 'pull up', 'read', or 'get' a specific document, use read_document "
        "to retrieve the full content. Use document_id if known, or name_query for partial name match.\n\n"
        "Available tools:\n" + "\n".join(tool_descriptions)
    )


def _session_title_from_messages(messages: list[dict]) -> str | None:
    for msg in messages:
        if msg.get("role") == "user" and (msg.get("content") or "").strip():
            return (msg.get("content") or "").strip().replace("\n", " ")[:120]
    return None


def _message_to_out(message: ChatMessage) -> ChatMessageOut:
    return ChatMessageOut(
        id=message.id,
        session_id=message.session_id,
        parent_message_id=message.parent_message_id,
        role=message.role,
        content=message.content or "",
        tool_calls=message.tool_calls,
        tool_results=message.tool_results,
        meta=message.meta,
        position=message.position,
        created_at=message.created_at,
        deleted_at=message.deleted_at,
    )


def _session_to_out(session: ChatSession) -> ChatSessionOut:
    return ChatSessionOut(
        id=session.id,
        title=session.title,
        project_id=session.project_id,
        recording_id=session.recording_id,
        document_id=session.document_id,
        latest_message_id=session.latest_message_id,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


async def _get_chat_session_or_404(db: AsyncSession, user_id: str, session_id: str) -> ChatSession:
    stmt = select(ChatSession).where(
        ChatSession.id == session_id,
        ChatSession.user_id == user_id,
        ChatSession.deleted_at.is_(None),
    )
    session = await db.scalar(stmt)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return session


async def _next_message_position(db: AsyncSession, session_id: str) -> int:
    result = await db.execute(
        select(func.coalesce(func.max(ChatMessage.position), -1) + 1).where(ChatMessage.session_id == session_id)
    )
    return int(result.scalar_one())


async def _create_chat_message(
    db: AsyncSession,
    session: ChatSession,
    role: str,
    content: str,
    parent_message_id: str | None = None,
    tool_calls: list | None = None,
    tool_results: list | None = None,
    meta: dict | None = None,
) -> ChatMessage:
    msg = ChatMessage(
        session_id=session.id,
        parent_message_id=parent_message_id,
        role=role,
        content=content or "",
        tool_calls=tool_calls,
        tool_results=tool_results,
        meta=meta,
        position=await _next_message_position(db, session.id),
    )
    db.add(msg)
    await db.flush()
    session.latest_message_id = msg.id
    if not session.title and role == "user":
        session.title = (content or "").strip().replace("\n", " ")[:120] or session.title
    return msg


async def _ensure_session(
    db: AsyncSession,
    user_id: str,
    body: ChatCompletionRequest,
) -> ChatSession | None:
    if body.session_id:
        session = await _get_chat_session_or_404(db, user_id, body.session_id)
        if body.context:
            if body.context.project_id and not session.project_id:
                session.project_id = body.context.project_id
            if body.context.recording_id and not session.recording_id:
                session.recording_id = body.context.recording_id
            if body.context.document_id and not session.document_id:
                session.document_id = body.context.document_id
        return session

    if not body.messages:
        return None

    session = ChatSession(
        user_id=user_id,
        project_id=body.context.project_id if body.context else None,
        recording_id=body.context.recording_id if body.context else None,
        document_id=body.context.document_id if body.context else None,
        title=_session_title_from_messages([m.model_dump(exclude_none=True) for m in body.messages]),
    )
    db.add(session)
    await db.flush()
    return session


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

async def _execute_tool_calls(
    user_id: str,
    project_id: Optional[str],
    tool_calls: list[dict],
) -> list[dict]:
    """
    Execute tool calls using a fresh DB session per call, so the SSE stream
    does not hold a long-lived connection.

    Returns list of tool result messages (role=tool).
    """
    results = []
    for tc in tool_calls:
        func = tc.get("function", {})
        tool_name = func.get("name", "")
        tool_call_id = tc.get("id", "")

        # Parse arguments
        args_raw = func.get("arguments", "{}")
        if isinstance(args_raw, str):
            try:
                args = json.loads(args_raw)
            except json.JSONDecodeError:
                args = {}
        else:
            args = args_raw

        # Look up and execute the tool
        tool = tool_registry.get(tool_name)
        if not tool:
            result = {"error": f"Unknown tool: {tool_name}"}
        elif tool.requires_confirmation:
            result = {
                "pending_confirmation": True,
                "action": tool_name,
                "params": args,
                "message": f"I'd like to {tool_name.replace('_', ' ')} with these parameters. Please confirm.",
            }
        else:
            try:
                # Open a short-lived DB session for this single tool call
                async with AsyncSessionLocal() as db:
                    try:
                        result = await tool.execute(
                            db=db,
                            user_id=user_id,
                            project_id=project_id,
                            **args,
                        )
                        await db.commit()
                    except Exception as exc:
                        logger.error("Tool %s execution failed: %s", tool_name, exc)
                        await db.rollback()
                        result = {"error": f"Tool execution failed: {str(exc)}"}
            except Exception as exc:
                logger.error("Tool %s session error: %s", tool_name, exc)
                result = {"error": f"Tool execution failed: {str(exc)}"}

        results.append({
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": json.dumps(result),
        })

    return results


async def _chat_with_tools(
    messages: list[dict],
    model: Optional[str],
    base_url_override: Optional[str],
    user_id: str,
    project_id: Optional[str],
    capture: Optional[dict] = None,
) -> AsyncIterator[str]:
    """
    Multi-round chat with tool calling.
    
    1. Send messages + tool definitions (non-streaming) to the LLM
    2. If LLM returns tool_calls, execute them (each in its own DB session)
    3. Append tool results and repeat (up to MAX_TOOL_ROUNDS)
    4. When LLM returns a regular text response, stream it back
    
    Yields SSE data lines.
    """
    tool_defs = tool_registry.openai_tool_definitions()
    current_messages = list(messages)
    if capture is None:
        capture = {}
    capture.setdefault("content", "")
    capture.setdefault("tool_calls", [])
    capture.setdefault("tool_results", [])

    for round_num in range(MAX_TOOL_ROUNDS):
        # Non-streaming request with tools
        try:
            resp = await llm_service.chat_completion(
                messages=current_messages,
                model=model,
                stream=False,
                base_url_override=base_url_override,
                tools=tool_defs if round_num == 0 or tool_defs else None,
            )
        except Exception as exc:
            logger.error("LLM request failed in tool round %d: %s", round_num, exc)
            error_chunk = {
                "choices": [{
                    "delta": {"content": f"\n\n⚠️ LLM request failed: {exc}"},
                    "index": 0,
                    "finish_reason": "stop",
                }]
            }
            yield f"data: {json.dumps(error_chunk)}\n\n"
            yield "data: [DONE]\n\n"
            return

        # Parse the response
        if hasattr(resp, 'json'):
            # httpx.Response
            if resp.status_code != 200:
                error_text = resp.text if hasattr(resp, 'text') else str(resp.status_code)
                error_chunk = {
                    "choices": [{
                        "delta": {"content": f"\n\n⚠️ LLM error: {error_text}"},
                        "index": 0,
                        "finish_reason": "stop",
                    }]
                }
                yield f"data: {json.dumps(error_chunk)}\n\n"
                yield "data: [DONE]\n\n"
                return
            response_json = resp.json()
        else:
            # Should not happen in non-streaming mode
            yield "data: [DONE]\n\n"
            return

        # Check for tool calls
        tool_calls = llm_service.extract_tool_calls_from_response(response_json)

        if not tool_calls:
            # No tool calls — stream the text response as SSE chunks
            text = llm_service.extract_text_from_response(response_json)
            if text:
                capture["content"] += text
                # Send as a single chunk (already got full response)
                chunk = {
                    "choices": [{
                        "delta": {"content": text},
                        "index": 0,
                        "finish_reason": None,
                    }]
                }
                yield f"data: {json.dumps(chunk)}\n\n"
            yield "data: [DONE]\n\n"
            return

        # Tool calls detected — emit tool execution events to frontend
        for tc in tool_calls:
            func = tc.get("function", {})
            capture["tool_calls"].append({
                "id": tc.get("id", ""),
                "name": func.get("name", ""),
                "arguments": func.get("arguments", "{}"),
                "status": "executing",
            })
            tool_event = {
                "tool_call": {
                    "id": tc.get("id", ""),
                    "name": func.get("name", ""),
                    "arguments": func.get("arguments", "{}"),
                    "status": "executing",
                }
            }
            yield f"data: {json.dumps(tool_event)}\n\n"

        # Execute the tools
        tool_results = await _execute_tool_calls(
            user_id=user_id,
            project_id=project_id,
            tool_calls=tool_calls,
        )

        # Emit tool results to frontend
        for tr in tool_results:
            try:
                result_data = json.loads(tr["content"])
            except json.JSONDecodeError:
                result_data = {"message": tr["content"]}

            capture["tool_results"].append({
                "tool_call_id": tr["tool_call_id"],
                "result": result_data,
                "status": "error" if result_data.get("error") else "completed",
            })

            tool_result_event = {
                "tool_result": {
                    "tool_call_id": tr["tool_call_id"],
                    "result": result_data,
                    "status": "error" if result_data.get("error") else "completed",
                }
            }
            yield f"data: {json.dumps(tool_result_event)}\n\n"

        # Build assistant message with tool_calls for the conversation
        assistant_msg = {
            "role": "assistant",
            "content": llm_service.extract_text_from_response(response_json) or None,
            "tool_calls": tool_calls,
        }
        current_messages.append(assistant_msg)
        current_messages.extend(tool_results)

    # If we exhausted rounds, send a final streamed response without tools
    try:
        result = await llm_service.chat_completion(
            messages=current_messages,
            model=model,
            stream=True,
            base_url_override=base_url_override,
        )
        async for chunk in result:
            yield chunk
    except Exception as exc:
        logger.error("Final LLM stream failed: %s", exc)
        yield "data: [DONE]\n\n"


async def _stream_and_capture(source: AsyncIterator[str], capture: dict) -> AsyncIterator[str]:
    async for chunk in source:
        if chunk.startswith("data: "):
            payload = chunk[6:].strip()
            if payload and payload != "[DONE]":
                try:
                    parsed = json.loads(payload)
                    content = parsed.get("choices", [{}])[0].get("delta", {}).get("content")
                    if content:
                        capture["content"] = capture.get("content", "") + content
                except Exception:
                    pass
        yield chunk


async def _persist_chat_turn(
    db: AsyncSession,
    session: ChatSession | None,
    user_message: MessageIn | None,
    assistant_content: str,
    parent_message_id: str | None,
    tool_calls: list | None = None,
    tool_results: list | None = None,
    meta: dict | None = None,
) -> tuple[ChatSession | None, ChatMessage | None, ChatMessage | None]:
    if not session or not user_message:
        return session, None, None

    user_db_message = await _create_chat_message(
        db,
        session=session,
        role="user",
        content=user_message.content,
        parent_message_id=parent_message_id,
        meta={"source": "chat_completions"},
    )
    assistant_db_message = await _create_chat_message(
        db,
        session=session,
        role="assistant",
        content=assistant_content or "",
        parent_message_id=user_db_message.id,
        tool_calls=tool_calls,
        tool_results=tool_results,
        meta=meta or {},
    )
    await db.commit()
    await db.refresh(session)
    return session, user_db_message, assistant_db_message


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/sessions")
async def list_chat_sessions(
    project_id: Optional[str] = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(ChatSession).where(
        ChatSession.user_id == current_user.id,
        ChatSession.deleted_at.is_(None),
    )
    if project_id:
        stmt = stmt.where(ChatSession.project_id == project_id)
    stmt = stmt.order_by(ChatSession.updated_at.desc()).limit(limit)
    sessions = (await db.scalars(stmt)).all()
    return {"sessions": [_session_to_out(s).model_dump() for s in sessions]}


@router.get("/sessions/{session_id}", response_model=ChatSessionDetailOut)
async def get_chat_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await _get_chat_session_or_404(db, current_user.id, session_id)
    stmt = select(ChatMessage).where(
        ChatMessage.session_id == session.id,
        ChatMessage.deleted_at.is_(None),
    ).order_by(ChatMessage.position.asc(), ChatMessage.created_at.asc())
    messages = (await db.scalars(stmt)).all()
    return ChatSessionDetailOut(
        session=_session_to_out(session),
        messages=[_message_to_out(m) for m in messages],
    )


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_chat_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await _get_chat_session_or_404(db, current_user.id, session_id)
    now = datetime.utcnow()
    session.deleted_at = now
    stmt = select(ChatMessage).where(ChatMessage.session_id == session.id, ChatMessage.deleted_at.is_(None))
    for message in (await db.scalars(stmt)).all():
        message.deleted_at = now
    await db.commit()
    return None


@router.post("/completions")
async def chat_completions(
    body: ChatCompletionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rl=Depends(chat_rate_limiter),
):
    """
    Chat completion endpoint. Supports streaming (SSE) and non-streaming.
    Persists chat sessions and messages when user turns are submitted.
    """
    if not body.messages:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one message is required")

    session = await _ensure_session(db, current_user.id, body)

    raw_messages = [m.model_dump(exclude_none=True) for m in body.messages]
    latest_user_message = next((m for m in reversed(body.messages) if m.role == "user"), None)

    messages = list(raw_messages)
    project_id = body.context.project_id if body.context else (session.project_id if session else None)

    if body.context:
        if body.context.recording_id:
            messages = await _inject_recording_context(db, body.context.recording_id, messages)
        if body.context.document_id:
            messages = await _inject_document_context(db, body.context.document_id, messages)

    tool_system_prompt = _build_system_prompt_with_tools()
    if tool_system_prompt:
        messages = [{"role": "system", "content": tool_system_prompt}] + messages

    base_url_override = None
    has_tools = len(tool_registry.all_tools()) > 0

    if body.stream and has_tools:
        capture = {"content": "", "tool_calls": [], "tool_results": []}

        async def event_stream():
            async for chunk in _chat_with_tools(
                messages=messages,
                model=body.model,
                base_url_override=base_url_override,
                user_id=current_user.id,
                project_id=project_id,
                capture=capture,
            ):
                yield chunk
            await _persist_chat_turn(
                db=db,
                session=session,
                user_message=latest_user_message,
                assistant_content=capture.get("content", ""),
                parent_message_id=body.parent_message_id or (session.latest_message_id if session else None),
                tool_calls=capture.get("tool_calls"),
                tool_results=capture.get("tool_results"),
                meta={"model": body.model, "stream": True, "has_tools": True},
            )

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                **({"X-Chat-Session-Id": session.id} if session else {}),
            },
        )

    try:
        result = await llm_service.chat_completion(
            messages=messages,
            model=body.model,
            stream=body.stream,
            base_url_override=base_url_override,
            sendcloak_user_id=str(current_user.id) if sendcloak.is_enabled() else None,
            sendcloak_project_id=str(project_id) if project_id and sendcloak.is_enabled() else None,
        )
    except Exception as exc:
        logger.error("LLM request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM request failed: {exc}",
        )

    if body.stream:
        capture = {"content": ""}

        async def event_stream():
            async for chunk in _stream_and_capture(result, capture):  # type: ignore[arg-type]
                yield chunk
            await _persist_chat_turn(
                db=db,
                session=session,
                user_message=latest_user_message,
                assistant_content=capture.get("content", ""),
                parent_message_id=body.parent_message_id or (session.latest_message_id if session else None),
                meta={"model": body.model, "stream": True, "has_tools": False},
            )

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                **({"X-Chat-Session-Id": session.id} if session else {}),
            },
        )

    resp = result  # type: ignore[assignment]
    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=resp.text,
        )
    payload = resp.json()
    assistant_content = llm_service.extract_text_from_response(payload)
    session, user_db_message, assistant_db_message = await _persist_chat_turn(
        db=db,
        session=session,
        user_message=latest_user_message,
        assistant_content=assistant_content or "",
        parent_message_id=body.parent_message_id or (session.latest_message_id if session else None),
        meta={"model": body.model, "stream": False, "has_tools": False},
    )
    payload.setdefault("stept", {})
    payload["stept"].update({
        "session_id": session.id if session else None,
        "user_message_id": user_db_message.id if user_db_message else None,
        "assistant_message_id": assistant_db_message.id if assistant_db_message else None,
    })
    return payload


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


@router.put("/config")
async def update_config(
    body: ChatConfigUpdate,
    current_user: User = Depends(get_current_user),
):
    """
    Save LLM configuration to the database.
    Only non-None fields are updated; existing values are preserved.
    """
    # Load current DB config
    current = await llm_service.load_db_config()

    # Merge in non-None fields
    if body.provider is not None:
        current["provider"] = body.provider
    if body.model is not None:
        current["model"] = body.model
    if body.base_url is not None:
        current["base_url"] = body.base_url
    if body.api_key is not None:
        current["api_key"] = body.api_key

    await llm_service.save_db_config(current)
    logger.info("LLM config updated by user %s: provider=%s model=%s",
                current_user.id, current.get("provider"), current.get("model"))

    return llm_service.get_config()


@router.get("/tools")
async def list_tools(
    current_user: User = Depends(get_current_user),
):
    """List available AI tools."""
    tools = tool_registry.all_tools()
    return {
        "tools": [
            {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
            }
            for t in tools
        ]
    }


# ---------------------------------------------------------------------------
# Action confirmation endpoint (for Spotlight AI suggestions)
# ---------------------------------------------------------------------------

class ConfirmActionRequest(BaseModel):
    action: str = Field(..., description="Tool name to execute, e.g. 'create_page'")
    params: dict = Field(default_factory=dict, description="Tool parameters")
    project_id: Optional[str] = None


@router.post("/confirm-action")
async def confirm_action(
    body: ConfirmActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Execute a confirmed AI action (tool call).
    Called when the user clicks 'Confirm' on an AI suggestion in Spotlight.
    """
    tool = tool_registry.get(body.action)
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown action: {body.action}",
        )

    try:
        result = await tool.execute(
            db=db,
            user_id=current_user.id,
            project_id=body.project_id,
            **body.params,
        )
        await db.commit()
        return {"status": "success", "result": result}
    except Exception as exc:
        await db.rollback()
        logger.error("Confirm action %s failed: %s", body.action, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Action failed: {exc}",
        )


@router.get("/usage")
async def get_usage(
    days: int = Query(default=30, le=365),
    project_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func as sqlfunc
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    query = select(
        sqlfunc.sum(LLMUsage.input_tokens).label("total_input"),
        sqlfunc.sum(LLMUsage.output_tokens).label("total_output"),
        sqlfunc.sum(LLMUsage.total_tokens).label("total_tokens"),
        sqlfunc.sum(LLMUsage.estimated_cost_usd).label("total_cost"),
        sqlfunc.count(LLMUsage.id).label("request_count"),
    ).where(LLMUsage.user_id == current_user.id, LLMUsage.created_at >= since)
    if project_id:
        query = query.where(LLMUsage.project_id == project_id)
    result = await db.execute(query)
    row = result.one()
    return {"days": days, "total_input_tokens": row.total_input or 0, "total_output_tokens": row.total_output or 0, "total_tokens": row.total_tokens or 0, "estimated_cost_usd": round(row.total_cost or 0, 4), "request_count": row.request_count or 0}
