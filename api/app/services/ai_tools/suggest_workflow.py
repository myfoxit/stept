"""
AI Tool: suggest_workflow — "How do I do X?" Search workflows by description/steps.

Uses semantic search (pgvector embeddings) when available, falls back to keyword search.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

from app.models import ProcessRecordingSession, ProcessRecordingStep

name = "suggest_workflow"
description = (
    "Search for relevant workflows that answer 'How do I do X?' questions. "
    "Searches workflow names, descriptions, step descriptions, and generated titles. "
    "Returns matching workflows with their key steps."
)
parameters = {
    "type": "object",
    "properties": {
        "question": {
            "type": "string",
            "description": "The user's question, e.g. 'How do I create an invoice?' or 'deploy to production'",
        },
    },
    "required": ["question"],
}


async def _semantic_search(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    question: str,
) -> list[dict] | None:
    """
    Try semantic search via embeddings. Returns None if unavailable.
    """
    try:
        from app.services.embeddings import generate_embedding, has_embedding_api

        if not has_embedding_api():
            return None

        query_vector = await generate_embedding(question)
        if query_vector is None:
            return None

        from sqlalchemy import text as sa_text

        vector_str = "[" + ",".join(str(v) for v in query_vector) + "]"

        sql = sa_text("""
            SELECT
                e.source_type,
                e.source_id,
                e.metadata,
                e.embedding <=> :query_vector AS distance
            FROM embeddings e
            WHERE e.metadata->>'user_id' = :user_id
            {project_filter}
            ORDER BY e.embedding <=> :query_vector
            LIMIT 20
        """.format(
            project_filter="AND e.metadata->>'project_id' = :project_id" if project_id else ""
        ))

        params = {"query_vector": vector_str, "user_id": user_id}
        if project_id:
            params["project_id"] = project_id

        result = await db.execute(sql, params)
        rows = result.fetchall()

        if not rows:
            return None

        # Group by workflow, get top session IDs
        workflow_scores: dict[str, float] = {}
        for source_type, source_id, metadata, distance in rows:
            score = max(0.0, 1.0 - distance)
            meta = metadata or {}
            wf_id = source_id if source_type == "workflow" else meta.get("session_id", "")
            if wf_id:
                workflow_scores[wf_id] = max(workflow_scores.get(wf_id, 0), score)

        # Sort by score and take top 5
        sorted_ids = sorted(workflow_scores.keys(), key=lambda k: workflow_scores[k], reverse=True)[:5]

        # Load full workflow data
        workflows = []
        for wf_id in sorted_ids:
            stmt = (
                select(ProcessRecordingSession)
                .where(
                    ProcessRecordingSession.id == wf_id,
                    ProcessRecordingSession.user_id == user_id,
                )
                .options(selectinload(ProcessRecordingSession.steps))
            )
            res = await db.execute(stmt)
            wf = res.scalar_one_or_none()
            if wf:
                workflows.append((wf, workflow_scores[wf_id]))

        if not workflows:
            return None

        suggestions = []
        for wf, score in workflows:
            steps = sorted(wf.steps, key=lambda s: s.step_number)
            key_steps = []
            for s in steps[:5]:
                desc = s.generated_description or s.description or s.window_title or f"Step {s.step_number}"
                key_steps.append(f"Step {s.step_number}: {desc}")

            suggestions.append({
                "workflow_id": wf.id,
                "name": wf.name or wf.generated_title or "Untitled Workflow",
                "summary": wf.summary,
                "total_steps": len(steps),
                "key_steps": key_steps,
                "tags": wf.tags or [],
                "relevance_score": round(score, 4),
            })

        return suggestions

    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Semantic search failed, falling back: %s", exc)
        return None


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    question = kwargs.get("question", "")

    if not question:
        return {"error": "A question is required."}

    # Try semantic search first
    semantic_results = await _semantic_search(db, user_id, project_id, question)
    if semantic_results is not None:
        if not semantic_results:
            return {
                "success": True,
                "count": 0,
                "suggestions": [],
                "search_type": "semantic",
                "message": f"No workflows found matching '{question}'. Try different keywords.",
            }
        return {
            "success": True,
            "count": len(semantic_results),
            "suggestions": semantic_results,
            "search_type": "semantic",
            "message": f"Found {len(semantic_results)} relevant workflow(s) for '{question}'",
        }

    # Fallback: keyword search (original implementation)
    # Extract keywords from the question (simple approach)
    stop_words = {"how", "do", "i", "can", "to", "the", "a", "an", "in", "on", "is", "it", "what", "where", "when", "why", "does", "should"}
    words = [w.strip("?.,!") for w in question.lower().split() if w.strip("?.,!") not in stop_words and len(w.strip("?.,!")) > 1]

    if not words:
        words = question.lower().split()[:3]

    # Search workflows by name/title/summary
    workflow_stmt = select(ProcessRecordingSession).where(
        ProcessRecordingSession.user_id == user_id,
        ProcessRecordingSession.status == "completed",
    )

    if project_id:
        workflow_stmt = workflow_stmt.where(ProcessRecordingSession.project_id == project_id)

    # Build search conditions across multiple fields
    search_conditions = []
    for word in words:
        pattern = f"%{word}%"
        search_conditions.append(ProcessRecordingSession.name.ilike(pattern))
        search_conditions.append(ProcessRecordingSession.generated_title.ilike(pattern))
        search_conditions.append(ProcessRecordingSession.summary.ilike(pattern))

    workflow_stmt = workflow_stmt.where(or_(*search_conditions)) if search_conditions else workflow_stmt
    workflow_stmt = workflow_stmt.options(selectinload(ProcessRecordingSession.steps))
    workflow_stmt = workflow_stmt.limit(10)

    result = await db.execute(workflow_stmt)
    workflows = result.scalars().all()

    # Also search step descriptions for matches
    if not workflows:
        step_stmt = (
            select(ProcessRecordingStep.session_id)
            .where(
                or_(
                    *[ProcessRecordingStep.description.ilike(f"%{w}%") for w in words],
                    *[ProcessRecordingStep.generated_description.ilike(f"%{w}%") for w in words],
                    *[ProcessRecordingStep.window_title.ilike(f"%{w}%") for w in words],
                )
            )
            .distinct()
            .limit(10)
        )
        step_result = await db.execute(step_stmt)
        session_ids = [row[0] for row in step_result.all()]

        if session_ids:
            workflow_stmt2 = (
                select(ProcessRecordingSession)
                .where(
                    ProcessRecordingSession.id.in_(session_ids),
                    ProcessRecordingSession.user_id == user_id,
                )
                .options(selectinload(ProcessRecordingSession.steps))
            )
            result2 = await db.execute(workflow_stmt2)
            workflows = result2.scalars().all()

    suggestions = []
    for w in workflows:
        steps = sorted(w.steps, key=lambda s: s.step_number)
        key_steps = []
        for s in steps[:5]:  # Show first 5 steps
            desc = s.generated_description or s.description or s.window_title or f"Step {s.step_number}"
            key_steps.append(f"Step {s.step_number}: {desc}")

        suggestions.append({
            "workflow_id": w.id,
            "name": w.name or w.generated_title or "Untitled Workflow",
            "summary": w.summary,
            "total_steps": len(steps),
            "key_steps": key_steps,
            "tags": w.tags or [],
        })

    if not suggestions:
        return {
            "success": True,
            "count": 0,
            "suggestions": [],
            "search_type": "keyword",
            "message": f"No workflows found matching '{question}'. Try different keywords.",
        }

    return {
        "success": True,
        "count": len(suggestions),
        "suggestions": suggestions,
        "search_type": "keyword",
        "message": f"Found {len(suggestions)} relevant workflow(s) for '{question}'",
    }
