from pydantic import BaseModel, Field, ConfigDict
from typing import Literal, Optional

class RelationCreate(BaseModel):
    left_table_id: str
    right_table_id: str
    relation_type: Literal['one_to_one','one_to_many', 'many_to_one', 'many_to_many']
    display_name: Optional[str] = None

class RelationRead(BaseModel):
    id: str
    left_table_id: str
    right_table_id: str
    relation_type: str
    display_name: Optional[str]

    model_config = ConfigDict(
        from_attributes=True
    )



class RelationAssign(BaseModel):
    left_item_id: int
    right_item_id: int
    left_table_id: str

