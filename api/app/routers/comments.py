"""
Comments router — CRUD + resolve for document/workflow comments.
"""
from __future__ import annotations

from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import Comment, User, ProjectRole
from app.security import get_current_user, check_project_permission

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    resource_type: str  # 'document' or 'workflow'
    resource_id: str
    content: str
    parent_id: Optional[str] = None


class CommentUpdate(BaseModel):
    content: str


class CommentOut(BaseModel):
    id: str
    project_id: str
    user_id: str
    resource_type: str
    resource_id: str
    parent_id: Optional[str] = None
    content: str
    resolved: bool
    created_at: str
    updated_at: str
    user_display_name: str
    user_email: str

    class Config:
        from_attributes = True


# ── Helpers ──────────────────────────────────────────────────────────────

def _comment_to_out(comment: Comment, user: User) -> dict:
    return {
        "id": comment.id,
        "project_id": comment.project_id,
        "user_id": comment.user_id,
        "resource_type": comment.resource_type,
        "resource_id": comment.resource_id,
        "parent_id": comment.parent_id,
        "content": comment.content,
        "resolved": comment.resolved,
        "created_at": comment.created_at.isoformat() if comment.created_at else "",
        "updated_at": comment.updated_at.isoformat() if comment.updated_at else "",
        "user_display_name": user.name or user.email,
        "user_email": user.email,
    }


# ── Routes ───────────────────────────────────────────────────────────────

@router.get("/comments", response_model=List[CommentOut])
async def list_comments(
    resource_type: str = Query(...),
    resource_id: str = Query(...),
    project_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List comments for a resource (viewer+)."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.VIEWER)

    stmt = (
        select(Comment, User)
        .join(User, Comment.user_id == User.id)
        .where(
            and_(
                Comment.resource_type == resource_type,
                Comment.resource_id == resource_id,
                Comment.project_id == project_id,
            )
        )
        .order_by(Comment.created_at.asc())
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [_comment_to_out(comment, user) for comment, user in rows]


@router.post("/comments", response_model=CommentOut, status_code=201)
async def create_comment(
    body: CommentCreate,
    project_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a comment (editor+)."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.EDITOR)

    # If replying, validate parent exists and is top-level
    if body.parent_id:
        parent = await db.get(Comment, body.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")
        if parent.parent_id is not None:
            raise HTTPException(status_code=400, detail="Cannot reply to a reply (max 1 level deep)")

    comment = Comment(
        project_id=project_id,
        user_id=current_user.id,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        parent_id=body.parent_id,
        content=body.content,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    return _comment_to_out(comment, current_user)


@router.put("/comments/{comment_id}", response_model=CommentOut)
async def update_comment(
    comment_id: str,
    body: CommentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit own comment."""
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Can only edit own comments")

    comment.content = body.content
    await db.commit()
    await db.refresh(comment)

    user = await db.get(User, comment.user_id)
    return _comment_to_out(comment, user)


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete own comment (or admin+)."""
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    is_own = comment.user_id == current_user.id
    is_admin = False
    if not is_own:
        try:
            role = await check_project_permission(db, current_user.id, comment.project_id, ProjectRole.ADMIN)
            is_admin = True
        except HTTPException:
            pass

    if not is_own and not is_admin:
        raise HTTPException(status_code=403, detail="Cannot delete this comment")

    await db.delete(comment)
    await db.commit()


@router.patch("/comments/{comment_id}/resolve", response_model=CommentOut)
async def toggle_resolve(
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle resolved status (editor+)."""
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    await check_project_permission(db, current_user.id, comment.project_id, ProjectRole.EDITOR)

    comment.resolved = not comment.resolved
    await db.commit()
    await db.refresh(comment)

    user = await db.get(User, comment.user_id)
    return _comment_to_out(comment, user)
