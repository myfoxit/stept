from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

class FolderCreate(BaseModel):
    name: str
    project_id: str
    parent_id: Optional[str] = None
    position: Optional[int] = None
    icon: Optional[str] = None
    is_private: Optional[bool] = False  # NEW

class FolderUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    is_private: Optional[bool] = None  # NEW

class FolderMove(BaseModel):
    parent_id: Optional[str] = None
    position: Optional[int] = None
    is_private: Optional[bool] = None  # NEW: Allow changing privacy when moving

class FolderRead(BaseModel):
    id: str
    name: str
    project_id: str
    parent_id: Optional[str] = None
    path: str
    depth: int
    position: int
    is_expanded: bool
    icon: Optional[str] = None
    is_private: bool = False  # NEW
    owner_id: Optional[str] = None  # NEW
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class FolderTreeRead(BaseModel):
    id: str
    name: Optional[str] = None
    icon: Optional[str] = None
    parent_id: Optional[str] = None
    path: str
    depth: int
    position: int
    is_expanded: bool
    is_folder: bool = True
    is_workflow: bool = False
    is_private: bool = False  # NEW
    owner_id: Optional[str] = None  # NEW
    children: List[Any] = []

    class Config:
        from_attributes = True

FolderTreeRead.model_rebuild()
