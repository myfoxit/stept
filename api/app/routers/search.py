"""
Smart Search router.

Searches across recording titles, summaries, tags, step titles and descriptions.
Returns ranked results with highlighted matches.
Includes semantic search via pgvector embeddings.
"""

from __future__ import annotations

import logging
from typing import Optional

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy import or_, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session as get_db
from app.models import ProcessRecordingSession, ProcessRecordingStep, User, Embedding, Document
from app.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


def _highlight(text: str, query: str) -> str:
    """Simple case-insensitive highlight using <mark> tags."""
    if not text or not query:
        return text or ""
    import re
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    return pattern.sub(lambda m: f"<mark>{m.group()}</mark>", text)


@router.get("/search")
async def smart_search(
    q: str = Query(..., min_length=1, description="Search query"),
    project_id: str = Query(..., description="Project ID to search within"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Search across recordings and steps within a project.

    Searches: recording name, generated_title, summary, tags,
    step descriptions, generated_title, generated_description, window_title.
    """
    search_term = f"%{q}%"

    # 1. Search recordings
    recording_conditions = [
        ProcessRecordingSession.project_id == project_id,
        or_(
            ProcessRecordingSession.is_private == False,  # noqa: E712
            and_(
                ProcessRecordingSession.is_private == True,  # noqa: E712
                ProcessRecordingSession.owner_id == current_user.id,
            ),
        ),
        or_(
            ProcessRecordingSession.name.ilike(search_term),
            ProcessRecordingSession.generated_title.ilike(search_term),
            ProcessRecordingSession.summary.ilike(search_term),
            func.cast(ProcessRecordingSession.tags, _text_type()).ilike(search_term),
        ),
    ]

    stmt = (
        select(ProcessRecordingSession)
        .where(and_(*recording_conditions))
        .limit(limit)
    )
    result = await db.execute(stmt)
    matched_recordings = result.scalars().all()

    # 2. Search steps (and get their parent recording)
    step_conditions = [
        ProcessRecordingStep.session_id == ProcessRecordingSession.id,
        ProcessRecordingSession.project_id == project_id,
        or_(
            ProcessRecordingSession.is_private == False,  # noqa: E712
            and_(
                ProcessRecordingSession.is_private == True,  # noqa: E712
                ProcessRecordingSession.owner_id == current_user.id,
            ),
        ),
        or_(
            ProcessRecordingStep.description.ilike(search_term),
            ProcessRecordingStep.generated_title.ilike(search_term),
            ProcessRecordingStep.generated_description.ilike(search_term),
            ProcessRecordingStep.window_title.ilike(search_term),
            ProcessRecordingStep.content.ilike(search_term),
        ),
    ]

    step_stmt = (
        select(ProcessRecordingStep, ProcessRecordingSession)
        .join(ProcessRecordingSession, ProcessRecordingStep.session_id == ProcessRecordingSession.id)
        .where(and_(*step_conditions))
        .limit(limit)
    )
    step_result = await db.execute(step_stmt)
    matched_steps = step_result.all()

    # Build response
    recording_results = []
    seen_recording_ids = set()

    for rec in matched_recordings:
        seen_recording_ids.add(rec.id)
        recording_results.append({
            "type": "recording",
            "recording_id": rec.id,
            "name": rec.name,
            "name_highlighted": _highlight(rec.name or "", q),
            "generated_title": rec.generated_title,
            "generated_title_highlighted": _highlight(rec.generated_title or "", q),
            "summary": rec.summary,
            "summary_highlighted": _highlight(rec.summary or "", q),
            "tags": rec.tags,
            "is_processed": rec.is_processed,
            "matching_steps": [],
        })

    # Group step results by recording
    step_by_recording: dict[str, list] = {}
    for step, recording in matched_steps:
        rec_id = recording.id
        if rec_id not in step_by_recording:
            step_by_recording[rec_id] = []
        step_by_recording[rec_id].append({
            "step_id": step.id,
            "step_number": step.step_number,
            "description": step.description,
            "description_highlighted": _highlight(step.description or "", q),
            "generated_title": step.generated_title,
            "generated_title_highlighted": _highlight(step.generated_title or "", q),
            "window_title": step.window_title,
        })

        # If recording wasn't already in results, add it
        if rec_id not in seen_recording_ids:
            seen_recording_ids.add(rec_id)
            recording_results.append({
                "type": "recording",
                "recording_id": recording.id,
                "name": recording.name,
                "name_highlighted": recording.name or "",
                "generated_title": recording.generated_title,
                "generated_title_highlighted": recording.generated_title or "",
                "summary": recording.summary,
                "summary_highlighted": recording.summary or "",
                "tags": recording.tags,
                "is_processed": recording.is_processed,
                "matching_steps": [],
            })

    # Attach matching steps
    for item in recording_results:
        rec_id = item["recording_id"]
        if rec_id in step_by_recording:
            item["matching_steps"] = step_by_recording[rec_id]

    return {
        "query": q,
        "total_results": len(recording_results),
        "results": recording_results[:limit],
    }


def _text_type():
    """Return SQLAlchemy Text type for casting."""
    from sqlalchemy import Text
    return Text


# ---------------------------------------------------------------------------
# Semantic search endpoint
# ---------------------------------------------------------------------------

@router.get("/semantic")
async def semantic_search(
    q: str = Query(..., min_length=1, description="Search query"),
    project_id: Optional[str] = Query(None, description="Project ID (optional, searches all if omitted)"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Semantic search across workflows using vector embeddings.
    Falls back to keyword search when embeddings are not available.
    """
    from app.services.embeddings import (
        generate_embedding,
        has_embedding_api,
        keyword_similarity,
        workflow_text,
        step_text,
    )

    # Try vector search first
    if has_embedding_api():
        query_vector = await generate_embedding(q)
        if query_vector is not None:
            return await _vector_search(
                q, query_vector, current_user.id, project_id, limit, db
            )

    # Fallback: keyword-based search
    return await _keyword_search(q, current_user.id, project_id, limit, db)


async def _vector_search(
    query: str,
    query_vector: list[float],
    user_id: str,
    project_id: Optional[str],
    limit: int,
    db: AsyncSession,
) -> dict:
    """Perform cosine similarity search using pgvector."""
    from sqlalchemy import text as sa_text

    # Build query: join embeddings with workflows, filter by user, order by cosine distance
    # We search both workflow and step embeddings
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
        LIMIT :limit
    """.format(
        project_filter="AND e.metadata->>'project_id' = :project_id" if project_id else ""
    ))

    params = {
        "query_vector": vector_str,
        "user_id": user_id,
        "limit": limit * 2,  # Fetch more to group steps by workflow
    }
    if project_id:
        params["project_id"] = project_id

    result = await db.execute(sql, params)
    rows = result.fetchall()

    # Group results by workflow
    seen_workflows: dict[str, dict] = {}
    workflow_scores: dict[str, float] = {}

    for source_type, source_id, metadata, distance in rows:
        score = max(0.0, 1.0 - distance)  # cosine distance → similarity
        meta = metadata or {}

        if source_type == "workflow":
            wf_id = source_id
            if wf_id not in seen_workflows:
                seen_workflows[wf_id] = {"matching_steps": []}
                workflow_scores[wf_id] = score
            else:
                workflow_scores[wf_id] = max(workflow_scores[wf_id], score)
        elif source_type == "step":
            wf_id = meta.get("session_id", "")
            if not wf_id:
                continue
            if wf_id not in seen_workflows:
                seen_workflows[wf_id] = {"matching_steps": []}
                workflow_scores[wf_id] = score
            else:
                workflow_scores[wf_id] = max(workflow_scores[wf_id], score)
            seen_workflows[wf_id]["matching_steps"].append({
                "step_id": source_id,
                "step_number": meta.get("step_number"),
                "score": round(score, 4),
            })

    # Fetch full workflow data for top results
    sorted_wf_ids = sorted(workflow_scores.keys(), key=lambda k: workflow_scores[k], reverse=True)[:limit]

    results = []
    for wf_id in sorted_wf_ids:
        session = await db.get(ProcessRecordingSession, wf_id)
        if not session:
            continue
        # Security: verify user access
        if session.user_id != user_id:
            continue
        if session.is_private and session.owner_id != user_id:
            continue

        wf_data = seen_workflows[wf_id]
        results.append({
            "type": "recording",
            "recording_id": session.id,
            "name": session.name,
            "generated_title": session.generated_title,
            "summary": session.summary,
            "tags": session.tags,
            "is_processed": session.is_processed,
            "score": round(workflow_scores[wf_id], 4),
            "matching_steps": wf_data["matching_steps"][:5],
        })

    return {
        "query": query,
        "search_type": "semantic",
        "total_results": len(results),
        "results": results,
    }


async def _keyword_search(
    query: str,
    user_id: str,
    project_id: Optional[str],
    limit: int,
    db: AsyncSession,
) -> dict:
    """Fallback keyword-based search with relevance scoring."""
    from app.services.embeddings import keyword_similarity, workflow_text, step_text

    # Load all user workflows (within project if specified)
    conditions = [
        ProcessRecordingSession.user_id == user_id,
        ProcessRecordingSession.status == "completed",
    ]
    if project_id:
        conditions.append(ProcessRecordingSession.project_id == project_id)

    stmt = (
        select(ProcessRecordingSession)
        .where(and_(*conditions))
        .options(selectinload(ProcessRecordingSession.steps))
    )
    result = await db.execute(stmt)
    workflows = result.scalars().all()

    scored_results = []
    for wf in workflows:
        # Security: skip private workflows not owned by user
        if wf.is_private and wf.owner_id != user_id:
            continue

        wf_text = workflow_text(wf)
        wf_score = keyword_similarity(query, wf_text)

        # Also score steps
        step_scores = []
        for step in sorted(wf.steps, key=lambda s: s.step_number):
            s_text = step_text(step)
            if s_text.strip():
                s_score = keyword_similarity(query, s_text)
                if s_score > 0.15:
                    step_scores.append({
                        "step_id": step.id,
                        "step_number": step.step_number,
                        "score": round(s_score, 4),
                    })

        # Use best score from workflow or steps
        best_step_score = max((s["score"] for s in step_scores), default=0.0)
        overall_score = max(wf_score, best_step_score)

        if overall_score > 0.15:
            scored_results.append({
                "type": "recording",
                "recording_id": wf.id,
                "name": wf.name,
                "generated_title": wf.generated_title,
                "summary": wf.summary,
                "tags": wf.tags,
                "is_processed": wf.is_processed,
                "score": round(overall_score, 4),
                "matching_steps": sorted(step_scores, key=lambda s: s["score"], reverse=True)[:5],
            })

    # Sort by score descending
    scored_results.sort(key=lambda r: r["score"], reverse=True)

    return {
        "query": query,
        "search_type": "keyword",
        "total_results": len(scored_results[:limit]),
        "results": scored_results[:limit],
    }


# ---------------------------------------------------------------------------
# Reindex endpoint
# ---------------------------------------------------------------------------

@router.post("/reindex")
async def reindex_embeddings(
    project_id: Optional[str] = Query(None, description="Project ID to reindex (all if omitted)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger bulk reindexing of embeddings for the current user's workflows.
    """
    from app.services.indexer import reindex_project, reindex_all_for_user, index_document
    from app.services.embeddings import has_embedding_api

    if not has_embedding_api():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No embedding API configured. Set an OpenAI API key in LLM settings.",
        )

    try:
        if project_id:
            total = await reindex_project(project_id, current_user.id, db)
        else:
            total = await reindex_all_for_user(current_user.id, db)

        return {
            "status": "success",
            "embeddings_created": total,
            "message": f"Indexed {total} embeddings",
        }
    except Exception as exc:
        logger.error("Reindex failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Reindex failed: {exc}",
        )


# ---------------------------------------------------------------------------
# Unified search (workflows + documents)
# ---------------------------------------------------------------------------

def _extract_tiptap_text(content) -> str:
    """Recursively extract text from a TipTap JSON document."""
    if not isinstance(content, dict):
        return str(content) if content else ""
    texts: list[str] = []
    if "text" in content:
        texts.append(content["text"])
    for child in content.get("content", []):
        texts.append(_extract_tiptap_text(child))
    return " ".join(t for t in texts if t)


async def _search_documents_keyword(
    query: str,
    project_id: str,
    user_id: str,
    limit: int,
    db: AsyncSession,
) -> list[dict]:
    """Search documents by name and extracted text content."""
    from app.services.embeddings import keyword_similarity

    # Try tsvector search first (faster, better ranking)
    try:
        from sqlalchemy import text as sa_text
        ts_stmt = sa_text("""
            SELECT id, name, search_text, ts_rank(search_tsv, plainto_tsquery('english', :q)) as rank
            FROM documents
            WHERE project_id = :project_id
              AND search_tsv @@ plainto_tsquery('english', :q)
              AND (is_private = false OR owner_id = :user_id)
            ORDER BY rank DESC
            LIMIT :limit
        """)
        ts_result = await db.execute(ts_stmt, {"q": query, "project_id": project_id, "user_id": user_id, "limit": limit})
        ts_rows = ts_result.fetchall()
        if ts_rows:
            return [
                {"type": "document", "id": row.id, "name": row.name, "preview": (row.search_text or "")[:200], "score": round(float(row.rank), 4)}
                for row in ts_rows
            ]
    except Exception:
        pass  # Fall through to existing search

    query_lower = query.lower()

    # Load project documents (filter by access)
    doc_conditions = [
        Document.project_id == project_id,
        or_(
            Document.is_private == False,  # noqa: E712
            and_(
                Document.is_private == True,  # noqa: E712
                Document.owner_id == user_id,
            ),
        ),
    ]

    stmt = select(Document).where(and_(*doc_conditions))
    result = await db.execute(stmt)
    docs = result.scalars().all()

    scored: list[dict] = []
    for doc in docs:
        name = doc.name or ""
        text_content = _extract_tiptap_text(doc.content)
        full_text = f"{name} {text_content}"

        # Quick check: does the query even appear in the extracted text?
        name_match = query_lower in name.lower()
        content_match = query_lower in text_content.lower()

        if not name_match and not content_match:
            # Also try keyword_similarity for partial/fuzzy matching
            score = keyword_similarity(query, full_text)
            if score < 0.15:
                continue
        else:
            score = keyword_similarity(query, full_text)
            # Boost exact name matches
            if name_match:
                score = max(score, 0.5)

        preview = text_content[:200] if text_content else ""
        scored.append({
            "type": "document",
            "id": doc.id,
            "name": name,
            "preview": preview,
            "score": round(score, 4),
        })

    scored.sort(key=lambda r: r["score"], reverse=True)
    return scored[:limit]


@router.get("/unified")
async def unified_search(
    q: str = Query(..., min_length=1, description="Search query"),
    project_id: str = Query(..., description="Project ID to search within"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Unified keyword search across workflows AND documents.
    Returns results sorted by relevance score.
    """
    from app.services.embeddings import keyword_similarity, workflow_text, step_text

    # Search workflows (reuse _keyword_search logic inline for unified scoring)
    wf_conditions = [
        ProcessRecordingSession.user_id == current_user.id,
        ProcessRecordingSession.status == "completed",
        ProcessRecordingSession.project_id == project_id,
    ]
    stmt = (
        select(ProcessRecordingSession)
        .where(and_(*wf_conditions))
        .options(selectinload(ProcessRecordingSession.steps))
    )
    result = await db.execute(stmt)
    workflows = result.scalars().all()

    all_results: list[dict] = []

    for wf in workflows:
        if wf.is_private and wf.owner_id != current_user.id:
            continue
        wf_text_str = workflow_text(wf)
        wf_score = keyword_similarity(q, wf_text_str)

        step_scores = []
        for step in sorted(wf.steps, key=lambda s: s.step_number):
            s_text = step_text(step)
            if s_text.strip():
                s_score = keyword_similarity(q, s_text)
                if s_score > 0.15:
                    step_scores.append({
                        "step_id": step.id,
                        "step_number": step.step_number,
                        "generated_title": step.generated_title,
                        "score": round(s_score, 4),
                    })

        best_step_score = max((s["score"] for s in step_scores), default=0.0)
        overall_score = max(wf_score, best_step_score)

        if overall_score > 0.15:
            all_results.append({
                "type": "workflow",
                "id": wf.id,
                "name": wf.name or wf.generated_title or "Untitled Workflow",
                "summary": wf.summary,
                "score": round(overall_score, 4),
                "matching_steps": sorted(step_scores, key=lambda s: s["score"], reverse=True)[:5],
            })

    # Search documents
    doc_results = await _search_documents_keyword(q, project_id, current_user.id, limit, db)
    all_results.extend(doc_results)

    # Sort all by score descending
    all_results.sort(key=lambda r: r["score"], reverse=True)

    return {
        "query": q,
        "results": all_results[:limit],
        "total_results": len(all_results),
        "search_type": "keyword",
    }


@router.get("/unified-semantic")
async def unified_semantic_search(
    q: str = Query(..., min_length=1, description="Search query"),
    project_id: str = Query(..., description="Project ID"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Unified semantic search. Uses embeddings for workflows, falls back to
    keyword matching for documents that don't have embeddings.
    """
    from app.services.embeddings import (
        generate_embedding,
        has_embedding_api,
        keyword_similarity,
        workflow_text,
        step_text,
    )

    workflow_results: list[dict] = []
    query_vector = None

    # Try semantic search for workflows
    if has_embedding_api():
        query_vector = await generate_embedding(q)
        if query_vector is not None:
            sem = await _vector_search(q, query_vector, current_user.id, project_id, limit, db)
            # Convert to unified format
            for r in sem.get("results", []):
                workflow_results.append({
                    "type": "workflow",
                    "id": r["recording_id"],
                    "name": r.get("name") or r.get("generated_title") or "Untitled",
                    "summary": r.get("summary"),
                    "score": r.get("score", 0),
                    "matching_steps": r.get("matching_steps", []),
                })

    # Fallback: keyword search for workflows if semantic returned nothing
    if not workflow_results:
        kw = await _keyword_search(q, current_user.id, project_id, limit, db)
        for r in kw.get("results", []):
            workflow_results.append({
                "type": "workflow",
                "id": r["recording_id"],
                "name": r.get("name") or r.get("generated_title") or "Untitled",
                "summary": r.get("summary"),
                "score": r.get("score", 0),
                "matching_steps": r.get("matching_steps", []),
            })

    # Documents: search via embeddings if available, otherwise keyword
    doc_results: list[dict] = []
    if has_embedding_api() and query_vector is not None:
        # Search document embeddings
        from sqlalchemy import text as sa_text
        vector_str = "[" + ",".join(str(v) for v in query_vector) + "]"
        doc_sql = sa_text("""
            SELECT e.source_type, e.source_id, e.metadata,
                   e.embedding <=> :query_vector AS distance
            FROM embeddings e
            WHERE e.source_type IN ('document', 'document_chunk')
              AND e.metadata->>'project_id' = :project_id
            ORDER BY e.embedding <=> :query_vector
            LIMIT :limit
        """)
        doc_sem_result = await db.execute(doc_sql, {
            "query_vector": vector_str,
            "project_id": project_id,
            "limit": limit,
        })
        doc_sem_rows = doc_sem_result.fetchall()
        seen_doc_ids: set[str] = set()
        for source_type, source_id, metadata, distance in doc_sem_rows:
            meta = metadata or {}
            doc_id = meta.get("doc_id", source_id)
            if doc_id in seen_doc_ids:
                continue
            seen_doc_ids.add(doc_id)
            score = round(max(0.0, 1.0 - distance), 4)
            doc_results.append({
                "type": "document",
                "id": doc_id,
                "name": meta.get("title", "Untitled"),
                "preview": "",
                "score": score,
            })
    else:
        doc_results = await _search_documents_keyword(q, project_id, current_user.id, limit, db)

    all_results = workflow_results + doc_results
    all_results.sort(key=lambda r: r["score"], reverse=True)

    return {
        "query": q,
        "results": all_results[:limit],
        "total_results": len(all_results),
        "search_type": "semantic" if has_embedding_api() else "keyword",
    }
