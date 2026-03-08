"""
Enterprise Search API.

Public API for searching workflows and documents via API key authentication.
Returns actual step content — not just metadata.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_session as get_db
from app.mcp_auth import validate_api_key
from app.middleware.rate_limit import RateLimiter
from app.models import (
    Document,
    McpApiKey,
    ProcessRecordingSession,
    ProcessRecordingStep,
    Project,
    User,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Rate limiters
# ---------------------------------------------------------------------------

_search_limiter = RateLimiter(limit=60, window=60)
_read_limiter = RateLimiter(limit=30, window=60)

# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------


async def get_api_key(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> McpApiKey:
    """Validate X-API-Key header and return the McpApiKey row."""
    key = request.headers.get("X-API-Key") or request.headers.get("x-api-key")
    if not key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    api_key = await validate_api_key(key, db)
    if not api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return api_key


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    type: Optional[str] = Field(None, pattern=r"^(workflow|document)$")
    sort_by: str = Field("relevance", pattern=r"^(relevance|created_at|-created_at|updated_at|-updated_at)$")
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    updated_after: Optional[datetime] = None
    updated_before: Optional[datetime] = None
    include_steps: bool = True
    limit: int = Field(15, ge=1, le=50)


class AuthorOut(BaseModel):
    id: str
    name: Optional[str] = None
    email: str


class StepOut(BaseModel):
    step_number: int
    description: Optional[str] = None
    action_type: Optional[str] = None
    text_typed: Optional[str] = None
    key_pressed: Optional[str] = None


class SearchResultOut(BaseModel):
    id: str
    name: Optional[str] = None
    description: Optional[str] = None
    type: str  # "workflow" | "document"
    url: Optional[str] = None
    embed_url: Optional[str] = None
    author: Optional[AuthorOut] = None
    tags: Optional[list[str]] = None
    estimated_time: Optional[str] = None
    total_steps: Optional[int] = None
    steps: Optional[list[StepOut]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SearchResponse(BaseModel):
    results: list[SearchResultOut]
    total: int
    query: str


class ProjectOut(BaseModel):
    id: str
    name: Optional[str] = None
    created_at: Optional[str] = None


class ProjectsResponse(BaseModel):
    projects: list[ProjectOut]


class StatsResponse(BaseModel):
    total_workflows: int
    total_documents: int
    total_steps: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FRONTEND_URL = settings.FRONTEND_URL.rstrip("/")


def _build_prefix_tsquery(query: str) -> str:
    """Build a prefix-aware tsquery string."""
    words = re.findall(r"\w+", query.strip())
    if not words:
        return query
    parts = [f"'{w}'" for w in words[:-1]]
    parts.append(f"'{words[-1]}':*")
    return " & ".join(parts)


def _dt_str(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.isoformat() + ("Z" if not str(dt).endswith("+") else "")


def _extract_plain_text(content) -> str:
    """Extract plain text from TipTap JSON content."""
    if not content:
        return ""
    if isinstance(content, str):
        return content[:500]

    texts: list[str] = []

    def _walk(node):
        if isinstance(node, dict):
            if node.get("type") == "text" and "text" in node:
                texts.append(node["text"])
            for child in node.get("content", []):
                _walk(child)
        elif isinstance(node, list):
            for item in node:
                _walk(item)

    _walk(content)
    return " ".join(texts)[:500]


def _workflow_url(share_token: str | None) -> str | None:
    if not share_token:
        return None
    return f"{FRONTEND_URL}/public/workflow/{share_token}"


def _workflow_embed_url(share_token: str | None) -> str | None:
    if not share_token:
        return None
    return f"{FRONTEND_URL}/public/workflow/{share_token}/embed"


def _document_url(share_token: str | None) -> str | None:
    if not share_token:
        return None
    return f"{FRONTEND_URL}/public/document/{share_token}"


# ---------------------------------------------------------------------------
# POST /enterprise/search
# ---------------------------------------------------------------------------


@router.post("/search", response_model=SearchResponse)
async def enterprise_search(
    body: SearchRequest,
    api_key: McpApiKey = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
    _rl=Depends(_search_limiter),
):
    """Search workflows and documents within the API key's project."""
    project_id = api_key.project_id
    query = body.query.strip()
    results: list[SearchResultOut] = []

    search_workflows = body.type is None or body.type == "workflow"
    search_documents = body.type is None or body.type == "document"

    # --- Workflow search ---
    if search_workflows:
        wf_results = await _search_workflows(
            query=query,
            project_id=project_id,
            sort_by=body.sort_by,
            created_after=body.created_after,
            created_before=body.created_before,
            updated_after=body.updated_after,
            updated_before=body.updated_before,
            include_steps=body.include_steps,
            limit=body.limit,
            db=db,
        )
        results.extend(wf_results)

    # --- Document search ---
    if search_documents:
        doc_results = await _search_documents(
            query=query,
            project_id=project_id,
            sort_by=body.sort_by,
            created_after=body.created_after,
            created_before=body.created_before,
            updated_after=body.updated_after,
            updated_before=body.updated_before,
            limit=body.limit,
            db=db,
        )
        results.extend(doc_results)

    # Sort combined results
    if body.sort_by == "relevance":
        # Already ranked by FTS — interleave by keeping order
        pass
    elif body.sort_by == "created_at":
        results.sort(key=lambda r: r.created_at or "", reverse=False)
    elif body.sort_by == "-created_at":
        results.sort(key=lambda r: r.created_at or "", reverse=True)
    elif body.sort_by == "updated_at":
        results.sort(key=lambda r: r.updated_at or "", reverse=False)
    elif body.sort_by == "-updated_at":
        results.sort(key=lambda r: r.updated_at or "", reverse=True)

    results = results[: body.limit]

    return SearchResponse(results=results, total=len(results), query=query)


async def _search_workflows(
    *,
    query: str,
    project_id: str,
    sort_by: str,
    created_after: datetime | None,
    created_before: datetime | None,
    updated_after: datetime | None,
    updated_before: datetime | None,
    include_steps: bool,
    limit: int,
    db: AsyncSession,
) -> list[SearchResultOut]:
    """FTS search on workflows with date filters."""
    tsq = _build_prefix_tsquery(query)

    # Build date filter clauses
    date_filters = ""
    params: dict = {"tsq": tsq, "project_id": project_id, "limit": limit}

    if created_after:
        date_filters += " AND created_at >= :created_after"
        params["created_after"] = created_after
    if created_before:
        date_filters += " AND created_at <= :created_before"
        params["created_before"] = created_before
    if updated_after:
        date_filters += " AND updated_at >= :updated_after"
        params["updated_after"] = updated_after
    if updated_before:
        date_filters += " AND updated_at <= :updated_before"
        params["updated_before"] = updated_before

    # Determine ORDER BY
    if sort_by == "relevance":
        order = "rank DESC"
    elif sort_by == "created_at":
        order = "created_at ASC"
    elif sort_by == "-created_at":
        order = "created_at DESC"
    elif sort_by == "updated_at":
        order = "updated_at ASC"
    elif sort_by == "-updated_at":
        order = "updated_at DESC"
    else:
        order = "rank DESC"

    # Try FTS first
    sql = sa_text(f"""
        SELECT id, ts_rank_cd(search_tsv, to_tsquery('english', :tsq)) AS rank
        FROM process_recording_sessions
        WHERE project_id = :project_id
          AND deleted_at IS NULL
          AND status = 'completed'
          AND search_tsv @@ to_tsquery('english', :tsq)
          {date_filters}
        ORDER BY {order}
        LIMIT :limit
    """)

    try:
        result = await db.execute(sql, params)
        rows = result.fetchall()
    except Exception:
        rows = []

    # Fallback to ILIKE if FTS returned nothing
    if not rows:
        like_param = f"%{query}%"
        fallback_sql = sa_text(f"""
            SELECT id, 0.0 AS rank
            FROM process_recording_sessions
            WHERE project_id = :project_id
              AND deleted_at IS NULL
              AND status = 'completed'
              AND (name ILIKE :like_param OR summary ILIKE :like_param OR generated_title ILIKE :like_param)
              {date_filters}
            ORDER BY {order.replace('rank DESC', 'updated_at DESC')}
            LIMIT :limit
        """)
        params["like_param"] = like_param
        try:
            result = await db.execute(fallback_sql, params)
            rows = result.fetchall()
        except Exception:
            rows = []

    if not rows:
        return []

    session_ids = [r[0] for r in rows]

    # Fetch full session objects with user
    stmt = (
        select(ProcessRecordingSession)
        .options(selectinload(ProcessRecordingSession.user))
        .where(ProcessRecordingSession.id.in_(session_ids))
    )
    sess_result = await db.execute(stmt)
    sessions_by_id = {s.id: s for s in sess_result.scalars().all()}

    # Fetch steps if requested
    steps_by_session: dict[str, list[ProcessRecordingStep]] = {}
    if include_steps:
        steps_stmt = (
            select(ProcessRecordingStep)
            .where(ProcessRecordingStep.session_id.in_(session_ids))
            .order_by(ProcessRecordingStep.step_number)
        )
        steps_result = await db.execute(steps_stmt)
        for step in steps_result.scalars().all():
            steps_by_session.setdefault(step.session_id, []).append(step)

    # Build results preserving FTS rank order
    out: list[SearchResultOut] = []
    for row in rows:
        session_id = row[0]
        sess = sessions_by_id.get(session_id)
        if not sess:
            continue

        user = sess.user
        author = None
        if user:
            author = AuthorOut(id=user.id, name=user.name, email=user.email)

        steps_out = None
        if include_steps:
            raw_steps = steps_by_session.get(session_id, [])
            steps_out = [
                StepOut(
                    step_number=s.step_number,
                    description=s.generated_description or s.description,
                    action_type=s.action_type,
                    text_typed=s.text_typed,
                    key_pressed=s.key_pressed,
                )
                for s in raw_steps
            ]

        total_steps = len(steps_by_session.get(session_id, [])) if include_steps else sess.total_steps

        out.append(
            SearchResultOut(
                id=sess.id,
                name=sess.generated_title or sess.name,
                description=sess.summary,
                type="workflow",
                url=_workflow_url(sess.share_token),
                embed_url=_workflow_embed_url(sess.share_token),
                author=author,
                tags=sess.tags,
                estimated_time=sess.estimated_time,
                total_steps=total_steps,
                steps=steps_out,
                created_at=_dt_str(sess.created_at),
                updated_at=_dt_str(sess.updated_at),
            )
        )

    return out


async def _search_documents(
    *,
    query: str,
    project_id: str,
    sort_by: str,
    created_after: datetime | None,
    created_before: datetime | None,
    updated_after: datetime | None,
    updated_before: datetime | None,
    limit: int,
    db: AsyncSession,
) -> list[SearchResultOut]:
    """FTS search on documents with date filters."""
    tsq = _build_prefix_tsquery(query)

    date_filters = ""
    params: dict = {"tsq": tsq, "project_id": project_id, "limit": limit}

    if created_after:
        date_filters += " AND created_at >= :created_after"
        params["created_after"] = created_after
    if created_before:
        date_filters += " AND created_at <= :created_before"
        params["created_before"] = created_before
    if updated_after:
        date_filters += " AND updated_at >= :updated_after"
        params["updated_after"] = updated_after
    if updated_before:
        date_filters += " AND updated_at <= :updated_before"
        params["updated_before"] = updated_before

    if sort_by == "relevance":
        order = "rank DESC"
    elif sort_by == "created_at":
        order = "created_at ASC"
    elif sort_by == "-created_at":
        order = "created_at DESC"
    elif sort_by == "updated_at":
        order = "updated_at ASC"
    elif sort_by == "-updated_at":
        order = "updated_at DESC"
    else:
        order = "rank DESC"

    sql = sa_text(f"""
        SELECT id, ts_rank(search_tsv, to_tsquery('english', :tsq)) AS rank
        FROM documents
        WHERE project_id = :project_id
          AND deleted_at IS NULL
          AND search_tsv @@ to_tsquery('english', :tsq)
          {date_filters}
        ORDER BY {order}
        LIMIT :limit
    """)

    try:
        result = await db.execute(sql, params)
        rows = result.fetchall()
    except Exception:
        rows = []

    # ILIKE fallback
    if not rows:
        like_param = f"%{query}%"
        fallback_sql = sa_text(f"""
            SELECT id, 0.0 AS rank
            FROM documents
            WHERE project_id = :project_id
              AND deleted_at IS NULL
              AND (name ILIKE :like_param OR search_text ILIKE :like_param)
              {date_filters}
            ORDER BY {order.replace('rank DESC', 'updated_at DESC')}
            LIMIT :limit
        """)
        params["like_param"] = like_param
        try:
            result = await db.execute(fallback_sql, params)
            rows = result.fetchall()
        except Exception:
            rows = []

    if not rows:
        return []

    doc_ids = [r[0] for r in rows]

    stmt = (
        select(Document)
        .options(selectinload(Document.owner))
        .where(Document.id.in_(doc_ids))
    )
    doc_result = await db.execute(stmt)
    docs_by_id = {d.id: d for d in doc_result.scalars().all()}

    out: list[SearchResultOut] = []
    for row in rows:
        doc_id = row[0]
        doc = docs_by_id.get(doc_id)
        if not doc:
            continue

        author = None
        if doc.owner:
            author = AuthorOut(id=doc.owner.id, name=doc.owner.name, email=doc.owner.email)

        preview = doc.search_text[:500] if doc.search_text else _extract_plain_text(doc.content)

        out.append(
            SearchResultOut(
                id=doc.id,
                name=doc.name,
                description=preview,
                type="document",
                url=_document_url(doc.share_token),
                embed_url=None,
                author=author,
                tags=None,
                estimated_time=None,
                total_steps=None,
                steps=None,
                created_at=_dt_str(doc.created_at),
                updated_at=_dt_str(doc.updated_at),
            )
        )

    return out


# ---------------------------------------------------------------------------
# GET /enterprise/projects
# ---------------------------------------------------------------------------


@router.get("/projects", response_model=ProjectsResponse)
async def enterprise_projects(
    api_key: McpApiKey = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
    _rl=Depends(_read_limiter),
):
    """List projects accessible by this API key."""
    project = await db.get(Project, api_key.project_id)
    if not project:
        return ProjectsResponse(projects=[])

    return ProjectsResponse(
        projects=[
            ProjectOut(
                id=project.id,
                name=project.name,
                created_at=_dt_str(project.created_at),
            )
        ]
    )


# ---------------------------------------------------------------------------
# GET /enterprise/stats
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=StatsResponse)
async def enterprise_stats(
    api_key: McpApiKey = Depends(get_api_key),
    db: AsyncSession = Depends(get_db),
    _rl=Depends(_read_limiter),
):
    """Basic stats for the API key's project."""
    project_id = api_key.project_id

    wf_count = await db.execute(
        select(func.count(ProcessRecordingSession.id)).where(
            ProcessRecordingSession.project_id == project_id,
            ProcessRecordingSession.deleted_at.is_(None),
            ProcessRecordingSession.status == "completed",
        )
    )
    total_workflows = wf_count.scalar() or 0

    doc_count = await db.execute(
        select(func.count(Document.id)).where(
            Document.project_id == project_id,
            Document.deleted_at.is_(None),
        )
    )
    total_documents = doc_count.scalar() or 0

    step_count = await db.execute(
        select(func.count(ProcessRecordingStep.id))
        .join(
            ProcessRecordingSession,
            ProcessRecordingStep.session_id == ProcessRecordingSession.id,
        )
        .where(
            ProcessRecordingSession.project_id == project_id,
            ProcessRecordingSession.deleted_at.is_(None),
        )
    )
    total_steps = step_count.scalar() or 0

    return StatsResponse(
        total_workflows=total_workflows,
        total_documents=total_documents,
        total_steps=total_steps,
    )
