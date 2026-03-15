"""Relation endpoints — all require auth + project permissions.

FIX: SnapRow had NO auth on relation endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole, RelationMeta
from app.schemas.datatable import RelationCreate, RelationAssign
from app.crud.datatable.table import get_table
from app.crud.datatable.relation import (
    add_relation, delete_relation, assign_relation, unassign_relation,
)

router = APIRouter()


@router.post("/")
async def api_add_relation(
    body: RelationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    left = await get_table(db, body.left_table_id)
    right = await get_table(db, body.right_table_id)
    if not left or not right:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, left.project_id, ProjectRole.EDITOR)
    try:
        rel = await add_relation(db, left, right, body.relation_type, body.display_name)
        return {"id": rel.id, "relation_type": rel.relation_type}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{relation_id}")
async def api_delete_relation(
    relation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rel = await db.get(RelationMeta, relation_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Relation not found")
    left = await get_table(db, rel.left_table_id)
    if left:
        await check_project_permission(db, current_user.id, left.project_id, ProjectRole.EDITOR)
    try:
        await delete_relation(db, relation_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{relation_id}/assign")
async def api_assign_relation(
    relation_id: str,
    body: RelationAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rel = await db.get(RelationMeta, relation_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Relation not found")
    left = await get_table(db, rel.left_table_id)
    if left:
        await check_project_permission(db, current_user.id, left.project_id, ProjectRole.EDITOR)
    try:
        await assign_relation(db, rel, body.left_item_id, body.right_item_id, body.left_table_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{relation_id}/unassign")
async def api_unassign_relation(
    relation_id: str,
    body: RelationAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rel = await db.get(RelationMeta, relation_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Relation not found")
    left = await get_table(db, rel.left_table_id)
    if left:
        await check_project_permission(db, current_user.id, left.project_id, ProjectRole.EDITOR)
    try:
        await unassign_relation(db, rel, body.left_item_id, body.right_item_id, body.left_table_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
