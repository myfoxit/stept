from pydantic import BaseModel, Field, validator
from typing import Optional, Any, List, Dict
from datetime import datetime

# Configuration for allowed operations per ui_type
OPERATIONS_BY_UI_TYPE = {
    "single_line_text": ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty", "starts_with", "ends_with"],
    "number": ["equals", "not_equals", "gt", "lt", "gte", "lte", "is_empty", "is_not_empty", "between"],
    "decimal": ["equals", "not_equals", "gt", "lt", "gte", "lte", "is_empty", "is_not_empty", "between"],
    "single_select": ["equals", "not_equals", "is_empty", "is_not_empty", "in", "not_in"],
    "oo_relation": ["equals", "not_equals", "is_empty", "is_not_empty"],
    "om_relation": ["contains", "not_contains", "is_empty", "is_not_empty"],
    "mo_relation": ["contains", "not_contains", "is_empty", "is_not_empty"],
    "mm_relation_left": ["contains", "not_contains", "is_empty", "is_not_empty"],
    "mm_relation_right": ["contains", "not_contains", "is_empty", "is_not_empty"],
    "lookup": ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"],
    "formula": ["equals", "not_equals", "contains", "not_contains"],
    "rollup": ["equals", "not_equals", "gt", "lt", "gte", "lte"],
    "BOOLEAN": ["equals", "not_equals"],
}

class FilterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    table_id: str
    column_id: str
    operation: str
    value: Optional[Any] = None
    is_reusable: bool = False

    @validator('operation')
    def validate_operation(cls, v):
        all_operations = set()
        for ops in OPERATIONS_BY_UI_TYPE.values():
            all_operations.update(ops)
        if v not in all_operations:
            raise ValueError(f"Invalid operation: {v}")
        return v

class FilterUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    operation: Optional[str] = None
    value: Optional[Any] = None
    is_reusable: Optional[bool] = None
    is_active: Optional[bool] = None

class FilterRead(BaseModel):
    id: str
    name: str
    table_id: str
    user_id: str
    column_id: str
    operation: str
    value: Optional[Any]
    is_reusable: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class FilterApply(BaseModel):
    filter_ids: List[str] = Field(default_factory=list)
