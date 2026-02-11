from typing import Dict, Any, Optional, Literal
from pydantic import BaseModel

# insert a full row as { column_name: value, ... }
class FieldCreate(BaseModel):
    table_id: str
    data: Dict[str, Any]

Row = Dict[str, Any]   

class FieldUpdate(BaseModel):
    data: Dict[str, Any]
class RowPage(BaseModel):
    items: list[Row]
    total: int

class SearchRequest(BaseModel):
    query: str
    scope: str = "global"

class FieldCreatePosition(BaseModel):
    table_id: str
    data: Dict[str, Any]
    position: Literal["above", "below"] = "below"
    reference_row_id: Optional[int] = None
