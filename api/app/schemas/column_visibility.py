from typing import Optional
from pydantic import BaseModel
from datetime import datetime

class ColumnVisibilityBase(BaseModel):
    table_id: str
    column_id: str
    is_visible: bool = True

class ColumnVisibilityCreate(ColumnVisibilityBase):
    pass

class ColumnVisibilityUpdate(BaseModel):
    is_visible: Optional[bool] = None

class ColumnVisibilityRead(ColumnVisibilityBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ColumnVisibilityBulkUpdate(BaseModel):
    table_id: str
    visibility: dict[str, bool]  # column_id -> is_visible
