"""
AI Tool: update_page — Update an existing page's content (append, prepend, or replace).
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Document, project_members

requires_confirmation = True

name = "update_page"
description = (
    "Update an existing page/document. Can append content to the end, "
    "prepend to the beginning, or replace all content. "
    "Use search_pages first to find the document_id."
)
parameters = {
    "type": "object",
    "properties": {
        "document_id": {
            "type": "string",
            "description": "ID of the document to update (get from search_pages)",
        },
        "content": {
            "type": "string",
            "description": "Text content to add or replace with",
        },
        "mode": {
            "type": "string",
            "enum": ["append", "prepend", "replace"],
            "description": "How to apply: append (add to end), prepend (add to start), replace (overwrite all). Default: append",
        },
        "title": {
            "type": "string",
            "description": "New title for the page (optional, only if renaming)",
        },
    },
    "required": ["document_id", "content"],
}


def _text_to_tiptap_nodes(text: str) -> list[dict]:
    """Convert plain text/markdown to TipTap paragraph nodes."""
    paragraphs = text.split("\n") if text else []
    nodes = []
    for para in paragraphs:
        if para.strip():
            # Detect headings
            if para.startswith("### "):
                nodes.append({
                    "type": "heading",
                    "attrs": {"level": 3},
                    "content": [{"type": "text", "text": para[4:]}],
                })
            elif para.startswith("## "):
                nodes.append({
                    "type": "heading",
                    "attrs": {"level": 2},
                    "content": [{"type": "text", "text": para[3:]}],
                })
            elif para.startswith("# "):
                nodes.append({
                    "type": "heading",
                    "attrs": {"level": 1},
                    "content": [{"type": "text", "text": para[2:]}],
                })
            elif para.startswith("- "):
                nodes.append({
                    "type": "bulletList",
                    "content": [{
                        "type": "listItem",
                        "content": [{
                            "type": "paragraph",
                            "content": [{"type": "text", "text": para[2:]}],
                        }],
                    }],
                })
            elif para.startswith("```"):
                # Code block marker — skip, content handled separately
                pass
            else:
                nodes.append({
                    "type": "paragraph",
                    "content": [{"type": "text", "text": para}],
                })
        else:
            nodes.append({"type": "paragraph"})
    return nodes


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    try:
        from app.services.ai_tools.validation import sanitize_string, validate_id

        document_id = validate_id(kwargs.get("document_id"), "document_id")
        content_text = sanitize_string(kwargs.get("content", ""), "content") or ""
        mode = kwargs.get("mode", "append")
        new_title = sanitize_string(kwargs.get("title"), "title")
    except (ValueError, TypeError) as exc:
        return {"error": f"Invalid input: {exc}"}

    if not document_id:
        return {"error": "document_id is required. Use search_pages to find it first."}

    if not content_text:
        return {"error": "content is required."}

    if mode not in ("append", "prepend", "replace"):
        return {"error": f"Invalid mode '{mode}'. Use: append, prepend, replace."}

    try:
        # Load the document
        stmt = select(Document).where(Document.id == document_id)
        doc = await db.scalar(stmt)

        if not doc:
            return {"error": f"Document '{document_id}' not found."}

        # Check access
        if doc.is_private and doc.owner_id != user_id:
            return {"error": "You don't have access to this private document."}

        if doc.project_id:
            member = await db.scalar(
                select(project_members.c.user_id).where(
                    project_members.c.user_id == user_id,
                    project_members.c.project_id == doc.project_id,
                )
            )
            if not member:
                return {"error": "You don't have access to this project."}

        # Build new TipTap nodes from the content
        new_nodes = _text_to_tiptap_nodes(content_text)

        # Get existing content
        existing = doc.content or {"type": "doc", "content": []}
        existing_nodes = existing.get("content", [])

        if mode == "append":
            # Add a separator, then new content
            merged = existing_nodes + [{"type": "paragraph"}] + new_nodes
        elif mode == "prepend":
            merged = new_nodes + [{"type": "paragraph"}] + existing_nodes
        elif mode == "replace":
            merged = new_nodes
        else:
            merged = existing_nodes + new_nodes

        doc.content = {"type": "doc", "content": merged}

        if new_title:
            doc.name = new_title

        await db.flush()

        # Update search index
        try:
            from app.services.search_indexer import update_document_search
            await update_document_search(db, doc.id, doc.name, doc.content)
        except Exception:
            pass  # Non-critical

        action = {"append": "appended to", "prepend": "prepended to", "replace": "replaced content of"}[mode]
        msg = f"Successfully {action} page '{doc.name}'"

        return {
            "success": True,
            "document_id": doc.id,
            "title": doc.name,
            "mode": mode,
            "message": msg,
        }
    except Exception as exc:
        return {"error": f"Failed to update page: {exc}"}
