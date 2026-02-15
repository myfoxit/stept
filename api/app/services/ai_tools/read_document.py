"""
AI Tool: read_document — Retrieve the full content of a document/page.

Use when the user explicitly asks to see, read, or retrieve a full document.
"""
from __future__ import annotations
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Document

name = "read_document"
description = (
    "Retrieve the full content of a document/page by ID or name. "
    "Use when the user asks to 'show me', 'read', 'pull up', or 'get' a specific document. "
    "Returns the complete document content in markdown format."
)
parameters = {
    "type": "object",
    "properties": {
        "document_id": {
            "type": "string",
            "description": "The document ID (from a previous search result)",
        },
        "name_query": {
            "type": "string",
            "description": "Search by document name (partial match)",
        },
    },
}
requires_confirmation = False  # read-only


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str] = None,
    **kwargs: Any,
) -> dict[str, Any]:
    from app.document_export import tiptap_to_markdown
    from app.models import project_members
    from sqlalchemy import and_

    doc_id = kwargs.get("document_id")
    name_query = kwargs.get("name_query")

    if not doc_id and not name_query:
        return {"success": False, "error": "Provide document_id or name_query"}

    doc = None

    if doc_id:
        doc = await db.get(Document, doc_id)
    elif name_query:
        # Find by name (case-insensitive partial match)
        filters = [Document.name.ilike(f"%{name_query}%")]
        if project_id:
            filters.append(Document.project_id == project_id)
        else:
            proj_stmt = select(project_members.c.project_id).where(
                project_members.c.user_id == user_id
            )
            proj_ids = [r[0] for r in (await db.execute(proj_stmt)).all()]
            if proj_ids:
                filters.append(Document.project_id.in_(proj_ids))
            else:
                return {"success": False, "error": "No accessible projects found"}

        stmt = select(Document).where(and_(*filters)).limit(1)
        result = await db.execute(stmt)
        doc = result.scalar_one_or_none()

    if not doc:
        return {
            "success": False,
            "error": f"Document not found. Try search_pages to find it first.",
        }

    # Convert to markdown
    content_md = ""
    if doc.content:
        try:
            content_md = tiptap_to_markdown(doc.content)
        except Exception:
            content_md = str(doc.content)

    return {
        "success": True,
        "document_id": doc.id,
        "title": doc.name or "Untitled",
        "link": f"/editor/{doc.id}",
        "content": content_md,
        "message": f'Full document: [{doc.name or "Untitled"}](/editor/{doc.id})',
    }
