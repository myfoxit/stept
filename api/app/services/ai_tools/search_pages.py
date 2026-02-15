"""
AI Tool: search_pages — Search documents/pages by name and content.
"""
from __future__ import annotations
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func
from app.models import Document

name = "search_pages"
description = (
    "Search for pages/documents by name or content. "
    "Use this when the user asks about a specific document or topic. "
    "Returns matching pages with their names and content preview."
)
parameters = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "Search query — page name or content keywords",
        },
    },
    "required": ["query"],
}


def _extract_tiptap_text(content) -> str:
    if not isinstance(content, dict):
        return str(content) if content else ""
    texts = []
    if "text" in content:
        texts.append(content["text"])
    for child in content.get("content", []):
        texts.append(_extract_tiptap_text(child))
    return " ".join(t for t in texts if t)


async def execute(db: AsyncSession, user_id: str, project_id: Optional[str], **kwargs: Any) -> dict:
    query = kwargs.get("query", "").strip()
    if not query:
        return {"error": "A search query is required."}

    conditions = []
    if project_id:
        conditions.append(Document.project_id == project_id)
    conditions.append(
        or_(
            Document.is_private == False,
            and_(Document.is_private == True, Document.owner_id == user_id),
        )
    )

    stmt = select(Document).where(and_(*conditions))
    result = await db.execute(stmt)
    docs = result.scalars().all()

    query_lower = query.lower()
    matches = []
    for doc in docs:
        doc_name = doc.name or ""
        doc_text = _extract_tiptap_text(doc.content)
        name_match = query_lower in doc_name.lower()
        content_match = query_lower in doc_text.lower()
        if name_match or content_match:
            matches.append({
                "document_id": doc.id,
                "name": doc_name,
                "preview": doc_text[:300] if doc_text else "",
                "name_match": name_match,
                "content_match": content_match,
            })

    if not matches:
        return {"success": True, "count": 0, "pages": [], "message": f"No pages found matching '{query}'."}

    return {
        "success": True,
        "count": len(matches),
        "pages": matches[:10],
        "message": f"Found {len(matches)} page(s) matching '{query}'",
    }
