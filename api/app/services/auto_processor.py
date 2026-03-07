"""
Auto-processing pipeline for recording steps.

Uses the existing LLM service to annotate steps with vision or text-only models,
generate recording summaries, and produce polished markdown guides.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ProcessRecordingSession, ProcessRecordingStep, ProcessRecordingFile
from app.services import llm as llm_service
from app.services import dataveil as dataveil_service

logger = logging.getLogger(__name__)

# Max concurrent LLM calls
_SEMAPHORE = asyncio.Semaphore(5)


async def _read_image_base64(file_path: str, storage_path: str, storage_type: str = "local") -> Optional[str]:
    """Read an image via the storage backend and return base64-encoded data.

    Works with local filesystem, S3, GCS, and Azure — whatever the session
    was recorded with.
    """
    from app.services.storage import get_storage_backend

    backend = get_storage_backend(storage_type)
    try:
        data = await backend.read_file(storage_path, file_path)
        if data:
            return base64.b64encode(data).decode("utf-8")
    except Exception:
        pass
    return None


def _build_step_context(step: ProcessRecordingStep) -> str:
    """Build a textual description of step metadata.
    
    Includes rich element data from the client when available —
    this is far more useful for AI than the pre-baked description string.
    """
    parts = [f"Step {step.step_number}"]
    if step.step_type:
        parts.append(f"Type: {step.step_type}")
    if step.action_type:
        parts.append(f"Action: {step.action_type}")
    if step.owner_app:
        parts.append(f"Application: {step.owner_app}")
    if step.window_title:
        parts.append(f"Window: {step.window_title}")
    if step.url:
        parts.append(f"URL: {step.url}")
    if step.description:
        parts.append(f"Description: {step.description}")
    if step.text_typed:
        parts.append(f"Text typed: {step.text_typed}")
    if step.key_pressed:
        parts.append(f"Key pressed: {step.key_pressed}")
    if step.content:
        parts.append(f"Content: {step.content}")
    
    # Include rich element data when available (from Chrome plugin or desktop native)
    ei = step.element_info
    if ei and isinstance(ei, dict):
        # Prefer the most semantically useful fields; skip noisy ones
        for key, label in [
            ("ariaLabel", "ARIA label"),
            ("role", "Element role"),
            ("tagName", "HTML tag"),
            ("associatedLabel", "Field label"),
            ("placeholder", "Placeholder"),
            ("title", "Element title"),
            ("text", "Element text"),
            ("alt", "Alt text"),
            ("testId", "Test ID"),
            ("id", "DOM ID"),
            ("href", "Link URL"),
            ("name", "Name attr"),
            ("type", "Input type"),
            # Desktop native fields
            ("description", "AX description"),
            ("subrole", "AX subrole"),
            ("domId", "DOM ID"),
        ]:
            val = ei.get(key)
            if val and isinstance(val, str) and len(val) < 200:
                parts.append(f"{label}: {val}")

    return " | ".join(parts)


async def _llm_json_call(messages: list[dict], base_url_override: Optional[str] = None) -> dict:
    """Make a non-streaming LLM call and parse JSON from the response."""
    try:
        resp = await llm_service.chat_completion(
            messages=messages,
            stream=False,
            base_url_override=base_url_override,
        )
        # resp is an httpx.Response when stream=False
        if resp.status_code != 200:
            logger.error("LLM call failed with status %s: %s", resp.status_code, resp.text)
            return {}
        body = resp.json()

        # Extract text content from response
        provider = llm_service._provider()
        if provider == "anthropic":
            text = ""
            for block in body.get("content", []):
                if block.get("type") == "text":
                    text += block.get("text", "")
        else:
            text = body.get("choices", [{}])[0].get("message", {}).get("content", "")

        # Parse JSON from text (handle markdown code fences)
        text = text.strip()
        if text.startswith("```"):
            # Remove code fences
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines).strip()

        return json.loads(text)
    except (json.JSONDecodeError, Exception) as exc:
        logger.warning("Failed to parse LLM JSON response: %s", exc)
        return {}


def _build_vision_message(text: str, image_b64: Optional[str]) -> list[dict]:
    """Build a user message with optional vision content."""
    if image_b64:
        return [{
            "role": "user",
            "content": [
                {"type": "text", "text": text},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{image_b64}",
                    },
                },
            ],
        }]
    return [{"role": "user", "content": text}]


class RecordingAutoProcessor:
    """Processes a recording's steps through the LLM pipeline."""

    async def process_recording(self, recording_id: str, db: AsyncSession) -> dict:
        """Full pipeline:
        1. For each step: generate title + description from screenshot + action metadata
        2. Generate recording summary
        3. Store results back on models
        """
        stmt = (
            select(ProcessRecordingSession)
            .where(ProcessRecordingSession.id == recording_id)
            .options(
                selectinload(ProcessRecordingSession.steps),
                selectinload(ProcessRecordingSession.files),
            )
        )
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()
        if not session:
            raise ValueError(f"Recording {recording_id} not found")

        # Build file lookup: step_number -> file record
        file_map: dict[int, ProcessRecordingFile] = {}
        for f in session.files:
            file_map[f.step_number] = f

        steps = sorted(session.steps, key=lambda s: s.step_number)

        base_url_override = await dataveil_service.get_proxied_base_url_with_fallback()

        # 1. Annotate each step concurrently
        annotated_count = 0
        tasks = []
        for step in steps:
            image_b64 = None
            if step.step_number in file_map and session.storage_path:
                image_b64 = await _read_image_base64(
                    file_map[step.step_number].file_path,
                    session.storage_path,
                    session.storage_type or "local",
                )
            tasks.append(self._annotate_step(step, image_b64, base_url_override))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for step, result_data in zip(steps, results):
            if isinstance(result_data, Exception):
                logger.warning("Annotation failed for step %s: %s", step.step_number, result_data)
                continue
            if result_data:
                step.generated_title = result_data.get("title", "")
                step.generated_description = result_data.get("description", "")
                step.ui_element = result_data.get("ui_element", "")
                step.step_category = result_data.get("category", "")
                step.is_annotated = True
                annotated_count += 1

        # 2. Generate recording summary
        summary_data = await self.generate_summary(steps, base_url_override)
        if summary_data:
            session.generated_title = summary_data.get("title", "")
            session.summary = summary_data.get("summary", "")
            session.tags = summary_data.get("tags", [])
            session.estimated_time = summary_data.get("estimated_time", "")
            session.difficulty = summary_data.get("difficulty", "")

        session.is_processed = True

        await db.commit()

        return {
            "recording_id": recording_id,
            "steps_annotated": annotated_count,
            "total_steps": len(steps),
            "has_summary": bool(summary_data),
        }

    async def _annotate_step(
        self,
        step: ProcessRecordingStep,
        image_b64: Optional[str],
        base_url_override: Optional[str] = None,
    ) -> dict:
        """Annotate a single step with LLM."""
        async with _SEMAPHORE:
            return await self.annotate_step(step, image_b64, base_url_override)

    async def annotate_step(
        self,
        step: ProcessRecordingStep,
        image_b64: Optional[str] = None,
        base_url_override: Optional[str] = None,
    ) -> dict:
        """Send step screenshot + metadata to LLM, get back annotation."""
        context = _build_step_context(step)

        prompt = (
            "You are a workflow documentation assistant. Analyze this step from a process recording "
            "and return a JSON object with exactly these fields:\n"
            '- "title": a concise step title (e.g. "Click the Save button")\n'
            '- "description": a one-sentence description of what happens in this step\n'
            '- "ui_element": the main UI element being interacted with (e.g. "Save button", "Email field")\n'
            '- "category": one of: navigation, data_entry, confirmation, selection, scrolling, typing, other\n\n'
            f"Step metadata: {context}\n\n"
            "Return ONLY valid JSON, no extra text."
        )

        messages = [
            {"role": "system", "content": "You are a precise workflow documentation assistant. Always respond with valid JSON only."},
        ] + _build_vision_message(prompt, image_b64)

        return await _llm_json_call(messages, base_url_override)

    async def generate_summary(
        self,
        steps: list[ProcessRecordingStep],
        base_url_override: Optional[str] = None,
    ) -> dict:
        """Generate recording-level summary."""
        steps_text = []
        for step in steps:
            title = step.generated_title or step.description or f"Step {step.step_number}"
            desc = step.generated_description or ""
            steps_text.append(f"  {step.step_number}. {title}" + (f" — {desc}" if desc else ""))

        prompt = (
            "You are a workflow documentation assistant. Given this list of steps from a process recording, "
            "generate a JSON object with:\n"
            '- "title": a descriptive workflow title (e.g. "How to Reset a User Password")\n'
            '- "summary": a 2-3 sentence overview of what this workflow accomplishes\n'
            '- "tags": a list of 3-8 searchable keywords/tags\n'
            '- "estimated_time": estimated time to complete (e.g. "2-3 minutes")\n'
            '- "difficulty": one of: easy, medium, advanced\n\n'
            f"Steps:\n{''.join(steps_text)}\n\n"
            "Return ONLY valid JSON, no extra text."
        )

        messages = [
            {"role": "system", "content": "You are a precise workflow documentation assistant. Always respond with valid JSON only."},
            {"role": "user", "content": prompt},
        ]

        return await _llm_json_call(messages, base_url_override)

    async def generate_guide(
        self,
        recording_id: str,
        db: AsyncSession,
    ) -> str:
        """Generate a polished markdown guide from all steps."""
        stmt = (
            select(ProcessRecordingSession)
            .where(ProcessRecordingSession.id == recording_id)
            .options(
                selectinload(ProcessRecordingSession.steps),
                selectinload(ProcessRecordingSession.files),
            )
        )
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()
        if not session:
            raise ValueError(f"Recording {recording_id} not found")

        steps = sorted(session.steps, key=lambda s: s.step_number)

        steps_text = []
        for step in steps:
            title = step.generated_title or step.description or f"Step {step.step_number}"
            desc = step.generated_description or step.description or ""
            category = step.step_category or ""
            ui = step.ui_element or ""
            window = step.window_title or ""
            parts = [f"Step {step.step_number}: {title}"]
            if desc:
                parts.append(f"  Description: {desc}")
            if category:
                parts.append(f"  Category: {category}")
            if ui:
                parts.append(f"  UI Element: {ui}")
            if step.owner_app:
                parts.append(f"  Application: {step.owner_app}")
            if window:
                parts.append(f"  Window: {window}")
            if step.url:
                parts.append(f"  URL: {step.url}")
            if step.text_typed:
                parts.append(f"  Text entered: {step.text_typed}")
            steps_text.append("\n".join(parts))

        workflow_title = session.generated_title or session.name or "Untitled Workflow"
        summary = session.summary or ""

        prompt = (
            "You are a technical writer. Create a polished, professional markdown guide from these workflow steps.\n\n"
            f"Workflow: {workflow_title}\n"
            f"Summary: {summary}\n\n"
            "Steps:\n" + "\n\n".join(steps_text) + "\n\n"
            "Create a complete guide with:\n"
            "1. A title (# heading)\n"
            "2. An introduction paragraph\n"
            "3. Prerequisites (if any can be inferred)\n"
            "4. Numbered step-by-step instructions with clear descriptions\n"
            "5. Tips or warnings where appropriate (use > blockquotes)\n"
            "6. A brief conclusion\n\n"
            "Use proper markdown formatting. Make it helpful and professional."
        )

        base_url_override = await dataveil_service.get_proxied_base_url_with_fallback()

        messages = [
            {"role": "system", "content": "You are an expert technical writer. Write clear, helpful documentation in markdown format."},
            {"role": "user", "content": prompt},
        ]

        try:
            resp = await llm_service.chat_completion(
                messages=messages,
                stream=False,
                base_url_override=base_url_override,
            )
            if resp.status_code != 200:
                raise RuntimeError(f"LLM call failed: {resp.status_code}")

            body = resp.json()
            provider = llm_service._provider()
            if provider == "anthropic":
                text = ""
                for block in body.get("content", []):
                    if block.get("type") == "text":
                        text += block.get("text", "")
            else:
                text = body.get("choices", [{}])[0].get("message", {}).get("content", "")

            # Store guide on session
            session.guide_markdown = text.strip()
            await db.commit()

            return text.strip()
        except Exception as exc:
            logger.error("Guide generation failed: %s", exc)
            raise

    async def generate_guide_stream(
        self,
        recording_id: str,
        db: AsyncSession,
    ):
        """Stream a polished markdown guide (yields SSE lines)."""
        stmt = (
            select(ProcessRecordingSession)
            .where(ProcessRecordingSession.id == recording_id)
            .options(
                selectinload(ProcessRecordingSession.steps),
                selectinload(ProcessRecordingSession.files),
            )
        )
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()
        if not session:
            raise ValueError(f"Recording {recording_id} not found")

        steps = sorted(session.steps, key=lambda s: s.step_number)

        steps_text = []
        for step in steps:
            title = step.generated_title or step.description or f"Step {step.step_number}"
            desc = step.generated_description or step.description or ""
            parts = [f"Step {step.step_number}: {title}"]
            if desc:
                parts.append(f"  Description: {desc}")
            if step.step_category:
                parts.append(f"  Category: {step.step_category}")
            if step.ui_element:
                parts.append(f"  UI Element: {step.ui_element}")
            if step.owner_app:
                parts.append(f"  Application: {step.owner_app}")
            if step.window_title:
                parts.append(f"  Window: {step.window_title}")
            if step.url:
                parts.append(f"  URL: {step.url}")
            steps_text.append("\n".join(parts))

        workflow_title = session.generated_title or session.name or "Untitled Workflow"
        summary = session.summary or ""

        prompt = (
            "You are a technical writer. Create a polished, professional markdown guide from these workflow steps.\n\n"
            f"Workflow: {workflow_title}\n"
            f"Summary: {summary}\n\n"
            "Steps:\n" + "\n\n".join(steps_text) + "\n\n"
            "Create a complete guide with:\n"
            "1. A title (# heading)\n"
            "2. An introduction paragraph\n"
            "3. Prerequisites (if any can be inferred)\n"
            "4. Numbered step-by-step instructions with clear descriptions\n"
            "5. Tips or warnings where appropriate (use > blockquotes)\n"
            "6. A brief conclusion\n\n"
            "Use proper markdown formatting. Make it helpful and professional."
        )

        base_url_override = await dataveil_service.get_proxied_base_url_with_fallback()

        messages = [
            {"role": "system", "content": "You are an expert technical writer. Write clear, helpful documentation in markdown format."},
            {"role": "user", "content": prompt},
        ]

        result_iter = await llm_service.chat_completion(
            messages=messages,
            stream=True,
            base_url_override=base_url_override,
        )

        # result_iter is an AsyncIterator[str] yielding SSE lines
        full_text = ""
        async for sse_line in result_iter:
            yield sse_line
            # Also accumulate for saving
            line = sse_line.strip()
            if line.startswith("data: ") and line[6:] != "[DONE]":
                try:
                    chunk = json.loads(line[6:])
                    content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    full_text += content
                except (json.JSONDecodeError, IndexError):
                    pass

        # Save the generated guide
        session_obj = await db.get(ProcessRecordingSession, recording_id)
        if session_obj and full_text:
            session_obj.guide_markdown = full_text.strip()
            await db.commit()

    async def improve_step(
        self,
        step: ProcessRecordingStep,
        base_url_override: Optional[str] = None,
    ) -> dict:
        """Rewrite a step description to be clearer and more helpful."""
        context = _build_step_context(step)
        current_title = step.generated_title or step.description or f"Step {step.step_number}"
        current_desc = step.generated_description or step.description or ""

        prompt = (
            "You are a workflow documentation assistant. Improve this step to be clearer and more helpful.\n\n"
            f"Current title: {current_title}\n"
            f"Current description: {current_desc}\n"
            f"Step metadata: {context}\n\n"
            "Return a JSON object with:\n"
            '- "title": an improved, clearer step title\n'
            '- "description": a more helpful, detailed one-sentence description\n'
            '- "ui_element": the main UI element (keep or improve)\n'
            '- "category": one of: navigation, data_entry, confirmation, selection, scrolling, typing, other\n\n'
            "Return ONLY valid JSON, no extra text."
        )

        messages = [
            {"role": "system", "content": "You are a precise workflow documentation assistant. Always respond with valid JSON only."},
            {"role": "user", "content": prompt},
        ]

        return await _llm_json_call(messages, base_url_override)


# Singleton instance
auto_processor = RecordingAutoProcessor()
