from typing import Optional
from pydantic import BaseModel, EmailStr
from pydantic_settings import SettingsConfigDict  # pydantic v2 helper

class UserRead(BaseModel):
    id: str
    email: EmailStr
    name: Optional[str] = None

    model_config = SettingsConfigDict(from_attributes=True)  # <- replaces orm_mode

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
