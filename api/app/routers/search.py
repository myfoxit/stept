"""
Smart Search router.

Searches across recording titles, summaries, tags, step titles and descriptions.
Returns ranked results with highlighted matches.
Includes semantic search via pgvector embeddings.
Includes unified-v2 with RRF fusion, ranking boosts, context-aware scoring, and trigram fallback.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Optional

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy import or_, and_, func, select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session as get_db
from app.models import ProcessRecordingSession, ProcessRecordingStep, User, Embedding, Document
from app.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


def _extract_snippet(
    session: ProcessRecordingSession,
    matching_steps: list[dict],
    query: str,
    max_len: int = 160,
) -> str:
    """Extract a short text snippet showing where the query matches, with <mark> highlight."""
    import re
    q_lower = query.lower()
    words = re.findall(r'\w+', query.strip())
    pattern = re.compile('|'.join(re.escape(w) for w in words), re.IGNORECASE) if words else None

    # Check fields in priority order: name, generated_title, summary, guide_markdown
    candidates = [
        session.name,
        session.generated_title,
        session.summary,
        (session.guide_markdown or "")[:2000],
    ]

    for text in candidates:
        if not text:
            continue
        # Find the position of the match
        match = pattern.search(text) if pattern else None
        if match:
            start = max(0, match.start() - 40)
            end = min(len(text), match.start() + max_len - 40)
            snippet = text[start:end].strip()
            if start > 0:
                snippet = "…" + snippet
            if end < len(text):
                snippet = snippet + "…"
            # Highlight all matches
            if pattern:
                snippet = pattern.sub(lambda m: f"<mark>{m.group()}</mark>", snippet)
            return snippet

    # Fallback: summary or first part of guide
    fallback = session.summary or (session.guide_markdown or "")[:max_len]
    if fallback:
        snippet = fallback[:max_len]
        if len(fallback) > max_len:
            snippet += "…"
        if pattern:
            snippet = pattern.sub(lambda m: f"<mark>{m.group()}</mark>", snippet)
        return snippet

    return ""


def _extract_text_snippet(text: str, query: str, max_len: int = 160) -> str:
    """Extract a snippet from raw text around the first match, with <mark> highlights."""
    import re
    if not text or not query:
        return (text or "")[:max_len]
    words = re.findall(r'\w+', query.strip())
    if not words:
        return text[:max_len]
    pattern = re.compile('|'.join(re.escape(w) for w in words), re.IGNORECASE)
    match = pattern.search(text)
    if match:
        start = max(0, match.start() - 40)
        end = min(len(text), match.start() + max_len - 40)
        snippet = text[start:end].strip()
        if start > 0:
            snippet = "…" + snippet
        if end < len(text):
            snippet = snippet + "…"
    else:
        snippet = text[:max_len]
        if len(text) > max_len:
            snippet += "…"
    snippet = pattern.sub(lambda m: f"<mark>{m.group()}</mark>", snippet)
    return snippet


def _highlight(text: str, query: str) -> str:
    """Simple case-insensitive highlight using <mark> tags."""
    if not text or not query:
        return text or ""
    import re
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    return pattern.sub(lambda m: f"<mark>{m.group()}</mark>", text)


# ---------------------------------------------------------------------------
# FTS helpers
# ---------------------------------------------------------------------------

def _build_prefix_tsquery(query: str) -> str:
    """Build a prefix-aware tsquery string for as-you-type search.
    Appends :* to the last word for prefix matching.
    'backlo' -> 'backlo:*', 'click save' -> 'click & save:*'
    """
    import re as _re
    words = _re.findall(r'\w+', query.strip())
    if not words:
        return query
    parts = [f"'{w}'" for w in words[:-1]]
    parts.append(f"'{words[-1]}':*")
    return " & ".join(parts)

async def _fts_search_sessions(
    query: str,
    project_id: str,
    user_id: str,
    limit: int,
    db: AsyncSession,
) -> list[tuple]:
    """Full-text search on process_recording_sessions. Returns list of (session, rank)."""
    tsq = _build_prefix_tsquery(query)
    sql = sa_text("""
        SELECT id, ts_rank_cd(search_tsv, to_tsquery('english', :tsq)) AS rank
        FROM process_recording_sessions
        WHERE project_id = :project_id
          AND search_tsv @@ to_tsquery('english', :tsq)
          AND (is_private = false OR owner_id = :user_id)
        ORDER BY rank DESC
        LIMIT :limit
    """)
    result = await db.execute(sql, {"tsq": tsq, "project_id": project_id, "user_id": user_id, "limit": limit})
    return result.fetchall()


async def _fts_search_steps(
    query: str,
    project_id: str,
    user_id: str,
    limit: int,
    db: AsyncSession,
) -> list[tuple]:
    """Full-text search on process_recording_steps. Returns list of (step_id, session_id, step_number, generated_title, description, window_title, rank)."""
    tsq = _build_prefix_tsquery(query)
    sql = sa_text("""
        SELECT s.id, s.session_id, s.step_number, s.generated_title, s.description, s.window_title,
               ts_rank_cd(s.search_tsv, to_tsquery('english', :tsq)) AS rank
        FROM process_recording_steps s
        JOIN process_recording_sessions sess ON s.session_id = sess.id
        WHERE sess.project_id = :project_id
          AND s.search_tsv @@ to_tsquery('english', :tsq)
          AND (sess.is_private = false OR sess.owner_id = :user_id)
        ORDER BY rank DESC
        LIMIT :limit
    """)
    result = await db.execute(sql, {"tsq": tsq, "project_id": project_id, "user_id": user_id, "limit": limit})
    return result.fetchall()


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
    Uses PostgreSQL full-text search with ILIKE fallback for very short queries.
    """
    use_fts = len(q.strip()) > 2

    if use_fts:
        result = await _smart_search_fts(q, project_id, current_user, limit, db)
        # Fallback to ILIKE if FTS returned nothing (e.g. search_tsv not populated)
        if result.get("total_results", 0) == 0:
            return await _smart_search_ilike(q, project_id, current_user, limit, db)
        return result
    else:
        return await _smart_search_ilike(q, project_id, current_user, limit, db)


async def _smart_search_fts(
    q: str, project_id: str, current_user: User, limit: int, db: AsyncSession
) -> dict:
    """FTS-based smart search."""
    # Search recordings via FTS
    session_rows = await _fts_search_sessions(q, project_id, current_user.id, limit, db)
    # Search steps via FTS
    step_rows = await _fts_search_steps(q, project_id, current_user.id, limit, db)

    recording_results = []
    seen_recording_ids = set()

    # Fetch full session objects for matched recordings
    for row in session_rows:
        session_id = row[0]
        rec = await db.get(ProcessRecordingSession, session_id)
        if not rec:
            continue
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
    for step_row in step_rows:
        step_id, session_id, step_number, gen_title, description, window_title, rank = step_row
        if session_id not in step_by_recording:
            step_by_recording[session_id] = []
        step_by_recording[session_id].append({
            "step_id": step_id,
            "step_number": step_number,
            "description": description,
            "description_highlighted": _highlight(description or "", q),
            "generated_title": gen_title,
            "generated_title_highlighted": _highlight(gen_title or "", q),
            "window_title": window_title,
        })

        if session_id not in seen_recording_ids:
            seen_recording_ids.add(session_id)
            rec = await db.get(ProcessRecordingSession, session_id)
            if rec:
                recording_results.append({
                    "type": "recording",
                    "recording_id": rec.id,
                    "name": rec.name,
                    "name_highlighted": rec.name or "",
                    "generated_title": rec.generated_title,
                    "generated_title_highlighted": rec.generated_title or "",
                    "summary": rec.summary,
                    "summary_highlighted": rec.summary or "",
                    "tags": rec.tags,
                    "is_processed": rec.is_processed,
                    "matching_steps": [],
                })

    for item in recording_results:
        rec_id = item["recording_id"]
        if rec_id in step_by_recording:
            item["matching_steps"] = step_by_recording[rec_id]

    return {
        "query": q,
        "total_results": len(recording_results),
        "results": recording_results[:limit],
    }


async def _smart_search_ilike(
    q: str, project_id: str, current_user: User, limit: int, db: AsyncSession
) -> dict:
    """ILIKE fallback for very short queries (1-2 chars)."""
    search_term = f"%{q}%"

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

    params: dict = {
        "query_vector": vector_str,
        "user_id": user_id,
        "limit": limit * 2,
    }
    if project_id:
        params["project_id"] = project_id

    result = await db.execute(sql, params)
    rows = result.fetchall()

    seen_workflows: dict[str, dict] = {}
    workflow_scores: dict[str, float] = {}

    for source_type, source_id, metadata, distance in rows:
        score = max(0.0, 1.0 - distance)
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

    sorted_wf_ids = sorted(workflow_scores.keys(), key=lambda k: workflow_scores[k], reverse=True)[:limit]

    results = []
    for wf_id in sorted_wf_ids:
        session = await db.get(ProcessRecordingSession, wf_id)
        if not session:
            continue
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
        if wf.is_private and wf.owner_id != user_id:
            continue

        wf_text = workflow_text(wf)
        wf_score = keyword_similarity(query, wf_text)

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
    from app.services.indexer import reindex_project, reindex_all_for_user
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
        tsq = _build_prefix_tsquery(query)
        ts_stmt = sa_text("""
            SELECT id, name, search_text, ts_rank(search_tsv, to_tsquery('english', :tsq)) as rank
            FROM documents
            WHERE project_id = :project_id
              AND search_tsv @@ to_tsquery('english', :tsq)
              AND (is_private = false OR owner_id = :user_id)
            ORDER BY rank DESC
            LIMIT :limit
        """)
        ts_result = await db.execute(ts_stmt, {"tsq": tsq, "project_id": project_id, "user_id": user_id, "limit": limit})
        ts_rows = ts_result.fetchall()
        if ts_rows:
            results = []
            for row in ts_rows:
                snippet = _extract_text_snippet(row.search_text or "", query)
                results.append({
                    "type": "document", "id": row.id, "name": row.name,
                    "preview": snippet, "snippet": snippet,
                    "score": round(float(row.rank), 4),
                })
            return results
    except Exception:
        pass

    query_lower = query.lower()

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

        name_match = query_lower in name.lower()
        content_match = query_lower in text_content.lower()

        if not name_match and not content_match:
            score = keyword_similarity(query, full_text)
            if score < 0.15:
                continue
        else:
            score = keyword_similarity(query, full_text)
            if name_match:
                score = max(score, 0.5)

        snippet = _extract_text_snippet(text_content, query) if text_content else ""
        scored.append({
            "type": "document",
            "id": doc.id,
            "name": name,
            "preview": snippet,
            "snippet": snippet,
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
    Uses FTS for queries > 2 chars, falls back to keyword_similarity.
    """
    use_fts = len(q.strip()) > 2
    all_results: list[dict] = []

    if use_fts:
        # FTS path for workflows
        all_results.extend(await _fts_workflow_results(q, project_id, current_user.id, limit, db))
        # Fallback to ILIKE if FTS returned nothing (e.g. search_tsv not yet populated)
        if not all_results:
            all_results.extend(await _keyword_workflow_results(q, project_id, current_user, limit, db))
    else:
        # Short query fallback
        all_results.extend(await _keyword_workflow_results(q, project_id, current_user, limit, db))

    # Search documents
    doc_results = await _search_documents_keyword(q, project_id, current_user.id, limit, db)
    all_results.extend(doc_results)

    all_results.sort(key=lambda r: r["score"], reverse=True)

    return {
        "query": q,
        "results": all_results[:limit],
        "total_results": len(all_results),
        "search_type": "keyword",
    }


async def _fts_workflow_results(
    query: str, project_id: str, user_id: str, limit: int, db: AsyncSession
) -> list[dict]:
    """FTS-based workflow results for unified search."""
    session_rows = await _fts_search_sessions(query, project_id, user_id, limit, db)
    step_rows = await _fts_search_steps(query, project_id, user_id, limit, db)

    # Collect all session IDs with their FTS ranks
    session_scores: dict[str, float] = {}
    for row in session_rows:
        session_scores[row[0]] = float(row[1])

    step_by_session: dict[str, list] = {}
    for step_row in step_rows:
        step_id, session_id, step_number, gen_title, description, window_title, rank = step_row
        if session_id not in step_by_session:
            step_by_session[session_id] = []
        step_by_session[session_id].append({
            "step_id": step_id,
            "step_number": step_number,
            "generated_title": gen_title,
            "score": round(float(rank), 4),
        })
        # Use step rank if higher
        session_scores[session_id] = max(session_scores.get(session_id, 0), float(rank))

    results = []
    for session_id, score in sorted(session_scores.items(), key=lambda x: x[1], reverse=True)[:limit]:
        rec = await db.get(ProcessRecordingSession, session_id)
        if not rec:
            continue
        results.append({
            "type": "workflow",
            "id": rec.id,
            "name": rec.name or rec.generated_title or "Untitled Workflow",
            "summary": rec.summary,
            "score": round(score, 4),
            "matching_steps": sorted(
                step_by_session.get(session_id, []),
                key=lambda s: s["score"], reverse=True
            )[:5],
        })

    return results


async def _keyword_workflow_results(
    query: str, project_id: str, current_user: User, limit: int, db: AsyncSession
) -> list[dict]:
    """Keyword-based workflow results for unified search (short query fallback)."""
    from app.services.embeddings import keyword_similarity, workflow_text, step_text

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

    results: list[dict] = []
    for wf in workflows:
        if wf.is_private and wf.owner_id != current_user.id:
            continue
        wf_text_str = workflow_text(wf)
        wf_score = keyword_similarity(query, wf_text_str)

        step_scores = []
        for step in sorted(wf.steps, key=lambda s: s.step_number):
            s_text = step_text(step)
            if s_text.strip():
                s_score = keyword_similarity(query, s_text)
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
            results.append({
                "type": "workflow",
                "id": wf.id,
                "name": wf.name or wf.generated_title or "Untitled Workflow",
                "summary": wf.summary,
                "score": round(overall_score, 4),
                "matching_steps": sorted(step_scores, key=lambda s: s["score"], reverse=True)[:5],
            })

    return results


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
    )

    workflow_results: list[dict] = []
    query_vector = None

    if has_embedding_api():
        query_vector = await generate_embedding(q)
        if query_vector is not None:
            sem = await _vector_search(q, query_vector, current_user.id, project_id, limit, db)
            for r in sem.get("results", []):
                workflow_results.append({
                    "type": "workflow",
                    "id": r["recording_id"],
                    "name": r.get("name") or r.get("generated_title") or "Untitled",
                    "summary": r.get("summary"),
                    "score": r.get("score", 0),
                    "matching_steps": r.get("matching_steps", []),
                })

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

    doc_results: list[dict] = []
    if has_embedding_api() and query_vector is not None:
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


# ---------------------------------------------------------------------------
# Phase 2: Unified V2 — RRF fusion of FTS + Semantic
# Phase 3: Ranking signals (recency, frequency boosts)
# Phase 4: Context-aware boost
# Phase 5: Trigram fuzzy fallback
# ---------------------------------------------------------------------------

RRF_K = 60  # Reciprocal Rank Fusion constant


def _recency_boost(updated_at: datetime | None) -> float:
    """Recency boost: 0.5 + 0.5 * exp(-days_old / 30)."""
    if not updated_at:
        return 0.5
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    days_old = max(0, (now - updated_at).total_seconds() / 86400)
    return 0.5 + 0.5 * math.exp(-days_old / 30)


def _frequency_boost(view_count: int | None) -> float:
    """Frequency boost: 1 + 0.2 * log(view_count + 1)."""
    vc = view_count or 0
    return 1 + 0.2 * math.log(vc + 1)


def _rrf_merge(
    keyword_ranked: list[dict],
    semantic_ranked: list[dict],
    k: int = RRF_K,
) -> list[dict]:
    """
    Merge two ranked lists using Reciprocal Rank Fusion.
    Each item must have 'id' and 'type' keys.
    Returns merged list with 'rrf_score' added.
    """
    scores: dict[str, float] = {}
    items: dict[str, dict] = {}

    for rank, item in enumerate(keyword_ranked, start=1):
        key = f"{item['type']}:{item['id']}"
        scores[key] = scores.get(key, 0) + 1.0 / (k + rank)
        items[key] = item

    for rank, item in enumerate(semantic_ranked, start=1):
        key = f"{item['type']}:{item['id']}"
        scores[key] = scores.get(key, 0) + 1.0 / (k + rank)
        if key not in items:
            items[key] = item

    merged = []
    for key in sorted(scores, key=scores.get, reverse=True):
        item = items[key].copy()
        item["rrf_score"] = round(scores[key], 6)
        merged.append(item)

    return merged


async def _ilike_unified_results(
    query: str, project_id: str, user_id: str, limit: int, db: AsyncSession
) -> list[dict]:
    """ILIKE-based search for very short queries (1-2 chars) in unified-v2."""
    results: list[dict] = []
    pattern = f"%{query}%"

    # Workflows by name/title
    stmt = select(ProcessRecordingSession).where(
        and_(
            ProcessRecordingSession.project_id == project_id,
            or_(
                ProcessRecordingSession.is_private == False,
                ProcessRecordingSession.owner_id == user_id,
            ),
            or_(
                ProcessRecordingSession.name.ilike(pattern),
                ProcessRecordingSession.generated_title.ilike(pattern),
                ProcessRecordingSession.summary.ilike(pattern),
            ),
        )
    ).limit(limit)
    rows = await db.execute(stmt)
    for rec in rows.scalars().all():
        snippet = _extract_snippet(rec, [], query)
        results.append({
            "type": "workflow",
            "id": rec.id,
            "name": rec.name or rec.generated_title or "Untitled Workflow",
            "summary": rec.summary,
            "snippet": snippet,
            "score": 0.5,
            "_session": rec,
        })

    # Documents by name/content
    doc_stmt = select(Document).where(
        and_(
            Document.project_id == project_id,
            or_(
                Document.is_private == False,
                Document.owner_id == user_id,
            ),
            or_(
                Document.name.ilike(pattern),
                Document.search_text.ilike(pattern),
            ),
        )
    ).limit(limit)
    doc_rows = await db.execute(doc_stmt)
    for doc in doc_rows.scalars().all():
        text_content = doc.search_text or ""
        snippet = _extract_text_snippet(text_content, query) if text_content else ""
        results.append({
            "type": "document",
            "id": doc.id,
            "name": doc.name or "Untitled",
            "preview": snippet,
            "snippet": snippet,
            "score": 0.4,
        })

    return results[:limit]


async def _fts_unified_results(
    query: str, project_id: str, user_id: str, limit: int, db: AsyncSession
) -> list[dict]:
    """FTS results for unified-v2 (workflows + documents)."""
    results: list[dict] = []

    # Workflow FTS
    session_rows = await _fts_search_sessions(query, project_id, user_id, limit, db)
    step_rows = await _fts_search_steps(query, project_id, user_id, limit, db)

    session_scores: dict[str, float] = {}
    session_objects: dict[str, ProcessRecordingSession] = {}
    step_by_session: dict[str, list] = {}

    for row in session_rows:
        session_id, rank = row[0], float(row[1])
        session_scores[session_id] = rank

    for step_row in step_rows:
        step_id, session_id, step_number, gen_title, description, window_title, rank = step_row
        if session_id not in step_by_session:
            step_by_session[session_id] = []
        step_by_session[session_id].append({
            "step_id": step_id,
            "step_number": step_number,
            "generated_title": gen_title,
            "score": round(float(rank), 4),
        })
        session_scores[session_id] = max(session_scores.get(session_id, 0), float(rank))

    for session_id in session_scores:
        rec = await db.get(ProcessRecordingSession, session_id)
        if not rec:
            continue
        session_objects[session_id] = rec
        snippet = _extract_snippet(rec, step_by_session.get(session_id, []), query)
        results.append({
            "type": "workflow",
            "id": rec.id,
            "name": rec.name or rec.generated_title or "Untitled Workflow",
            "summary": rec.summary,
            "snippet": snippet,
            "score": round(session_scores[session_id], 4),
            "matching_steps": sorted(
                step_by_session.get(session_id, []),
                key=lambda s: s["score"], reverse=True
            )[:5],
            "_session": rec,  # internal, stripped before response
        })

    results.sort(key=lambda r: r["score"], reverse=True)

    # Document FTS
    doc_results = await _search_documents_keyword(query, project_id, user_id, limit, db)
    results.extend(doc_results)

    return results


async def _semantic_unified_results(
    query: str, project_id: str, user_id: str, limit: int, db: AsyncSession
) -> list[dict]:
    """Semantic search results for unified-v2."""
    from app.services.embeddings import generate_embedding, has_embedding_api

    if not has_embedding_api():
        return []

    query_vector = await generate_embedding(query)
    if query_vector is None:
        return []

    vector_str = "[" + ",".join(str(v) for v in query_vector) + "]"

    # Search all embeddings (workflows, steps, documents)
    sql = sa_text("""
        SELECT e.source_type, e.source_id, e.metadata,
               e.embedding <=> :query_vector AS distance
        FROM embeddings e
        WHERE e.metadata->>'project_id' = :project_id
        ORDER BY e.embedding <=> :query_vector
        LIMIT :limit
    """)
    result = await db.execute(sql, {
        "query_vector": vector_str,
        "project_id": project_id,
        "limit": limit * 3,
    })
    rows = result.fetchall()

    # Group by workflow / document
    workflow_scores: dict[str, float] = {}
    workflow_steps: dict[str, list] = {}
    doc_scores: dict[str, float] = {}
    doc_names: dict[str, str] = {}

    for source_type, source_id, metadata, distance in rows:
        score = max(0.0, 1.0 - distance)
        meta = metadata or {}

        if source_type == "workflow":
            workflow_scores[source_id] = max(workflow_scores.get(source_id, 0), score)
        elif source_type == "step":
            wf_id = meta.get("session_id", "")
            if wf_id:
                workflow_scores[wf_id] = max(workflow_scores.get(wf_id, 0), score)
                if wf_id not in workflow_steps:
                    workflow_steps[wf_id] = []
                workflow_steps[wf_id].append({
                    "step_id": source_id,
                    "step_number": meta.get("step_number"),
                    "score": round(score, 4),
                })
        elif source_type in ("document", "document_chunk"):
            doc_id = meta.get("doc_id", source_id)
            doc_scores[doc_id] = max(doc_scores.get(doc_id, 0), score)
            doc_names[doc_id] = meta.get("title", "Untitled")

    results: list[dict] = []

    for wf_id in sorted(workflow_scores, key=workflow_scores.get, reverse=True)[:limit]:
        rec = await db.get(ProcessRecordingSession, wf_id)
        if not rec:
            continue
        if rec.user_id != user_id:
            continue
        if rec.is_private and rec.owner_id != user_id:
            continue

        results.append({
            "type": "workflow",
            "id": rec.id,
            "name": rec.name or rec.generated_title or "Untitled Workflow",
            "summary": rec.summary,
            "score": round(workflow_scores[wf_id], 4),
            "matching_steps": sorted(
                workflow_steps.get(wf_id, []),
                key=lambda s: s["score"], reverse=True
            )[:5],
            "_session": rec,
        })

    for doc_id in sorted(doc_scores, key=doc_scores.get, reverse=True)[:limit]:
        results.append({
            "type": "document",
            "id": doc_id,
            "name": doc_names.get(doc_id, "Untitled"),
            "preview": "",
            "score": round(doc_scores[doc_id], 4),
        })

    return results


async def _trigram_fallback(
    query: str, project_id: str, user_id: str, limit: int, db: AsyncSession
) -> list[dict]:
    """Trigram similarity fallback when FTS returns too few results."""
    results: list[dict] = []
    try:
        # Search workflow names
        sql = sa_text("""
            SELECT id, name, generated_title, summary,
                   similarity(coalesce(name, ''), :q) AS sim
            FROM process_recording_sessions
            WHERE project_id = :project_id
              AND (is_private = false OR owner_id = :user_id)
              AND similarity(coalesce(name, ''), :q) > 0.3
            ORDER BY sim DESC
            LIMIT :limit
        """)
        rows = (await db.execute(sql, {"q": query, "project_id": project_id, "user_id": user_id, "limit": limit})).fetchall()
        for row in rows:
            results.append({
                "type": "workflow",
                "id": row[0],
                "name": row[1] or row[2] or "Untitled Workflow",
                "summary": row[3],
                "score": round(float(row[4]), 4),
                "matching_steps": [],
            })

        # Search step titles
        step_sql = sa_text("""
            SELECT s.id, s.session_id, s.step_number, s.generated_title,
                   similarity(coalesce(s.generated_title, ''), :q) AS sim
            FROM process_recording_steps s
            JOIN process_recording_sessions sess ON s.session_id = sess.id
            WHERE sess.project_id = :project_id
              AND (sess.is_private = false OR sess.owner_id = :user_id)
              AND similarity(coalesce(s.generated_title, ''), :q) > 0.3
            ORDER BY sim DESC
            LIMIT :limit
        """)
        step_rows = (await db.execute(step_sql, {"q": query, "project_id": project_id, "user_id": user_id, "limit": limit})).fetchall()

        seen_wf_ids = {r["id"] for r in results}
        for row in step_rows:
            wf_id = row[1]
            if wf_id not in seen_wf_ids:
                seen_wf_ids.add(wf_id)
                rec = await db.get(ProcessRecordingSession, wf_id)
                if rec:
                    results.append({
                        "type": "workflow",
                        "id": rec.id,
                        "name": rec.name or rec.generated_title or "Untitled Workflow",
                        "summary": rec.summary,
                        "score": round(float(row[4]), 4),
                        "matching_steps": [{
                            "step_id": row[0],
                            "step_number": row[2],
                            "generated_title": row[3],
                            "score": round(float(row[4]), 4),
                        }],
                    })

    except Exception as exc:
        logger.debug("Trigram fallback failed (pg_trgm may not be enabled): %s", exc)

    return results


@router.get("/unified-v2")
async def unified_v2_search(
    q: str = Query(..., min_length=1, description="Search query"),
    project_id: str = Query(..., description="Project ID to search within"),
    limit: int = Query(20, ge=1, le=100),
    context_app: Optional[str] = Query(None, description="Current app name for context boost"),
    context_url: Optional[str] = Query(None, description="Current URL for context boost"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Unified V2 search with:
    - RRF fusion of FTS + semantic results
    - Recency and frequency boosts
    - Context-aware boosting
    - Trigram fuzzy fallback
    """
    # For very short queries (1-2 chars), use ILIKE which handles single chars better
    if len(q.strip()) <= 2:
        fts_results = await _ilike_unified_results(q, project_id, current_user.id, limit, db)
    else:
        fts_results = await _fts_unified_results(q, project_id, current_user.id, limit * 2, db)

    # Always try semantic (graceful fallback if no embedding API)
    semantic_results = await _semantic_unified_results(q, project_id, current_user.id, limit * 2, db)

    # RRF merge
    if semantic_results:
        merged = _rrf_merge(fts_results, semantic_results)
    else:
        # FTS only — assign synthetic RRF scores based on rank
        merged = []
        for rank, item in enumerate(fts_results, start=1):
            item_copy = item.copy()
            item_copy["rrf_score"] = round(1.0 / (RRF_K + rank), 6)
            merged.append(item_copy)

    # Phase 5: Trigram fallback if too few FTS results
    if len(fts_results) < 3 and len(q.strip()) > 2:
        trigram_results = await _trigram_fallback(q, project_id, current_user.id, limit, db)
        # Merge trigram results into existing with low RRF contribution
        existing_ids = {f"{r['type']}:{r['id']}" for r in merged}
        for tri_item in trigram_results:
            key = f"{tri_item['type']}:{tri_item['id']}"
            if key not in existing_ids:
                tri_item["rrf_score"] = round(tri_item.get("score", 0) * 0.01, 6)
                merged.append(tri_item)

    # Phase 3: Apply ranking boosts
    for item in merged:
        boost = 1.0
        session_obj = item.pop("_session", None)

        if item["type"] == "workflow" and session_obj:
            boost *= _recency_boost(session_obj.updated_at)
            boost *= _frequency_boost(getattr(session_obj, "view_count", None))

        # Phase 4: Context-aware boost
        if (context_app or context_url) and item["type"] == "workflow" and session_obj:
            context_match = await _check_context_match(
                session_obj.id, context_app, context_url, db
            )
            if context_match:
                boost *= 1.5

        item["score"] = round(item["rrf_score"] * boost, 6)

    # Sort by boosted score
    merged.sort(key=lambda r: r["score"], reverse=True)

    # Clean up internal fields
    for item in merged:
        item.pop("rrf_score", None)
        item.pop("_session", None)

    return {
        "query": q,
        "results": merged[:limit],
        "total_results": len(merged),
        "search_type": "hybrid" if semantic_results else "keyword",
    }


async def _check_context_match(
    session_id: str,
    context_app: Optional[str],
    context_url: Optional[str],
    db: AsyncSession,
) -> bool:
    """Check if any steps in this workflow match the given context."""
    if not context_app and not context_url:
        return False

    conditions = [ProcessRecordingStep.session_id == session_id]
    match_parts = []

    if context_app:
        match_parts.append(
            func.lower(ProcessRecordingStep.window_title).contains(context_app.lower())
        )

    if context_url:
        match_parts.append(
            or_(
                func.lower(ProcessRecordingStep.content).contains(context_url.lower()),
                func.lower(ProcessRecordingStep.window_title).contains(context_url.lower()),
            )
        )

    if match_parts:
        conditions.append(or_(*match_parts))

    stmt = select(func.count()).select_from(ProcessRecordingStep).where(and_(*conditions))
    result = await db.execute(stmt)
    count = result.scalar()
    return (count or 0) > 0


# ---------------------------------------------------------------------------
# View count endpoint (Phase 3)
# ---------------------------------------------------------------------------

@router.patch("/workflows/{session_id}/view")
async def record_workflow_view(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Increment view_count and update last_viewed_at for a workflow."""
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Security check
    if session.is_private and session.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    view_count = getattr(session, "view_count", None)
    if view_count is not None:
        session.view_count = (session.view_count or 0) + 1
        session.last_viewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    else:
        # Column doesn't exist yet (migration not run)
        pass

    return {"view_count": getattr(session, "view_count", 0)}
