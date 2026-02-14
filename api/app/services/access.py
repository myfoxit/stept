"""Resource-level access checking."""
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models import (
    User, ProcessRecordingSession, Document, ResourceShare,
    project_members, ProjectRole,
)


async def can_access_resource(
    resource_type: str,  # "workflow" or "document"
    resource_id: str,
    user: Optional[User],
    db: AsyncSession,
) -> Tuple[bool, str]:
    """
    Check if user can access a resource.
    Returns (True, "owner"|"edit"|"view") or (False, "").
    """
    # 1. Load resource
    if resource_type == "workflow":
        resource = await db.get(ProcessRecordingSession, resource_id)
    elif resource_type == "document":
        resource = await db.get(Document, resource_id)
    else:
        return (False, "")

    if not resource:
        return (False, "")

    # 2. Public resources → anyone can view
    if resource.is_public:
        # If user is also a project member, they get owner-level
        if user and resource.project_id:
            is_member = await _is_project_member(db, user.id, resource.project_id)
            if is_member:
                return (True, "owner")
        return (True, "view")

    # From here on, resource is private — need a user
    if not user:
        return (False, "")

    # 3. Project member check
    if resource.project_id:
        is_member = await _is_project_member(db, user.id, resource.project_id)
        if is_member:
            return (True, "owner")

    # 4. ResourceShare check
    stmt = select(ResourceShare).where(
        and_(
            ResourceShare.resource_type == resource_type,
            ResourceShare.resource_id == resource_id,
            ResourceShare.shared_with_email == user.email,
        )
    )
    result = await db.execute(stmt)
    share = result.scalar_one_or_none()
    if share:
        return (True, share.permission)

    return (False, "")


async def _is_project_member(db: AsyncSession, user_id: str, project_id: str) -> bool:
    stmt = select(project_members.c.user_id).where(
        and_(
            project_members.c.user_id == user_id,
            project_members.c.project_id == project_id,
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None
