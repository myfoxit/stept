from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List

class ProjectCreate(BaseModel):
    name: str
    user_id: str

class ProjectUpdate(BaseModel):
    name: str

class ProjectRead(BaseModel):
    id: str
    name: str
    user_id: Optional[str] = None  # Keep for backward compatibility
    owner_id: str  # New field for project owner
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by_name: Optional[str] = None  # Creator's display name
    
    class Config:
        from_attributes = True

class ProjectMemberAdd(BaseModel):
    user_id: str
    role: str = 'member'  # owner, admin, editor, viewer, member

class ProjectMemberUpdate(BaseModel):
    role: str

class ProjectMemberRead(BaseModel):
    user_id: str
    role: str
    joined_at: datetime
    invited_by: Optional[str] = None
    
    class Config:
        from_attributes = True

class ProjectWithMembers(ProjectRead):
    members: List[ProjectMemberRead] = []
