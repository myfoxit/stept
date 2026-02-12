"""
AI Tool: create_page — Create a TipTap document (page) in a project.
Accepts folder by ID or name. Creates folder if it doesn't exist.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Document, Folder, project_members

name = "create_page"
description = (
    "Create a new page/document in the user's project. "
    "Optionally place it in a specific folder (by name or ID). "
    "If the folder doesn't exist, it will be created automatically."
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
            "description": "Optional initial text content for the page",
        },
        "folder_id": {
            "type": "string",
            "description": "Folder ID to place the page in (optional)",
        },
        "folder_name": {
            "type": "string",
            "description": "Folder name to place the page in — will be found or created (optional)",
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


async def _resolve_folder(
    db: AsyncSession,
    project_id: str,
    user_id: str,
    folder_id: Optional[str],
    folder_name: Optional[str],
) -> Optional[str]:
    """Find folder by ID or name. Creates it if name is given and not found."""
    if folder_id:
        stmt = select(Folder).where(
            Folder.id == folder_id,
            Folder.project_id == project_id,
        )
        folder = await db.scalar(stmt)
        return folder.id if folder else None

    if folder_name:
        pattern = f"%{folder_name}%"
        stmt = select(Folder).where(
            Folder.project_id == project_id,
            Folder.name.ilike(pattern),
        ).limit(1)
        folder = await db.scalar(stmt)
        if folder:
            return folder.id

        # Create the folder automatically
        new_folder = Folder(
            name=folder_name,
            project_id=project_id,
            parent_id=None,
            owner_id=user_id,
        )
        db.add(new_folder)
        await db.flush()
        new_folder.set_path("")
        await db.flush()
        return new_folder.id

    return None


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    try:
        from app.services.ai_tools.validation import sanitize_string, validate_id

        title = sanitize_string(kwargs.get("title", "Untitled"), "title") or "Untitled"
        content_text = sanitize_string(kwargs.get("content", ""), "content") or ""
        folder_id = validate_id(kwargs.get("folder_id"), "folder_id")
        folder_name = sanitize_string(kwargs.get("folder_name"), "folder_name")
    except (ValueError, TypeError) as exc:
        return {"error": f"Invalid input: {exc}"}

    if not project_id:
        return {"error": "No project context — cannot create page."}

    try:
        # Verify user has access to the project
        stmt = select(project_members.c.user_id).where(
            project_members.c.user_id == user_id,
            project_members.c.project_id == project_id,
        )
        member = await db.scalar(stmt)
        if not member:
            return {"error": "You don't have access to this project."}

        # Resolve folder
        resolved_folder_id = await _resolve_folder(
            db, project_id, user_id, folder_id, folder_name,
        )

        # Build TipTap content
        tiptap_content = _text_to_tiptap(content_text) if content_text else {
            "type": "doc",
            "content": [{"type": "paragraph"}],
        }

        doc = Document(
            name=title,
            content=tiptap_content,
            project_id=project_id,
            folder_id=resolved_folder_id,
            owner_id=user_id,
        )
        db.add(doc)
        await db.flush()

        msg = f"Created page '{title}'"
        if folder_name:
            msg += f" in folder '{folder_name}'"

        return {
            "success": True,
            "document_id": doc.id,
            "title": title,
            "folder_id": resolved_folder_id,
            "message": msg,
        }
    except Exception as exc:
        return {"error": f"Failed to create page: {exc}"}
