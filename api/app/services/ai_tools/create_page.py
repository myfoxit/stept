"""
AI Tool: create_page — Create a TipTap document (page) in a project.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Document, Folder, project_members

name = "create_page"
description = (
    "Create a new page/document in the user's project. "
    "Optionally place it in a specific folder and provide initial content."
)
parameters = {
    "type": "object",
    "properties": {
        "title": {
            "type": "string",
            "description": "Title of the new page",
        },
        "content": {
            "type": "string",
            "description": "Optional initial text content for the page (plain text, will be wrapped in a TipTap paragraph)",
        },
        "folder_id": {
            "type": "string",
            "description": "Optional folder ID to place the page in",
        },
    },
    "required": ["title"],
}


def _text_to_tiptap(text: str) -> dict:
    """Convert plain text to minimal TipTap JSON document."""
    paragraphs = text.split("\n") if text else [""]
    content = []
    for para in paragraphs:
        if para.strip():
            content.append({
                "type": "paragraph",
                "content": [{"type": "text", "text": para}],
            })
        else:
            content.append({"type": "paragraph"})
    return {"type": "doc", "content": content}


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    title = kwargs.get("title", "Untitled")
    content_text = kwargs.get("content", "")
    folder_id = kwargs.get("folder_id")

    if not project_id:
        return {"error": "No project context — cannot create page."}

    # Verify user has access to the project
    stmt = select(project_members.c.user_id).where(
        project_members.c.user_id == user_id,
        project_members.c.project_id == project_id,
    )
    member = await db.scalar(stmt)
    if not member:
        return {"error": "You don't have access to this project."}

    # Validate folder if provided
    if folder_id:
        folder_stmt = select(Folder).where(
            Folder.id == folder_id,
            Folder.project_id == project_id,
        )
        folder = await db.scalar(folder_stmt)
        if not folder:
            return {"error": f"Folder '{folder_id}' not found in this project."}

    # Build TipTap content
    tiptap_content = _text_to_tiptap(content_text) if content_text else {"type": "doc", "content": [{"type": "paragraph"}]}

    doc = Document(
        name=title,
        content=tiptap_content,
        project_id=project_id,
        folder_id=folder_id,
        owner_id=user_id,
    )
    db.add(doc)
    await db.flush()

    return {
        "success": True,
        "document_id": doc.id,
        "title": title,
        "folder_id": folder_id,
        "message": f"Created page '{title}'",
    }
