"""
Test seed/cleanup endpoints for E2E tests.

Safety: Only registered when ENVIRONMENT=test.
Only operates on test-specific data (e2e-test@ondoki.com).
"""

import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, insert

from app.database import get_session, DATABASE_URL
from app.models import User, Project, ProjectRole, project_members
from app.crud.user import create_user

router = APIRouter(prefix="/test", tags=["test"])

TEST_EMAIL = "e2e-test@ondoki.com"
TEST_PASSWORD = "TestPass123!"
TEST_NAME = "E2E Test User"
TEST_PROJECT_NAME = "E2E Test Project"


def _assert_test_db():
    """Abort if we're not connected to the test database."""
    if "ondoki_test" not in DATABASE_URL:
        raise RuntimeError(
            f"REFUSING to run test endpoints against non-test database: {DATABASE_URL}"
        )


@router.post("/seed")
async def seed_test_data(db: AsyncSession = Depends(get_session)):
    """Create a test user and project. Idempotent — cleans up first."""
    _assert_test_db()

    await _cleanup(db)

    user = await create_user(db, email=TEST_EMAIL, password=TEST_PASSWORD, name=TEST_NAME)

    project = Project(name=TEST_PROJECT_NAME, user_id=user.id, owner_id=user.id)
    db.add(project)
    await db.flush()

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


@router.delete("/cleanup")
async def cleanup_test_data(db: AsyncSession = Depends(get_session)):
    """Remove test user and their data."""
    _assert_test_db()
    await _cleanup(db)
    return {"ok": True}


@router.get("/status")
async def test_status(db: AsyncSession = Depends(get_session)):
    """Check if test data exists."""
    _assert_test_db()
    user = await db.scalar(select(User).where(User.email == TEST_EMAIL))
    return {"seeded": user is not None, "user_id": user.id if user else None}


async def _cleanup(db: AsyncSession):
    """Delete the test user and their owned projects. Nothing else."""
    user = await db.scalar(select(User).where(User.email == TEST_EMAIL))
    if not user:
        return
    await db.execute(delete(Project).where(Project.owner_id == user.id))
    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
