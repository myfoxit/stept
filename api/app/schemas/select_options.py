from typing import Any, Dict, List, NoReturn
from pydantic import BaseModel, ConfigDict

OptionRow = Dict[str, Any]           

class SelectColumnCreate(BaseModel):
    table_id: str
    name: str
    options: List[OptionRow]         

class SelectOptionBulkUpdate(BaseModel):
    options: List[OptionRow]   


class SelectOptionRead(BaseModel):
    id: str
    name: str
    color: str
    order: int

    model_config = ConfigDict(
        from_attributes=True
    )

class AssignSelectOption(BaseModel):
    row_id:  int
    option_id: str 