"""
Ondoki MCP Server — exposes pages, workflows, and context links to AI agents.
"""
from __future__ import annotations

import fnmatch
import logging
from typing import Any

from mcp.server.fastmcp import FastMCP

logger = logging.getLogger(__name__)

mcp = FastMCP("Ondoki", stateless_http=True)


# ---------------------------------------------------------------------------
# Helper: get DB session (works both inside FastAPI and standalone stdio)
# ---------------------------------------------------------------------------

async def _get_db():
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def _db():
    """Convenience: return a session from the async generator."""
    gen = _get_db()
    return await gen.__anext__(), gen


async def _close_db(session, gen):
    try:
        await gen.__anext__()
    except StopAsyncIteration:
        pass


# ---------------------------------------------------------------------------
# Auth helper: extract project_id from API key in the MCP request context
# ---------------------------------------------------------------------------

async def _auth_project_id(ctx) -> str | None:
    """
    Extract the API key from the MCP request headers and return the project_id.
    For stdio transport, uses ONDOKI_API_KEY env var.
    Returns None if auth fails.
    """
    import os
    from app.mcp_auth import validate_api_key

    raw_key = os.environ.get("ONDOKI_API_KEY")

    # Try to get from request headers if available
    if not raw_key:
        try:
            request = ctx.get("request")
            if request:
                auth = request.headers.get("authorization", "")
                if auth.startswith("Bearer "):
                    raw_key = auth[7:]
        except Exception:
            pass

    if not raw_key:
        return None

    session, gen = await _db()
    try:
        api_key = await validate_api_key(raw_key, session)
        if api_key:
            return api_key.project_id
        return None
    finally:
        await _close_db(session, gen)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
async def list_projects(ctx=None) -> list[dict[str, Any]]:
    """List projects accessible to the API key."""
    logger.info("🔧 list_projects() called")
    from sqlalchemy import select
    from app.models import Project

    project_id = await _auth_project_id(ctx or {})
    if not project_id:
        return [{"error": "Authentication required. Provide a valid API key."}]

    session, gen = await _db()
    try:
        result = await session.execute(select(Project).where(Project.id == project_id))
        projects = result.scalars().all()
        return [
            {"id": p.id, "name": p.name, "created_at": str(p.created_at)}
            for p in projects
        ]
    finally:
        await _close_db(session, gen)


@mcp.tool()
async def search_pages(query: str, project_id: str | None = None, limit: int = 20, ctx=None) -> list[dict[str, Any]]:
    """Search pages/documents by query using full-text search with ILIKE fallback."""
    logger.info("🔧 search_pages(query=%r, limit=%d) called", query, limit)
    from sqlalchemy import select, or_, and_
    from app.models import Document, Folder

    auth_project_id = await _auth_project_id(ctx or {})
    if not auth_project_id:
        return [{"error": "Authentication required. Provide a valid API key."}]
    # Scope to authenticated project
    project_id = auth_project_id

    session, gen = await _db()
    try:
        search_term = f"%{query}%"

        # Try tsvector search first
        try:
            from sqlalchemy import text as sa_text
            params: dict[str, Any] = {"q": query, "limit": limit}
            project_filter = ""
            if project_id:
                project_filter = "AND project_id = :project_id"
                params["project_id"] = project_id

            ts_stmt = sa_text(f"""
                SELECT id, name, folder_id, search_text,
                       ts_rank(search_tsv, plainto_tsquery('english', :q)) as rank,
                       updated_at
                FROM documents
                WHERE search_tsv @@ plainto_tsquery('english', :q)
                {project_filter}
                ORDER BY rank DESC
                LIMIT :limit
            """)
            ts_result = await session.execute(ts_stmt, params)
            ts_rows = ts_result.fetchall()
            if ts_rows:
                results = []
                for row in ts_rows:
                    # Get folder name
                    folder_name = None
                    if row.folder_id:
                        fr = await session.execute(select(Folder).where(Folder.id == row.folder_id))
                        folder = fr.scalar_one_or_none()
                        if folder:
                            folder_name = folder.name
                    results.append({
                        "id": row.id,
                        "name": row.name,
                        "folder": folder_name,
                        "snippet": (row.search_text or "")[:200],
                        "updated_at": str(row.updated_at) if row.updated_at else None,
                    })
                return results
        except Exception:
            pass

        # Fallback: ILIKE
        conditions = [
            or_(
                Document.name.ilike(search_term),
                Document.search_text.ilike(search_term),
            )
        ]
        if project_id:
            conditions.append(Document.project_id == project_id)

        stmt = select(Document).where(and_(*conditions)).limit(limit)
        result = await session.execute(stmt)
        docs = result.scalars().all()

        results = []
        for doc in docs:
            folder_name = None
            if doc.folder_id:
                fr = await session.execute(select(Folder).where(Folder.id == doc.folder_id))
                folder = fr.scalar_one_or_none()
                if folder:
                    folder_name = folder.name
            results.append({
                "id": doc.id,
                "name": doc.name,
                "folder": folder_name,
                "snippet": (doc.search_text or "")[:200],
                "updated_at": str(doc.updated_at) if doc.updated_at else None,
            })
        return results
    finally:
        await _close_db(session, gen)


@mcp.tool()
async def get_page(page_id: str, ctx=None) -> dict[str, Any]:
    """Get full page content as Markdown."""
    logger.info("🔧 get_page(page_id=%r) called", page_id)
    from sqlalchemy import select
    from app.models import Document, Folder
    from app.services.git_sync_service import tiptap_to_markdown

    auth_project_id = await _auth_project_id(ctx or {})
    if not auth_project_id:
        return {"error": "Authentication required. Provide a valid API key."}

    session, gen = await _db()
    try:
        result = await session.execute(select(Document).where(Document.id == page_id))
        doc = result.scalar_one_or_none()
        if not doc:
            return {"error": "Page not found"}
        if doc.project_id != auth_project_id:
            return {"error": "Access denied"}

        folder_name = None
        if doc.folder_id:
            fr = await session.execute(select(Folder).where(Folder.id == doc.folder_id))
            folder = fr.scalar_one_or_none()
            if folder:
                folder_name = folder.name

        content_md = tiptap_to_markdown(doc.content) if doc.content else ""

        return {
            "id": doc.id,
            "name": doc.name,
            "folder": folder_name,
            "content_markdown": content_md,
            "created_at": str(doc.created_at) if doc.created_at else None,
            "updated_at": str(doc.updated_at) if doc.updated_at else None,
        }
    finally:
        await _close_db(session, gen)


@mcp.tool()
async def search_workflows(query: str, project_id: str | None = None, limit: int = 20, ctx=None) -> list[dict[str, Any]]:
    """Search recorded workflows by query."""
    logger.info("🔧 search_workflows(query=%r, limit=%d) called", query, limit)
    from sqlalchemy import select, or_, and_
    from sqlalchemy.orm import selectinload
    from app.models import ProcessRecordingSession

    auth_project_id = await _auth_project_id(ctx or {})
    if not auth_project_id:
        return [{"error": "Authentication required. Provide a valid API key."}]
    # Scope to authenticated project
    project_id = auth_project_id

    session, gen = await _db()
    try:
        search_term = f"%{query}%"
        conditions = [
            ProcessRecordingSession.status == "completed",
            or_(
                ProcessRecordingSession.name.ilike(search_term),
                ProcessRecordingSession.generated_title.ilike(search_term),
                ProcessRecordingSession.summary.ilike(search_term),
            ),
        ]
        if project_id:
            conditions.append(ProcessRecordingSession.project_id == project_id)

        stmt = (
            select(ProcessRecordingSession)
            .where(and_(*conditions))
            .options(selectinload(ProcessRecordingSession.steps))
            .limit(limit)
        )
        result = await session.execute(stmt)
        workflows = result.scalars().all()

        return [
            {
                "id": wf.id,
                "name": wf.name or wf.generated_title or "Untitled",
                "summary": wf.summary,
                "tags": wf.tags,
                "steps_count": len(wf.steps),
                "updated_at": str(wf.updated_at) if wf.updated_at else None,
            }
            for wf in workflows
        ]
    finally:
        await _close_db(session, gen)


@mcp.tool()
async def get_workflow(workflow_id: str, ctx=None) -> dict[str, Any]:
    """Get workflow with all steps."""
    logger.info("🔧 get_workflow(workflow_id=%r) called", workflow_id)
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models import ProcessRecordingSession

    auth_project_id = await _auth_project_id(ctx or {})
    if not auth_project_id:
        return {"error": "Authentication required. Provide a valid API key."}

    session, gen = await _db()
    try:
        result = await session.execute(
            select(ProcessRecordingSession)
            .where(ProcessRecordingSession.id == workflow_id)
            .options(selectinload(ProcessRecordingSession.steps))
        )
        wf = result.scalar_one_or_none()
        if not wf:
            return {"error": "Workflow not found"}
        if wf.project_id != auth_project_id:
            return {"error": "Access denied"}

        steps = sorted(wf.steps, key=lambda s: s.step_number)
        return {
            "id": wf.id,
            "name": wf.name or wf.generated_title or "Untitled",
            "summary": wf.summary,
            "tags": wf.tags,
            "steps": [
                {
                    "step_number": s.step_number,
                    "action_type": s.action_type,
                    "description": s.description,
                    "generated_title": s.generated_title,
                    "ui_element": s.ui_element,
                }
                for s in steps
            ],
            "guide_markdown": wf.guide_markdown,
        }
    finally:
        await _close_db(session, gen)


@mcp.tool()
async def get_context(
    url: str | None = None,
    app_name: str | None = None,
    window_title: str | None = None,
    project_id: str | None = None,
    ctx=None,
) -> list[dict[str, Any]]:
    """Find relevant docs/workflows based on current context (URL, app name, window title)."""
    logger.info("🔧 get_context(url=%r, app=%r, window=%r) called", url, app_name, window_title)
    from sqlalchemy import select
    from app.models import ContextLink, ProcessRecordingSession, Document

    auth_project_id = await _auth_project_id(ctx or {})
    if not auth_project_id:
        return [{"error": "Authentication required. Provide a valid API key."}]
    # Scope to authenticated project
    project_id = auth_project_id

    session, gen = await _db()
    try:
        q = select(ContextLink)
        if project_id:
            q = q.where(ContextLink.project_id == project_id)

        result = await session.execute(q)
        links = list(result.scalars().all())

        matched = []
        for link in links:
            if link.match_type == "url_exact" and url and url == link.match_value:
                matched.append(link)
            elif link.match_type == "url_pattern" and url and fnmatch.fnmatch(url, link.match_value):
                matched.append(link)
            elif link.match_type == "app_name" and app_name and app_name == link.match_value:
                matched.append(link)
            elif link.match_type == "window_title" and window_title and link.match_value.lower() in window_title.lower():
                matched.append(link)

        matched.sort(key=lambda l: l.priority, reverse=True)

        out = []
        for link in matched:
            resource_name = ""
            resource_summary = None
            if link.resource_type == "workflow":
                r = await session.execute(
                    select(ProcessRecordingSession).where(ProcessRecordingSession.id == link.resource_id)
                )
                wf = r.scalar_one_or_none()
                if wf:
                    resource_name = wf.name or "Untitled Workflow"
                    resource_summary = wf.summary
            elif link.resource_type == "document":
                r = await session.execute(
                    select(Document).where(Document.id == link.resource_id)
                )
                doc = r.scalar_one_or_none()
                if doc:
                    resource_name = doc.name or "Untitled Document"

            out.append({
                "resource_type": link.resource_type,
                "resource_id": link.resource_id,
                "resource_name": resource_name,
                "summary": resource_summary,
                "match_type": link.match_type,
                "note": link.note,
            })
        return out
    finally:
        await _close_db(session, gen)


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------

@mcp.resource("ondoki://pages/{page_id}")
async def page_resource(page_id: str) -> str:
    """Page content as Markdown."""
    result = await get_page(page_id)
    if "error" in result:
        return f"Error: {result['error']}"
    return result.get("content_markdown", "")


@mcp.resource("ondoki://workflows/{workflow_id}")
async def workflow_resource(workflow_id: str) -> str:
    """Workflow guide as Markdown."""
    result = await get_workflow(workflow_id)
    if "error" in result:
        return f"Error: {result['error']}"
    return result.get("guide_markdown", "") or ""



