from pydantic import BaseModel, ConfigDict

class TableCreate(BaseModel):
    name: str
    project_id: str

class TableRead(BaseModel):
    id: str
    name: str
    physical_name: str
    project_id: str
    model_config = ConfigDict(
        from_attributes=True
    )

class TableUpdate(BaseModel):
    name: str
