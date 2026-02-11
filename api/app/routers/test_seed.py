from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.database import get_session as get_db
from app.models import User, Project, project_members, ProjectRole, Folder, Document, ProcessRecordingSession, Session, ColumnVisibility
from app.security import hash_password
from app.core.test_config import test_settings
from app.utils import gen_suffix
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Only enable in test environment
if os.getenv("ENVIRONMENT") != "test":
    router = APIRouter()  # Empty router in non-test environments
else:
    async def cleanup_test_data_internal(db: AsyncSession):
        """Internal cleanup function that can be called from both endpoints and seed"""
        try:
            # Find test user
            stmt = select(User).where(User.email == test_settings.TEST_USER_EMAIL)
            user = await db.scalar(stmt)
            
            if user:
                # Delete sessions first to avoid foreign key constraint violations
                stmt = delete(Session).where(Session.user_id == user.id)
                await db.execute(stmt)
                
                # Delete column visibility preferences for the user
                stmt = delete(ColumnVisibility).where(ColumnVisibility.user_id == user.id)
                await db.execute(stmt)
                
                # Get all projects owned by test user
                stmt = select(Project).where(Project.owner_id == user.id)
                projects = await db.scalars(stmt)
                
                for project in projects:
                    # Delete folders associated with the project first
                    stmt = delete(Folder).where(Folder.project_id == project.id)
                    await db.execute(stmt)
                    
                    # Delete documents
                    stmt = delete(Document).where(Document.project_id == project.id)
                    await db.execute(stmt)
                    
                    # Delete process recording sessions
                    stmt = delete(ProcessRecordingSession).where(ProcessRecordingSession.project_id == project.id)
                    await db.execute(stmt)
                    
                    # Remove from project_members table
                    stmt = delete(project_members).where(project_members.c.project_id == project.id)
                    await db.execute(stmt)
                    
                    # Now delete the project
                    await db.delete(project)
                
                # Finally delete the user
                await db.delete(user)
                
                await db.flush()
                logger.info("Test data cleaned up successfully")
                return True
            else:
                logger.info("No test data to clean up")
                return False
        except Exception as e:
            logger.error(f"Failed to cleanup test data: {e}")
            raise e

    @router.post("/seed")
    async def seed_test_data(db: AsyncSession = Depends(get_db)):
        """Create test user and project for E2E tests"""
        try:
            # Clean up any existing test data first (don't fail if cleanup fails)
            try:
                await cleanup_test_data_internal(db)
            except Exception as e:
                logger.warning(f"Cleanup before seed failed: {e}")
                # Try to rollback and start fresh
                await db.rollback()
            
            # Check if user already exists
            stmt = select(User).where(User.email == test_settings.TEST_USER_EMAIL)
            existing_user = await db.scalar(stmt)
            
            if existing_user:
                # If user exists, just use it and create a new project
                user = existing_user
                logger.info(f"Using existing test user {user.id}")
            else:
                # Create test user
                user = User(
                    id=gen_suffix(16),
                    email=test_settings.TEST_USER_EMAIL,
                    normalized_email=test_settings.TEST_USER_EMAIL.lower(),
                    name=test_settings.TEST_USER_NAME,
                    hashed_password=hash_password(test_settings.TEST_USER_PASSWORD),
                    is_verified=True,
                )
                db.add(user)
                await db.flush()
                logger.info(f"Created new test user {user.id}")
            
            # Create test project
            project = Project(
                id=gen_suffix(16),
                name=test_settings.TEST_PROJECT_NAME,
                owner_id=user.id,
            )
            db.add(project)
            await db.flush()
            
            # Add user as owner to project
            # First check if the membership already exists
            stmt = select(project_members).where(
                project_members.c.user_id == user.id,
                project_members.c.project_id == project.id
            )
            existing_membership = await db.execute(stmt)
            if not existing_membership.first():
                stmt = project_members.insert().values(
                    user_id=user.id,
                    project_id=project.id,
                    role=ProjectRole.OWNER,
                )
                await db.execute(stmt)
            
            await db.commit()
            
            logger.info(f"Seeded test user {user.id} and project {project.id}")
            
            return {
                "user_id": user.id,
                "project_id": project.id,
                "email": user.email,
                "password": test_settings.TEST_USER_PASSWORD,
            }
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to seed test data: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/cleanup")
    async def cleanup_test_data(db: AsyncSession = Depends(get_db)):
        """Remove all test data after tests"""
        try:
            await cleanup_test_data_internal(db)
            await db.commit()
            return {"status": "cleaned"}
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to cleanup test data: {e}")
            # Return error details but don't raise exception
            return {"status": "cleanup_failed", "error": str(e)}

    @router.get("/status")
    async def test_seed_status(db: AsyncSession = Depends(get_db)):
        """Check if test data exists"""
        stmt = select(User).where(User.email == test_settings.TEST_USER_EMAIL)
        user = await db.scalar(stmt)
        
        if not user:
            return {"exists": False}
        
        stmt = select(Project).where(Project.owner_id == user.id)
        project = await db.scalar(stmt)
        
        return {
            "exists": True,
            "user_id": user.id if user else None,
            "project_id": project.id if project else None,
        }
