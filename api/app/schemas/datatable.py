"""Pydantic schemas for the datatable feature."""
from __future__ import annotations

from typing import Optional, Any, Dict, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Table
# ---------------------------------------------------------------------------

class TableCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    project_id: str
    folder_id: Optional[str] = None


class TableRead(BaseModel):
    id: str
    name: str
    physical_name: str
    project_id: str
    table_type: str
    has_order_column: bool

    model_config = ConfigDict(from_attributes=True)


class TableUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


# ---------------------------------------------------------------------------
# Column
# ---------------------------------------------------------------------------

class ColumnCreate(BaseModel):
    table_id: str
    name: str
    ui_type: str
    scale: Optional[int] = None
    position: Optional[str] = None  # "left" or "right"
    reference_column_id: Optional[str] = None
    default_value: Optional[Any] = None
    settings: Optional[Dict[str, Any]] = None


class ColumnUpdate(BaseModel):
    name: Optional[str] = None
    default_value: Optional[Any] = None
    settings: Optional[Dict[str, Any]] = None


class ColumnRead(BaseModel):
    id: str
    table_id: str
    display_name: Optional[str] = None
    name: str
    ui_type: str
    fk_type: Optional[str] = None
    column_type: str
    relations_table_id: Optional[str] = None
    relation_id: Optional[str] = None
    sr__order: int = 1000
    default_value: Optional[Any] = None
    settings: Optional[Dict[str, Any]] = None
    allowed_operations: List[str] = []
    active_filters: List[Dict[str, Any]] = []

    model_config = ConfigDict(from_attributes=True)


class ColumnReorder(BaseModel):
    new_position: int = Field(..., ge=0)


# ---------------------------------------------------------------------------
# Row / Field
# ---------------------------------------------------------------------------

class RowCreate(BaseModel):
    table_id: str
    data: Dict[str, Any]


class RowCreateAtPosition(BaseModel):
    table_id: str
    data: Dict[str, Any]
    position: str = "below"  # "above" or "below"
    reference_row_id: Optional[int] = None


class RowUpdate(BaseModel):
    data: Dict[str, Any]


# ---------------------------------------------------------------------------
# Relation
# ---------------------------------------------------------------------------

class RelationCreate(BaseModel):
    left_table_id: str
    right_table_id: str
    relation_type: str
    display_name: Optional[str] = None


class RelationAssign(BaseModel):
    left_item_id: int
    right_item_id: int
    left_table_id: str


# ---------------------------------------------------------------------------
# Select Option
# ---------------------------------------------------------------------------

class SelectColumnCreate(BaseModel):
    table_id: str
    name: str
    options: List[Any] = []
    ui_type: str = "single_select"


class SelectOptionUpdate(BaseModel):
    options: List[Any]


class SelectOptionAssign(BaseModel):
    row_id: int
    option_id: Optional[str] = None


class MultiSelectOptionAssign(BaseModel):
    row_id: int
    option_ids: Optional[List[str]] = None


# ---------------------------------------------------------------------------
# Formula
# ---------------------------------------------------------------------------

class FormulaCreate(BaseModel):
    display_name: str
    table_id: str
    formula: str
    formula_raw: str
    position: Optional[str] = None
    reference_column_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Rollup
# ---------------------------------------------------------------------------

class RollupCreate(BaseModel):
    display_name: str
    table_id: str
    relation_column_id: str
    aggregate_func: str
    rollup_column_id: Optional[str] = None
    precision: Optional[int] = None
    show_thousands_sep: bool = False


class RollupUpdate(BaseModel):
    relation_column_id: Optional[str] = None
    rollup_column_id: Optional[str] = None
    aggregate_func: Optional[str] = None
    precision: Optional[int] = None
    show_thousands_sep: Optional[bool] = None


# ---------------------------------------------------------------------------
# Lookup
# ---------------------------------------------------------------------------

class LookupCreate(BaseModel):
    relation_column_id: str
    lookup_column_id: str
    custom_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Filter
# ---------------------------------------------------------------------------

OPERATIONS_BY_UI_TYPE = {
    "single_line_text": ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty", "starts_with", "ends_with"],
    "number": ["equals", "not_equals", "gt", "lt", "gte", "lte", "is_empty", "is_not_empty", "between"],
    "decimal": ["equals", "not_equals", "gt", "lt", "gte", "lte", "is_empty", "is_not_empty", "between"],
    "single_select": ["equals", "not_equals", "is_empty", "is_not_empty", "in", "not_in"],
    "multi_select": ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"],
    "oo_relation": ["equals", "not_equals", "is_empty", "is_not_empty"],
    "om_relation": ["contains", "not_contains", "is_empty", "is_not_empty"],
    "mo_relation": ["contains", "not_contains", "is_empty", "is_not_empty"],
    "mm_relation_left": ["contains", "not_contains", "is_empty", "is_not_empty"],
    "mm_relation_right": ["contains", "not_contains", "is_empty", "is_not_empty"],
    "lookup": ["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty"],
    "formula": ["equals", "not_equals", "contains", "not_contains"],
    "rollup": ["equals", "not_equals", "gt", "lt", "gte", "lte"],
    "BOOLEAN": ["equals", "not_equals"],
    "long_text": ["contains", "not_contains", "is_empty", "is_not_empty"],
}


class FilterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    table_id: str
    column_id: str
    operation: str
    value: Optional[Any] = None
    is_reusable: bool = False

    @field_validator("operation")
    @classmethod
    def validate_operation(cls, v: str) -> str:
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
    value: Optional[Any] = None
    is_reusable: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Sort
# ---------------------------------------------------------------------------

class SortCreate(BaseModel):
    table_id: str
    column_id: str
    direction: str = "asc"
    priority: int = 0


class SortUpdate(BaseModel):
    direction: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None


class SortRead(BaseModel):
    id: str
    table_id: str
    user_id: str
    column_id: str
    direction: str
    priority: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Column Visibility
# ---------------------------------------------------------------------------

class VisibilityCreate(BaseModel):
    table_id: str
    column_id: str
    is_visible: bool = True


class VisibilityBulk(BaseModel):
    table_id: str
    columns: List[Dict[str, Any]]  # [{"column_id": ..., "is_visible": ...}]


class VisibilityRead(BaseModel):
    id: str
    table_id: str
    user_id: str
    column_id: str
    is_visible: bool

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

class ImportConfirm(BaseModel):
    table_id: str
    column_mapping: Dict[str, Any]  # source_col -> {action: "skip"|"new"|"existing", target: ...}
