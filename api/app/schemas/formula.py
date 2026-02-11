from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class FormulaCreate(BaseModel):
    display_name: str
    table_id: str
    formula: str
    formula_raw: str
    position: Optional[str] = None  # NEW field
    reference_column_id: Optional[str] = None  # NEW field

class FormulaRead(BaseModel):
    id: str
    column_id: str
    formula: str
    formula_raw: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
