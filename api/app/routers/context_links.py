"""
Context Links router — CRUD + match endpoint for the Chrome extension.
"""
from __future__ import annotations

import fnmatch
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import ContextLink, User, ProcessRecordingSession, Document
from app.security import get_current_user

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────

class ContextLinkCreate(BaseModel):
    project_id: str
    match_type: str  # url_pattern, url_exact, app_name, window_title
    match_value: str
    resource_type: str  # workflow, document
    resource_id: str
    note: Optional[str] = None
    priority: int = 0


class ContextLinkUpdate(BaseModel):
    match_type: Optional[str] = None
    match_value: Optional[str] = None
    note: Optional[str] = None
    priority: Optional[int] = None


class ContextLinkOut(BaseModel):
    id: str
    project_id: str
    match_type: str
    match_value: str
    resource_type: str
    resource_id: str
    note: Optional[str] = None
    priority: int = 0

    class Config:
        from_attributes = True


class ContextMatchOut(BaseModel):
    id: str
    match_type: str
    match_value: str
    resource_type: str
    resource_id: str
    resource_name: str
    resource_summary: Optional[str] = None
    note: Optional[str] = None
    priority: int = 0


# ── Endpoints ────────────────────────────────────────────────────────────

@router.post("/context-links", response_model=ContextLinkOut)
async def create_context_link(
    body: ContextLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    link = ContextLink(
        project_id=body.project_id,
        created_by=current_user.id,
        match_type=body.match_type,
        match_value=body.match_value,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        note=body.note,
        priority=body.priority,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


@router.get("/context-links", response_model=list[ContextLinkOut])
async def list_context_links(
    project_id: str = Query(...),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(ContextLink).where(ContextLink.project_id == project_id)
    if resource_type:
        q = q.where(ContextLink.resource_type == resource_type)
    if resource_id:
        q = q.where(ContextLink.resource_id == resource_id)
    q = q.order_by(ContextLink.priority.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/context-links/match")
async def match_context_links(
    url: Optional[str] = Query(None),
    app_name: Optional[str] = Query(None),
    window_title: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Match context links against a URL, app name, and/or window title."""
    from app.models import project_members

    # If no project_id, get all user's projects
    if project_id:
        q = select(ContextLink).where(ContextLink.project_id == project_id)
    else:
        user_projects = select(project_members.c.project_id).where(
            project_members.c.user_id == current_user.id
        )
        q = select(ContextLink).where(ContextLink.project_id.in_(user_projects))

    result = await db.execute(q)
    links: list[ContextLink] = list(result.scalars().all())

    matched: list[ContextLink] = []
    for link in links:
        if link.match_type == "url_exact" and url and url == link.match_value:
            matched.append(link)
        elif link.match_type == "url_pattern" and url and fnmatch.fnmatch(url, link.match_value):
            matched.append(link)
        elif link.match_type == "app_name" and app_name and app_name == link.match_value:
            matched.append(link)
        elif link.match_type == "window_title" and window_title and link.match_value.lower() in window_title.lower():
            matched.append(link)

    # Sort by priority desc
    matched.sort(key=lambda l: l.priority, reverse=True)

    # Resolve resource names
    out: list[dict] = []
    for link in matched:
        resource_name = ""
        resource_summary = None
        if link.resource_type == "workflow":
            r = await db.execute(
                select(ProcessRecordingSession).where(ProcessRecordingSession.id == link.resource_id)
            )
            wf = r.scalar_one_or_none()
            if wf:
                resource_name = wf.name or "Untitled Workflow"
                resource_summary = getattr(wf, "summary", None)
        elif link.resource_type == "document":
            r = await db.execute(
                select(Document).where(Document.id == link.resource_id)
            )
            doc = r.scalar_one_or_none()
            if doc:
                resource_name = doc.name or "Untitled Document"

        out.append(
            ContextMatchOut(
                id=link.id,
                match_type=link.match_type,
                match_value=link.match_value,
                resource_type=link.resource_type,
                resource_id=link.resource_id,
                resource_name=resource_name,
                resource_summary=resource_summary,
                note=link.note,
                priority=link.priority,
            ).model_dump()
        )

    return {"matches": out}


@router.put("/context-links/{link_id}", response_model=ContextLinkOut)
async def update_context_link(
    link_id: str,
    body: ContextLinkUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ContextLink).where(ContextLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Context link not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(link, field, value)
    await db.commit()
    await db.refresh(link)
    return link


@router.delete("/context-links/{link_id}")
async def delete_context_link(
    link_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ContextLink).where(ContextLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Context link not found")
    await db.delete(link)
    await db.commit()
    return {"ok": True}
