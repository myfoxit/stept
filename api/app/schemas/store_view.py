from typing import List, Optional
from pydantic import BaseModel, ConfigDict

class StoreViewCreate(BaseModel):
    name: str
    buyer_table_id: Optional[str] = None
    cart_table_id: Optional[str] = None
    article_table_id: Optional[str] = None
    calc_field_ids: Optional[List[str]] = None

class StoreViewRead(BaseModel):
    id: str
    name: str
    buyer_table_id: Optional[str] = None
    cart_table_id: Optional[str] = None
    article_table_id: Optional[str] = None
    calc_field_ids: List[str] = []

    model_config = ConfigDict(from_attributes=True)
