"""Knowledge links — relationship management between resources."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import KnowledgeLink, LinkType, User, ProjectRole
from app.security import get_current_user, check_project_permission
from app.services.link_detector import detect_related_content

router = APIRouter()


class CreateLinkRequest(BaseModel):
    project_id: str
    source_type: str
    source_id: str
    target_type: str
    target_id: str
    link_type: str = "related"


def _serialize_link(link: KnowledgeLink) -> dict:
    return {
        "id": link.id,
        "project_id": link.project_id,
        "source_type": link.source_type,
        "source_id": link.source_id,
        "target_type": link.target_type,
        "target_id": link.target_id,
        "link_type": link.link_type.value if link.link_type else None,
        "confidence": link.confidence,
        "auto_detected": link.auto_detected,
        "created_by": link.created_by,
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


@router.get("")
async def list_links(
    project_id: str = Query(...),
    resource_type: str = Query(None),
    resource_id: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List links for a project, optionally filtered by resource."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.VIEWER)
    stmt = select(KnowledgeLink).where(KnowledgeLink.project_id == project_id)

    if resource_type and resource_id:
        stmt = stmt.where(
            or_(
                and_(KnowledgeLink.source_type == resource_type, KnowledgeLink.source_id == resource_id),
                and_(KnowledgeLink.target_type == resource_type, KnowledgeLink.target_id == resource_id),
            )
        )

    stmt = stmt.order_by(KnowledgeLink.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [_serialize_link(r) for r in rows]


@router.post("")
async def create_link(
    body: CreateLinkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a manual knowledge link."""
    await check_project_permission(db, current_user.id, body.project_id, ProjectRole.EDITOR)

    try:
        lt = LinkType(body.link_type)
    except ValueError:
        raise HTTPException(400, f"Invalid link_type: {body.link_type}")

    link = KnowledgeLink(
        project_id=body.project_id,
        source_type=body.source_type,
        source_id=body.source_id,
        target_type=body.target_type,
        target_id=body.target_id,
        link_type=lt,
        auto_detected=False,
        created_by=current_user.id,
    )
    db.add(link)
    await db.flush()
    return _serialize_link(link)


@router.delete("/{link_id}")
async def delete_link(
    link_id: str,
    project_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a knowledge link."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.EDITOR)

    stmt = select(KnowledgeLink).where(
        and_(KnowledgeLink.id == link_id, KnowledgeLink.project_id == project_id)
    )
    link = (await db.execute(stmt)).scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Link not found")

    await db.delete(link)
    return {"ok": True}


@router.post("/detect")
async def detect_links(
    project_id: str = Query(...),
    resource_type: str = Query(...),
    resource_id: str = Query(...),
    threshold: float = Query(0.80, ge=0.5, le=1.0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detect related content without creating links."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.VIEWER)
    return await detect_related_content(
        project_id, resource_type, resource_id, db, threshold=threshold
    )


@router.get("/graph")
async def get_knowledge_graph(
    project_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the full knowledge graph for a project (nodes + edges)."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.VIEWER)

    stmt = select(KnowledgeLink).where(KnowledgeLink.project_id == project_id)
    links = (await db.execute(stmt)).scalars().all()

    # Build nodes and edges
    nodes = set()
    edges = []
    for link in links:
        nodes.add((link.source_type, link.source_id))
        nodes.add((link.target_type, link.target_id))
        edges.append({
            "id": link.id,
            "source": f"{link.source_type}:{link.source_id}",
            "target": f"{link.target_type}:{link.target_id}",
            "link_type": link.link_type.value if link.link_type else None,
            "confidence": link.confidence,
            "auto_detected": link.auto_detected,
        })

    return {
        "nodes": [{"id": f"{t}:{i}", "type": t, "resource_id": i} for t, i in nodes],
        "edges": edges,
    }
