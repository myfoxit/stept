"""
AI Tool: create_folder — Create a folder in the user's project.
Accepts parent by ID or name. Creates parent if it doesn't exist.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Folder, project_members

name = "create_folder"
description = (
    "Create a new folder in the user's project. "
    "Optionally nest it inside an existing folder (by name or ID). "
    "If the parent folder doesn't exist, it will be created automatically."
)
parameters = {
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "description": "Name of the new folder",
        },
        "parent_folder_id": {
            "type": "string",
            "description": "Parent folder ID to nest this folder in (optional)",
        },
        "parent_folder_name": {
            "type": "string",
            "description": "Parent folder name to nest this folder in — will be found or created (optional)",
        },
    },
    "required": ["name"],
}


async def _find_or_create_parent(
    db: AsyncSession,
    project_id: str,
    user_id: str,
    parent_folder_id: Optional[str],
    parent_folder_name: Optional[str],
) -> tuple[Optional[str], str]:
    """Find parent folder by ID or name, creating if needed. Returns (folder_id, parent_path)."""
    if parent_folder_id:
        stmt = select(Folder).where(
            Folder.id == parent_folder_id,
            Folder.project_id == project_id,
        )
        parent = await db.scalar(stmt)
        if parent:
            return parent.id, parent.path or ""
        return None, ""

    if parent_folder_name:
        pattern = f"%{parent_folder_name}%"
        stmt = select(Folder).where(
            Folder.project_id == project_id,
            Folder.name.ilike(pattern),
        ).limit(1)
        parent = await db.scalar(stmt)
        if parent:
            return parent.id, parent.path or ""

        # Create the parent folder
        new_parent = Folder(
            name=parent_folder_name,
            project_id=project_id,
            parent_id=None,
            owner_id=user_id,
        )
        db.add(new_parent)
        await db.flush()
        new_parent.set_path("")
        await db.flush()
        return new_parent.id, new_parent.path or ""

    return None, ""


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    folder_name = kwargs.get("name", "Untitled")
    parent_folder_id = kwargs.get("parent_folder_id")
    parent_folder_name = kwargs.get("parent_folder_name")

    if not project_id:
        return {"error": "No project context — cannot create folder."}

    # Verify user has access to the project
    stmt = select(project_members.c.user_id).where(
        project_members.c.user_id == user_id,
        project_members.c.project_id == project_id,
    )
    member = await db.scalar(stmt)
    if not member:
        return {"error": "You don't have access to this project."}

    # Resolve parent folder
    resolved_parent_id, parent_path = await _find_or_create_parent(
        db, project_id, user_id, parent_folder_id, parent_folder_name,
    )

    folder = Folder(
        name=folder_name,
        project_id=project_id,
        parent_id=resolved_parent_id,
        owner_id=user_id,
    )
    db.add(folder)
    await db.flush()

    # Set materialized path after we have the ID
    folder.set_path(parent_path)
    await db.flush()

    msg = f"Created folder '{folder_name}'"
    if parent_folder_name and resolved_parent_id:
        msg += f" inside '{parent_folder_name}'"

    return {
        "success": True,
        "folder_id": folder.id,
        "name": folder_name,
        "parent_folder_id": resolved_parent_id,
        "message": msg,
    }
