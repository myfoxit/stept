from sqlalchemy import select, delete, update, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.utils import gen_suffix
from app.models import Project, project_members, ProjectRole, User
from typing import Optional

async def create_project(db: AsyncSession, name: str, user_id: str) -> Project:
    """
    Create a new project and add the creator as owner.
    """
    meta_id = gen_suffix(16)
    # Create project with owner_id for new model, user_id for backward compatibility
    project = Project(id=meta_id, name=name, owner_id=user_id, user_id=user_id)
    db.add(project)
    await db.flush()
    
    # Add creator as owner member in the association table
    stmt = insert(project_members).values(
        user_id=user_id,
        project_id=meta_id,
        role=ProjectRole.OWNER,
        invited_by=None  # Self-invited as creator
    )
    await db.execute(stmt)
    
    await db.refresh(project)
    return project

async def get_projects(db: AsyncSession, user_id: str) -> list[dict]:
    """
    Fetch all projects where user is a member (owner or participant).
    Returns dicts with created_by_name included.
    """
    # Query projects through the association table, join owner for display name
    stmt = (
        select(Project, User.name.label("created_by_name"))
        .join(project_members, Project.id == project_members.c.project_id)
        .join(User, Project.owner_id == User.id)
        .where(project_members.c.user_id == user_id)
    )
    res = await db.execute(stmt)
    rows = res.unique().all()
    results = []
    for project, created_by_name in rows:
        results.append({
            "id": project.id,
            "name": project.name,
            "user_id": project.user_id,
            "owner_id": project.owner_id,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
            "created_by_name": created_by_name,
        })
    return results

async def delete_project(db: AsyncSession, project_id: str) -> None:
    """
    Delete a project by its ID.
    """
    stmt = delete(Project).where(Project.id == project_id)
    await db.execute(stmt)
    await db.commit()

async def update_project(db: AsyncSession, project_id: str, name: str) -> Project:
    """
    Update a project's name by its ID.
    """
    stmt = update(Project).where(Project.id == project_id).values(name=name)
    await db.execute(stmt)
    await db.commit()
    
    # Fetch and return the updated project
    stmt = select(Project).where(Project.id == project_id)
    res = await db.execute(stmt)
    return res.scalar_one()

async def add_project_member(db: AsyncSession, project_id: str, user_id: str, role: str = 'member', invited_by: str = None):
    """
    Add a user to a project with specified role.
    """
    # Validate and convert role string to enum
    try:
        role_enum = ProjectRole(role)
    except ValueError:
        role_enum = ProjectRole.MEMBER  # Default to member for invalid roles
    
    stmt = insert(project_members).values(
        user_id=user_id,
        project_id=project_id,
        role=role_enum,
        invited_by=invited_by
    )
    await db.execute(stmt)
    await db.commit()

async def remove_project_member(db: AsyncSession, project_id: str, user_id: str):
    """
    Remove a user from a project.
    """
    stmt = delete(project_members).where(
        (project_members.c.project_id == project_id) &
        (project_members.c.user_id == user_id)
    )
    await db.execute(stmt)
    await db.commit()

async def update_member_role(db: AsyncSession, project_id: str, user_id: str, role: str):
    """
    Update a member's role in a project.
    """
    # Validate and convert role string to enum
    try:
        role_enum = ProjectRole(role)
    except ValueError:
        raise ValueError(f"Invalid role: {role}")
    
    stmt = (
        update(project_members)
        .where(
            (project_members.c.project_id == project_id) &
            (project_members.c.user_id == user_id)
        )
        .values(role=role_enum)
    )
    await db.execute(stmt)
    await db.commit()

async def get_project_members(db: AsyncSession, project_id: str):
    """
    Get all members of a project with their roles, names, and emails.
    """
    stmt = (
        select(
            project_members.c.user_id,
            project_members.c.role,
            project_members.c.joined_at,
            project_members.c.invited_by,
            User.name.label("display_name"),
            User.email,
        )
        .join(User, User.id == project_members.c.user_id)
        .where(project_members.c.project_id == project_id)
    )
    res = await db.execute(stmt)
    return [
        {
            "user_id": row.user_id,
            "role": row.role.value if hasattr(row.role, 'value') else row.role,
            "joined_at": row.joined_at,
            "invited_by": row.invited_by,
            "display_name": row.display_name,
            "email": row.email,
        }
        for row in res.all()
    ]

async def get_user_role_in_project(
    db: AsyncSession, 
    project_id: str, 
    user_id: str
) -> Optional[ProjectRole]:
    """
    Get a user's role in a project.
    Returns None if user is not a member.
    """
    stmt = select(project_members.c.role).where(
        (project_members.c.project_id == project_id) &
        (project_members.c.user_id == user_id)
    )
    result = await db.execute(stmt)
    role_value = result.scalar_one_or_none()
    
    if role_value is None:
        return None
    
    # Handle enum values properly
    if hasattr(role_value, 'value'):
        return ProjectRole(role_value.value)
    return ProjectRole(role_value)

