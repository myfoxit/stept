from typing import Optional, Any, Dict  # Added Any, Dict
from pydantic import BaseModel, ConfigDict, Field, validator  # Added validator

class ColumnCreate(BaseModel):
    table_id: str
    name: str
    ui_type: str
    scale: Optional[int] = None
    position: Optional[str] = None
    reference_column_id: Optional[str] = None
    default_value: Optional[Any] = None  # NEW
    settings: Optional[Dict[str, Any]] = None  # NEW

class ColumnUpdate(BaseModel):
    name: Optional[str] = None
    default_value: Optional[Any] = None  # NEW
    settings: Optional[Dict[str, Any]] = None  # NEW

class ColumnRead(BaseModel):
    id: str
    table_id: str
    display_name: str
    name: str
    ui_type: str
    fk_type: str
    column_type: str
    relations_table_id: Optional[str] = None
    relation_id: Optional[str] = None
    scale: Optional[int] = None
    sr__order: int
    default_value: Optional[Any] = None  # NEW
    settings: Optional[Dict[str, Any]] = None  # NEW

    model_config = ConfigDict(
        from_attributes=True
    )

class ColumnUpdate(BaseModel):
    """Schema for updating column properties."""
    name: Optional[str] = Field(None, description="New display name for the column")
    # Add other updatable fields as needed in the future
    
    class Config:
        orm_mode = True
