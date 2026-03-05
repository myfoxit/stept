# app/schemas/document.py
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel

class DocumentBase(BaseModel):
    name: Optional[str] = None
    content: Dict[str, Any] = {}
    page_layout: str = "document"

class DocumentCreate(DocumentBase):
    project_id: str
    folder_id: Optional[str] = None  # Documents must be in folders
    is_private: Optional[bool] = True  # Default: private (only owner)

class DocumentUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[Dict[str, Any]] = None
    page_layout: Optional[str] = None
    folder_id: Optional[str] = None
    is_private: Optional[bool] = None  # NEW
    version: Optional[int] = None  # Optimistic concurrency

class DocumentMove(BaseModel):
    parent_id: Optional[str] = None  # This is actually the folder_id
    position: Optional[int] = None  # Position is not used anymore but kept for compatibility
    is_private: Optional[bool] = None  # NEW: Allow changing privacy when moving

class DocumentLink(BaseModel):
    table_id: Optional[str] = None
    row_id: Optional[int] = None
    
    class Config:
        from_attributes = True

class DocumentRead(DocumentBase):
    id: str
    name: Optional[str] = None
    content: Dict[str, Any] = {}
    page_layout: str = "document"
    project_id: str
    folder_id: Optional[str] = None
    position: int = 0
    linked_table_id: Optional[str] = None
    linked_row_id: Optional[int] = None
    is_private: bool = False
    owner_id: Optional[str] = None
    source_file_mime: Optional[str] = None
    source_file_name: Optional[str] = None
    version: int = 1
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class DocumentTreeRead(DocumentRead):
    """Document with children for tree representation"""
    children: List['DocumentTreeRead'] = []
    
    class Config:
        from_attributes = True


   

class DocumentTreeRead(DocumentRead):
    """Document with children for tree representation"""
    children: List['DocumentTreeRead'] = []
    
    class Config:
        from_attributes = True

# Fix forward reference
DocumentTreeRead.model_rebuild()



