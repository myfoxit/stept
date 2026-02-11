"""
Indexer service — maintains embedding vectors for workflows and steps.

Auto-indexes on workflow create/update. Supports bulk reindex.
Uses content hashing to skip re-embedding unchanged content.
"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ProcessRecordingSession, ProcessRecordingStep, Embedding
from app.services.embeddings import (
    content_hash,
    generate_embeddings,
    has_embedding_api,
    step_text,
    workflow_text,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Core indexing
# ---------------------------------------------------------------------------

async def index_workflow(session_id: str, db: AsyncSession) -> int:
    """
    Index (or re-index) a single workflow and all its steps.
    Returns the number of embeddings created/updated.
    """
    if not has_embedding_api():
        logger.debug("No embedding API available — skipping index for %s", session_id)
        return 0

    # Load workflow with steps
    stmt = (
        select(ProcessRecordingSession)
        .where(ProcessRecordingSession.id == session_id)
        .options(selectinload(ProcessRecordingSession.steps))
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        logger.warning("Workflow %s not found for indexing", session_id)
        return 0

    # Collect texts + metadata for batch embedding
    items: list[dict] = []

    # Workflow-level text
    wf_text = workflow_text(session)
    if wf_text.strip():
        items.append({
            "source_type": "workflow",
            "source_id": session.id,
            "text": wf_text,
            "metadata": {
                "name": session.name,
                "generated_title": session.generated_title,
                "project_id": session.project_id,
                "user_id": session.user_id,
            },
        })

    # Step-level texts
    for step in sorted(session.steps, key=lambda s: s.step_number):
        s_text = step_text(step)
        if s_text.strip():
            items.append({
                "source_type": "step",
                "source_id": step.id,
                "text": s_text,
                "metadata": {
                    "session_id": session.id,
                    "step_number": step.step_number,
                    "project_id": session.project_id,
                    "user_id": session.user_id,
                    "workflow_name": session.name or session.generated_title,
                },
            })

    if not items:
        return 0

    # Check content hashes to skip unchanged
    items_to_embed: list[dict] = []
    for item in items:
        h = content_hash(item["text"])
        item["hash"] = h

        # Check if embedding with same hash already exists
        existing = await db.execute(
            select(Embedding).where(
                and_(
                    Embedding.source_type == item["source_type"],
                    Embedding.source_id == item["source_id"],
                    Embedding.content_hash == h,
                )
            )
        )
        if existing.scalar_one_or_none():
            continue  # Already up-to-date
        items_to_embed.append(item)

    if not items_to_embed:
        logger.debug("All embeddings for workflow %s are up-to-date", session_id)
        return 0

    # Generate embeddings in batch
    texts = [item["text"] for item in items_to_embed]
    vectors = await generate_embeddings(texts)

    if vectors is None:
        logger.error("Embedding generation failed for workflow %s", session_id)
        return 0

    # Upsert embeddings
    count = 0
    for item, vector in zip(items_to_embed, vectors):
        # Delete old embedding for this source (if any)
        await db.execute(
            delete(Embedding).where(
                and_(
                    Embedding.source_type == item["source_type"],
                    Embedding.source_id == item["source_id"],
                )
            )
        )

        # Insert new embedding
        emb = Embedding(
            source_type=item["source_type"],
            source_id=item["source_id"],
            content_hash=item["hash"],
            embedding=vector,
            metadata_=item["metadata"],
        )
        db.add(emb)
        count += 1

    await db.flush()
    logger.info("Indexed %d embeddings for workflow %s", count, session_id)
    return count


async def index_workflow_background(session_id: str) -> None:
    """
    Index a workflow in a separate DB session (fire-and-forget from routers).
    """
    from app.database import session_scope

    try:
        async with session_scope() as db:
            await index_workflow(session_id, db)
    except Exception as exc:
        logger.error("Background indexing failed for %s: %s", session_id, exc)


async def reindex_project(project_id: str, user_id: str, db: AsyncSession) -> int:
    """Reindex all workflows in a project. Returns total embeddings created."""
    stmt = select(ProcessRecordingSession.id).where(
        and_(
            ProcessRecordingSession.project_id == project_id,
            ProcessRecordingSession.user_id == user_id,
            ProcessRecordingSession.status == "completed",
        )
    )
    result = await db.execute(stmt)
    session_ids = [row[0] for row in result.all()]

    total = 0
    for sid in session_ids:
        total += await index_workflow(sid, db)

    return total


async def reindex_all_for_user(user_id: str, db: AsyncSession) -> int:
    """Reindex all workflows for a user across all projects."""
    stmt = select(ProcessRecordingSession.id).where(
        and_(
            ProcessRecordingSession.user_id == user_id,
            ProcessRecordingSession.status == "completed",
        )
    )
    result = await db.execute(stmt)
    session_ids = [row[0] for row in result.all()]

    total = 0
    for sid in session_ids:
        total += await index_workflow(sid, db)

    return total


async def delete_workflow_embeddings(session_id: str, db: AsyncSession) -> int:
    """Remove all embeddings for a workflow (workflow + step embeddings)."""
    # Get step IDs for this workflow
    step_stmt = select(ProcessRecordingStep.id).where(
        ProcessRecordingStep.session_id == session_id
    )
    step_result = await db.execute(step_stmt)
    step_ids = [row[0] for row in step_result.all()]

    # Delete workflow embedding
    result1 = await db.execute(
        delete(Embedding).where(
            and_(
                Embedding.source_type == "workflow",
                Embedding.source_id == session_id,
            )
        )
    )

    # Delete step embeddings
    deleted = result1.rowcount
    if step_ids:
        result2 = await db.execute(
            delete(Embedding).where(
                and_(
                    Embedding.source_type == "step",
                    Embedding.source_id.in_(step_ids),
                )
            )
        )
        deleted += result2.rowcount

    return deleted
