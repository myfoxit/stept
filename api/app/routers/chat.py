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
from typing import Optional, AsyncIterator

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
from app.services.ai_tools import registry as tool_registry

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


def _build_system_prompt_with_tools() -> str:
    """Build system prompt that tells the LLM about available tools."""
    tools = tool_registry.all_tools()
    if not tools:
        return ""

    tool_descriptions = []
    for t in tools:
        tool_descriptions.append(f"- **{t.name}**: {t.description}")

    return (
        "You have access to the following tools that can help the user manage their "
        "workflows, documents, and folders. Use them when the user asks you to perform "
        "actions like creating pages, analyzing workflows, searching, etc. "
        "When you use a tool, explain what you're doing.\n\n"
        "Available tools:\n" + "\n".join(tool_descriptions)
    )


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

async def _execute_tool_calls(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    tool_calls: list[dict],
) -> list[dict]:
    """
    Execute tool calls and return tool result messages.
    
    Returns list of:
      - The assistant message with tool_calls
      - Tool result messages (role=tool)
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
        else:
            try:
                result = await tool.execute(
                    db=db,
                    user_id=user_id,
                    project_id=project_id,
                    **args,
                )
                # Commit immediately so tool side-effects persist
                # even if the SSE stream disconnects later
                await db.commit()
            except Exception as exc:
                logger.error("Tool %s execution failed: %s", tool_name, exc)
                await db.rollback()
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
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
) -> AsyncIterator[str]:
    """
    Multi-round chat with tool calling.
    
    1. Send messages + tool definitions (non-streaming) to the LLM
    2. If LLM returns tool_calls, execute them
    3. Append tool results and repeat (up to MAX_TOOL_ROUNDS)
    4. When LLM returns a regular text response, stream it back
    
    Yields SSE data lines.
    """
    tool_defs = tool_registry.openai_tool_definitions()
    current_messages = list(messages)

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
            db=db,
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
    Supports AI tool/function calling when tools are registered.
    """
    # Convert messages
    messages = [m.model_dump(exclude_none=True) for m in body.messages]

    # Resolve project_id from context
    project_id = body.context.project_id if body.context else None

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

    # Inject tool system prompt
    tool_system_prompt = _build_system_prompt_with_tools()
    if tool_system_prompt:
        messages = [{"role": "system", "content": tool_system_prompt}] + messages

    # Resolve DataVeil proxy
    try:
        base_url_override = await dataveil_service.get_proxied_base_url_with_fallback()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )

    # Check if tools are available — use tool-calling flow
    has_tools = len(tool_registry.all_tools()) > 0

    if body.stream and has_tools:
        # Tool-calling flow: may do multiple rounds before streaming final response
        return StreamingResponse(
            _chat_with_tools(
                messages=messages,
                model=body.model,
                base_url_override=base_url_override,
                db=db,
                user_id=current_user.id,
                project_id=project_id,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
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
