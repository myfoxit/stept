from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.project import (
    ProjectCreate, ProjectRead, ProjectUpdate, 
    ProjectMemberAdd, ProjectMemberUpdate, ProjectMemberRead
)
from app.crud.project import (
    create_project, get_projects, delete_project, update_project,
    add_project_member, remove_project_member, update_member_role, get_project_members,
    get_user_role_in_project
)
from app.database import get_session as get_db
from app.security import get_current_user, ProjectPermissionChecker, check_project_permission
from app.models import User, ProjectRole, Project
import secrets
import json
import base64
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession as _AsyncSession

router = APIRouter()

class JoinProjectRequest(BaseModel):
    token: str

class InviteRequest(BaseModel):
    email: str
    role: str = "viewer"

class ProjectPublicInfo(BaseModel):
    id: str
    name: str

@router.post("/", response_model=ProjectRead)
async def api_create_project(
    p: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Ensure user can only create projects for themselves
    if p.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot create projects for other users")
    # Check for duplicate project name for this user
    from app.models import project_members
    stmt = (
        select(Project)
        .join(project_members)
        .where(project_members.c.user_id == p.user_id)
        .where(Project.name == p.name)
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="You already have a project with this name")
    return await create_project(db, p.name, p.user_id)

@router.get("/{user_id}", response_model=list[ProjectRead])
async def api_list_projects(
    db: AsyncSession = Depends(get_db),
    user_id: str = None,
    current_user: User = Depends(get_current_user),
):
    """Get all projects where user is a member (backward compatible)."""
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot list projects for other users")
    return await get_projects(db, user_id)

@router.delete("/{project_id}")
async def api_delete_project(
    project_id: str, 
    db: AsyncSession = Depends(get_db),
    auth: tuple[User, ProjectRole] = Depends(ProjectPermissionChecker(ProjectRole.OWNER))
):
    """Only project owner can delete the project."""
    await delete_project(db, project_id)
    return {"status": "deleted"}

@router.put("/{project_id}", response_model=ProjectRead)
async def api_update_project(
    project_id: str, 
    p: ProjectUpdate, 
    db: AsyncSession = Depends(get_db),
    auth: tuple[User, ProjectRole] = Depends(ProjectPermissionChecker(ProjectRole.ADMIN))
):
    """Only admins and owners can update project settings."""
    return await update_project(db, project_id, name=p.name, ai_enabled=p.ai_enabled)

# New endpoints for member management
@router.post("/{project_id}/members", response_model=dict)
async def api_add_project_member(
    project_id: str, 
    member: ProjectMemberAdd,
    db: AsyncSession = Depends(get_db),
    auth: tuple[User, ProjectRole] = Depends(ProjectPermissionChecker(ProjectRole.ADMIN))
):
    """Add a member to a project. Requires admin role."""
    current_user, user_role = auth
    
    # Prevent non-owners from adding owners
    if member.role == ProjectRole.OWNER.value and user_role != ProjectRole.OWNER:
        raise HTTPException(status_code=403, detail="Only owners can add other owners")
    
    await add_project_member(
        db, 
        project_id, 
        member.user_id, 
        member.role,
        invited_by=current_user.id
    )
    return {"status": "added"}

@router.delete("/{project_id}/members/{user_id}")
async def api_remove_project_member(
    project_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    auth: tuple[User, ProjectRole] = Depends(ProjectPermissionChecker(ProjectRole.ADMIN))
):
    """Remove a member from a project. Requires admin role."""
    current_user, user_role = auth
    
    # Check if trying to remove an owner
    members = await get_project_members(db, project_id)
    target_member = next((m for m in members if m['user_id'] == user_id), None)
    
    if target_member and target_member['role'] == ProjectRole.OWNER.value:
        if user_role != ProjectRole.OWNER:
            raise HTTPException(status_code=403, detail="Only owners can remove other owners")
    
    await remove_project_member(db, project_id, user_id)
    return {"status": "removed"}

@router.put("/{project_id}/members/{user_id}", response_model=dict)
async def api_update_member_role(
    project_id: str,
    user_id: str,
    update: ProjectMemberUpdate,
    db: AsyncSession = Depends(get_db),
    auth: tuple[User, ProjectRole] = Depends(ProjectPermissionChecker(ProjectRole.ADMIN))
):
    """Update a member's role in a project. Requires admin role."""
    current_user, user_role = auth
    
    # Only owners can promote to owner or demote from owner
    if update.role == ProjectRole.OWNER.value or user_role != ProjectRole.OWNER:
        members = await get_project_members(db, project_id)
        target_member = next((m for m in members if m['user_id'] == user_id), None)
        
        if target_member and target_member['role'] == ProjectRole.OWNER.value:
            if user_role != ProjectRole.OWNER:
                raise HTTPException(status_code=403, detail="Only owners can change owner roles")
    
    await update_member_role(db, project_id, user_id, update.role)
    return {"status": "updated"}

@router.get("/{project_id}/members", response_model=list[ProjectMemberRead])
async def api_get_project_members(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    auth: tuple[User, ProjectRole] = Depends(ProjectPermissionChecker(ProjectRole.VIEWER))
):
    """Get all members of a project. Requires at least viewer role."""
    return await get_project_members(db, project_id)

@router.post("/{project_id}/invite", response_model=dict)
async def api_create_invite_link(
    project_id: str,
    request: InviteRequest,
    db: AsyncSession = Depends(get_db),
    auth: tuple[User, ProjectRole] = Depends(ProjectPermissionChecker(ProjectRole.ADMIN))
):
    """Generate an invite token for the project. Requires admin role."""
    current_user, user_role = auth
    
    # Validate the requested role
    try:
        requested_role = ProjectRole(request.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {request.role}")
    
    # Can't invite someone with higher permissions than yourself
    if requested_role.level > user_role.level:
        raise HTTPException(status_code=403, detail="Cannot invite users with higher permissions than your own")
    
    # Generate invite token with expiration
    invite_data = {
        "project_id": project_id,
        "role": request.role,
        "email": request.email.lower().strip(),
        "invited_by": current_user.id,
        "expires_at": (datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7)).isoformat(),
        "token": secrets.token_urlsafe(32)
    }
    
    # TODO: send invite email to request.email
    # Sign the token with HMAC to prevent forgery
    payload = base64.urlsafe_b64encode(json.dumps(invite_data).encode()).decode()
    from app.core.config import settings
    import hmac as _hmac, hashlib as _hl
    sig = _hmac.new(settings.SECRET_KEY.encode(), payload.encode(), _hl.sha256).hexdigest()
    token = f"{payload}.{sig}"
    
    return {
        "token": token,
        "expires_at": invite_data["expires_at"]
    }

@router.get("/{project_id}/public-info", response_model=ProjectPublicInfo)
async def api_get_project_public_info(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get minimal public info about a project (no auth required)."""
    stmt = select(Project).where(Project.id == project_id)
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectPublicInfo(id=project.id, name=project.name)

@router.post("/join", response_model=dict)
async def api_join_project_with_token(
    request: JoinProjectRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Join a project using an invite token. Only the invited email can join."""
    try:
        # Verify HMAC signature
        from app.core.config import settings
        import hmac as _hmac, hashlib as _hl
        parts = request.token.rsplit(".", 1)
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail="Invalid invite token")
        payload, sig = parts
        expected_sig = _hmac.new(settings.SECRET_KEY.encode(), payload.encode(), _hl.sha256).hexdigest()
        if not _hmac.compare_digest(sig, expected_sig):
            raise HTTPException(status_code=400, detail="Invalid invite token")

        # Decode token
        invite_data = json.loads(base64.urlsafe_b64decode(payload.encode()).decode())
        
        # Check expiration
        expires_at = datetime.fromisoformat(invite_data["expires_at"])
        if datetime.now(timezone.utc).replace(tzinfo=None) > expires_at:
            raise HTTPException(status_code=400, detail="Invite link has expired")
        
        # Validate email matches the invited email
        invited_email = invite_data.get("email", "").lower().strip()
        if invited_email and current_user.email.lower().strip() != invited_email:
            raise HTTPException(status_code=403, detail="This invite was sent to a different email address")
        
        # Check if user is already a member
        members = await get_project_members(db, invite_data["project_id"])
        if any(m['user_id'] == current_user.id for m in members):
            return {"status": "already_member", "project_id": invite_data["project_id"]}
        
        # Add user to project
        await add_project_member(
            db,
            invite_data["project_id"],
            current_user.id,
            invite_data["role"],
            invited_by=invite_data["invited_by"]
        )
        
        return {"status": "joined", "project_id": invite_data["project_id"]}
        
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail="Invalid invite token")

@router.get("/{project_id}/role", response_model=dict)
async def api_get_user_role(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the current user's role in a project."""
    role = await get_user_role_in_project(db, project_id, current_user.id)
    
    if role is None:
        return {"role": None}
    
    # Convert enum to string value
    return {"role": role.value if hasattr(role, 'value') else str(role)}
