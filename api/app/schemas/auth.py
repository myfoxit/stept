from typing import Optional
from pydantic import BaseModel, EmailStr

class TokenRead(BaseModel):
    access_token: str
    token_type: str = "bearer"

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class PasswordResetRequestIn(BaseModel):
    email: EmailStr

class PasswordResetConfirmIn(BaseModel):
    token: str
    new_password: str

class VerifyIn(BaseModel):
    token: str
