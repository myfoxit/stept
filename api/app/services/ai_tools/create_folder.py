"""
AI Tool: create_folder — Create a folder in the user's project.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Folder, project_members

name = "create_folder"
description = (
    "Create a new folder in the user's project. "
    "Optionally nest it inside an existing folder."
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
            "description": "Optional parent folder ID to nest this folder in",
        },
    },
    "required": ["name"],
}


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    folder_name = kwargs.get("name", "Untitled")
    parent_folder_id = kwargs.get("parent_folder_id")

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
    parent_path = ""
    parent_depth = 0
    if parent_folder_id:
        parent_stmt = select(Folder).where(
            Folder.id == parent_folder_id,
            Folder.project_id == project_id,
        )
        parent = await db.scalar(parent_stmt)
        if not parent:
            return {"error": f"Parent folder '{parent_folder_id}' not found."}
        parent_path = parent.path or ""
        parent_depth = parent.depth or 0

    folder = Folder(
        name=folder_name,
        project_id=project_id,
        parent_id=parent_folder_id,
        owner_id=user_id,
    )
    db.add(folder)
    await db.flush()

    # Set materialized path after we have the ID
    folder.set_path(parent_path)
    await db.flush()

    return {
        "success": True,
        "folder_id": folder.id,
        "name": folder_name,
        "parent_folder_id": parent_folder_id,
        "message": f"Created folder '{folder_name}'",
    }
