"""
AI Tool: add_context_link — Create a context link for a workflow or document.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import ContextLink

name = "add_context_link"
description = (
    "Create a context link that associates a URL pattern or application name with a "
    "workflow or document. When a user visits a matching URL or opens a matching app, "
    "the linked resource will be surfaced automatically. "
    "Use this when the user says things like 'remember this workflow for salesforce pages'."
)
parameters = {
    "type": "object",
    "properties": {
        "match_type": {
            "type": "string",
            "enum": ["url_pattern", "url_exact", "app_name", "window_title"],
            "description": "How to match: url_pattern (glob), url_exact, app_name, or window_title (substring)",
        },
        "match_value": {
            "type": "string",
            "description": "The pattern or value to match, e.g. '*.salesforce.com/*' or 'Microsoft Excel'",
        },
        "resource_type": {
            "type": "string",
            "enum": ["workflow", "document"],
            "description": "Type of resource to link",
        },
        "resource_id": {
            "type": "string",
            "description": "ID of the workflow or document to link",
        },
        "note": {
            "type": "string",
            "description": "Optional note to display with the context link",
        },
    },
    "required": ["match_type", "match_value", "resource_type", "resource_id"],
}

requires_confirmation = True


async def run(
    db: AsyncSession,
    user_id: str,
    project_id: str,
    match_type: str,
    match_value: str,
    resource_type: str,
    resource_id: str,
    note: Optional[str] = None,
    **kwargs: Any,
) -> dict:
    """Create a context link."""
    if match_type not in ("url_pattern", "url_exact", "app_name", "window_title"):
        return {"error": f"Invalid match_type: {match_type}"}
    if resource_type not in ("workflow", "document"):
        return {"error": f"Invalid resource_type: {resource_type}"}

    link = ContextLink(
        project_id=project_id,
        created_by=user_id,
        match_type=match_type,
        match_value=match_value,
        resource_type=resource_type,
        resource_id=resource_id,
        note=note,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    return {
        "message": f"Context link created: {match_type} '{match_value}' → {resource_type} {resource_id}",
        "id": link.id,
    }
