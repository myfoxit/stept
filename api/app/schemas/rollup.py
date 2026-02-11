from __future__ import annotations
from pydantic import BaseModel
from typing import Optional

class RollupBase(BaseModel):
    relation_column_id: str
    aggregate_func: str
    rollup_column_id: Optional[str] = None
    precision: Optional[int] = None
    show_thousands_sep: Optional[bool] = False

class RollupCreate(RollupBase):
    display_name: str
    table_id: str

class RollupUpdate(BaseModel):
    relation_column_id: Optional[str] = None
    rollup_column_id: Optional[str] = None
    aggregate_func: Optional[str] = None
    precision: Optional[int] = None
    show_thousands_sep: Optional[bool] = None

class RollupRead(BaseModel):
    id: str
    column_id: str
    relation_column_id: str
    rollup_column_id: Optional[str] = None
    aggregate_func: str
    precision: Optional[int] = None
    show_thousands_sep: bool

    class Config:
        from_attributes = True
