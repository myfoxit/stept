"""
Test-only endpoints for E2E test seeding/cleanup.
Only registered when ENVIRONMENT=test.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, insert

from app.database import get_session as get_db, Base
from app.models import User, Project, ProjectRole, project_members
from app.crud.user import create_user

router = APIRouter(prefix="/test", tags=["test"])

TEST_EMAIL = "e2e-test@ondoki.com"
TEST_PASSWORD = "TestPass123!"
TEST_NAME = "E2E Test User"
TEST_PROJECT_NAME = "E2E Test Project"


@router.post("/seed")
async def seed_test_data(db: AsyncSession = Depends(get_db)):
    """Create a test user and project for E2E tests."""
    try:
        # Clean first
        await _cleanup(db)

        # Create user
        user = await create_user(
            db,
            email=TEST_EMAIL,
            password=TEST_PASSWORD,
            name=TEST_NAME,
        )

        # Create project
        project = Project(
            name=TEST_PROJECT_NAME,
            user_id=user.id,
            owner_id=user.id,
        )
        db.add(project)
        await db.flush()

        # Add user as admin member via the association table
        await db.execute(
            insert(project_members).values(
                user_id=user.id,
                project_id=project.id,
                role=ProjectRole.ADMIN,
            )
        )
        await db.commit()

        return {
            "user_id": user.id,
            "project_id": project.id,
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
        }
    except Exception as e:
        await db.rollback()
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Seed failed: {str(e)}")


@router.delete("/cleanup")
async def cleanup_test_data(db: AsyncSession = Depends(get_db)):
    """Remove all test data."""
    await _cleanup(db)
    return {"ok": True}


@router.get("/status")
async def test_status(db: AsyncSession = Depends(get_db)):
    """Check if test data exists."""
    from sqlalchemy import select
    user = await db.scalar(
        select(User).where(User.email == TEST_EMAIL)
    )
    return {
        "seeded": user is not None,
        "user_id": user.id if user else None,
    }


async def _cleanup(db: AsyncSession):
    """Delete only test-created data. NEVER truncate all tables."""
    from sqlalchemy import select, delete

    # Find the test user
    user = await db.scalar(select(User).where(User.email == TEST_EMAIL))
    if not user:
        return

    # Delete projects owned by test user (cascades to project_members, documents, etc.)
    await db.execute(delete(Project).where(Project.owner_id == user.id))
    # Delete the test user
    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
