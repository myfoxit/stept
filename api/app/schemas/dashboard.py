from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class DashboardWidgetBase(BaseModel):
    title: str
    chart_type: str
    table_id: str
    x_axis_column: Optional[str] = None
    y_axis_column: Optional[str] = None
    group_by_column: Optional[str] = None
    aggregation: Optional[str] = "count"
    filters: Optional[List[Dict[str, Any]]] = []
    x: int = 0
    y: int = 0
    w: int = 6
    h: int = 4

class DashboardWidgetCreate(DashboardWidgetBase):
    pass

class DashboardWidgetUpdate(BaseModel):
    title: Optional[str] = None
    chart_type: Optional[str] = None
    x_axis_column: Optional[str] = None
    y_axis_column: Optional[str] = None
    group_by_column: Optional[str] = None
    aggregation: Optional[str] = None
    filters: Optional[List[Dict[str, Any]]] = None
    x: Optional[int] = None
    y: Optional[int] = None
    w: Optional[int] = None
    h: Optional[int] = None

class DashboardWidgetRead(DashboardWidgetBase):
    id: str
    dashboard_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DashboardBase(BaseModel):
    name: str
    project_id: str

class DashboardCreate(DashboardBase):
    pass

class DashboardUpdate(BaseModel):
    name: Optional[str] = None
    layout: Optional[List[Dict[str, Any]]] = None

class DashboardRead(DashboardBase):
    id: str
    user_id: str
    layout: List[Dict[str, Any]]
    widgets: List[DashboardWidgetRead]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class WidgetDataRequest(BaseModel):
    table_id: str
    x_axis_column: Optional[str] = None
    y_axis_column: Optional[str] = None
    group_by_column: Optional[str] = None
    aggregation: str = "count"
    filters: Optional[List[Dict[str, Any]]] = []
    limit: int = 100
