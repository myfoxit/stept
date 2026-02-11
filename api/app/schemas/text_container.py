# app/schemas/document.py
from pydantic import BaseModel, Field
from typing import Any, Optional

class TextContainerCreate(BaseModel):
    name: str
    content: dict[str, Any] = Field(default_factory=dict)

class TextContainerUpdate(BaseModel):
    id: str
    content: Optional[dict] = None
    name: Optional[str] = None
    

class TextContainerRead(BaseModel):
    id: str
    name: str
    content: dict[str, Any] = Field(default_factory=dict)
