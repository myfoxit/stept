from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.relation import RelationAssign, RelationCreate, RelationRead
from app.crud.relation import add_relation, assign_relation, delete_relation, unassign_relation
from app.database import get_session as get_db
from app.models import RelationMeta, TableMeta

router = APIRouter()

@router.post("/", response_model=RelationRead)
async def api_add_relation(
    payload: RelationCreate,
    db: AsyncSession = Depends(get_db),
):
    left = await db.get(TableMeta, payload.left_table_id)
    right = await db.get(TableMeta, payload.right_table_id)
    if not left or not right:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or both tables not found")
    try:
        print(payload)
        rel = await add_relation(
            db,
            left,
            right,
            payload.relation_type,
            payload.display_name,
        )
        return rel
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

@router.delete("/{relation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def api_delete_relation(
    relation_id: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        await delete_relation(db, relation_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    
@router.post(
    "/{relation_id}/assign",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Link two items via a relation",
)
async def api_assign_relation(
    relation_id: str,
    payload: RelationAssign,
    db: AsyncSession = Depends(get_db),
):
    rel = await db.get(RelationMeta, relation_id)
    if not rel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Relation not found")
    try:
        await assign_relation(db, rel, payload.left_item_id, payload.right_item_id, payload.left_table_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


@router.post(
    "/{relation_id}/unassign",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Link two items via a relation",
)
async def api_unassign_relation(
    relation_id: str,
    payload: RelationAssign,
    db: AsyncSession = Depends(get_db),
):
    rel = await db.get(RelationMeta, relation_id)
    if not rel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Relation not found")
    try:
        await unassign_relation(db, rel, payload.left_item_id, payload.right_item_id, payload.left_table_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))