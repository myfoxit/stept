from typing import Optional
from pydantic import BaseModel
from datetime import datetime

class SortBase(BaseModel):
    table_id: str
    column_id: str
    direction: str = "asc"  # "asc" or "desc"
    priority: int = 0
    is_active: bool = True

class SortCreate(SortBase):
    pass

class SortUpdate(BaseModel):
    direction: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None

class SortRead(SortBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
