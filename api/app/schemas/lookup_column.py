from typing import Optional
from pydantic import BaseModel

class LookUpColumnCreate(BaseModel):
    custom_name: Optional[str]
    relation_column_id: str
    lookup_column_id: str
