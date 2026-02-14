"""Shared-with-me endpoint — shows resources shared with the current user."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session as get_db
from app.models import (
    User, ResourceShare, Document, ProcessRecordingSession,
)
from app.security import get_current_user

router = APIRouter()


@router.get("/shared-with-me")
async def get_shared_with_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all resources shared with the current user."""
    stmt = (
        select(ResourceShare)
        .where(ResourceShare.shared_with_user_id == current_user.id)
        .order_by(ResourceShare.created_at.desc())
    )
    result = await db.execute(stmt)
    shares = result.scalars().all()

    items = []
    for share in shares:
        # Load the actual resource
        resource_data = None
        if share.resource_type == "document":
            doc = await db.get(Document, share.resource_id)
            if doc:
                resource_data = {
                    "id": doc.id,
                    "name": doc.name or "Untitled",
                    "created_at": doc.created_at.isoformat() if doc.created_at else None,
                    "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
                }
        elif share.resource_type == "workflow":
            wf = await db.get(ProcessRecordingSession, share.resource_id)
            if wf:
                resource_data = {
                    "id": wf.id,
                    "name": wf.name or wf.generated_title or "Untitled Workflow",
                    "created_at": wf.created_at.isoformat() if wf.created_at else None,
                    "updated_at": wf.updated_at.isoformat() if wf.updated_at else None,
                    "total_steps": wf.total_steps,
                }

        # Skip if resource was deleted
        if not resource_data:
            continue

        # Get sharer name
        sharer = await db.get(User, share.shared_by)
        sharer_name = sharer.name or sharer.email if sharer else "Unknown"

        items.append({
            "id": share.id,
            "resource_type": share.resource_type,
            "resource_id": share.resource_id,
            "permission": share.permission,
            "shared_by_name": sharer_name,
            "shared_at": share.created_at.isoformat() if share.created_at else None,
            "resource": resource_data,
        })

    return {"items": items}
