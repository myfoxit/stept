from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from sqlalchemy.orm import selectinload  # Add this import
from typing import List, Dict, Any
from app.database import get_session as get_db
from app.security import get_current_user
from app.models import Dashboard, DashboardWidget, User, TableMeta, FieldMeta
from app.schemas.dashboard import (
    DashboardCreate, DashboardRead, DashboardUpdate,
    DashboardWidgetCreate, DashboardWidgetRead, DashboardWidgetUpdate,
    WidgetDataRequest
)
from app.db.utils import quote_ident

router = APIRouter()

@router.post("/", response_model=DashboardRead)
async def create_dashboard(
    data: DashboardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dashboard = Dashboard(
        name=data.name,
        project_id=data.project_id,
        user_id=current_user.id,
        layout=[]
    )
    db.add(dashboard)
    await db.commit()
    
    # Eagerly load widgets relationship
    await db.refresh(dashboard)
    result = await db.execute(
        select(Dashboard)
        .options(selectinload(Dashboard.widgets))
        .where(Dashboard.id == dashboard.id)
    )
    dashboard = result.scalar_one()
    return dashboard

@router.get("/project/{project_id}", response_model=List[DashboardRead])
async def list_dashboards(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Dashboard)
        .options(selectinload(Dashboard.widgets))  # Eagerly load widgets
        .where(Dashboard.project_id == project_id)
        .where(Dashboard.user_id == current_user.id)
    )
    return result.scalars().all()

@router.get("/{dashboard_id}", response_model=DashboardRead)
async def get_dashboard(
    dashboard_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Dashboard)
        .options(selectinload(Dashboard.widgets))  # Eagerly load widgets
        .where(Dashboard.id == dashboard_id)
        .where(Dashboard.user_id == current_user.id)
    )
    dashboard = result.scalar_one_or_none()
    
    if not dashboard:
        raise HTTPException(404, "Dashboard not found")
    return dashboard

@router.put("/{dashboard_id}", response_model=DashboardRead)
async def update_dashboard(
    dashboard_id: str,
    data: DashboardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Dashboard)
        .options(selectinload(Dashboard.widgets))  # Eagerly load widgets
        .where(Dashboard.id == dashboard_id)
        .where(Dashboard.user_id == current_user.id)
    )
    dashboard = result.scalar_one_or_none()
    
    if not dashboard:
        raise HTTPException(404, "Dashboard not found")
    
    if data.name is not None:
        dashboard.name = data.name
    if data.layout is not None:
        dashboard.layout = data.layout
    
    await db.commit()
    await db.refresh(dashboard)
    
    # Re-fetch with eager loading
    result = await db.execute(
        select(Dashboard)
        .options(selectinload(Dashboard.widgets))
        .where(Dashboard.id == dashboard_id)
    )
    dashboard = result.scalar_one()
    return dashboard

@router.delete("/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dashboard = await db.get(Dashboard, dashboard_id)
    if not dashboard or dashboard.user_id != current_user.id:
        raise HTTPException(404, "Dashboard not found")
    
    await db.delete(dashboard)
    await db.commit()
    return {"status": "deleted"}

# Widget endpoints
@router.post("/{dashboard_id}/widgets", response_model=DashboardWidgetRead)
async def add_widget(
    dashboard_id: str,
    data: DashboardWidgetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Dashboard)
        .where(Dashboard.id == dashboard_id)
        .where(Dashboard.user_id == current_user.id)
    )
    dashboard = result.scalar_one_or_none()
    
    if not dashboard:
        raise HTTPException(404, "Dashboard not found")
    
    widget = DashboardWidget(
        dashboard_id=dashboard_id,
        **data.dict()
    )
    db.add(widget)
    await db.commit()
    await db.refresh(widget)
    return widget

@router.put("/widgets/{widget_id}", response_model=DashboardWidgetRead)
async def update_widget(
    widget_id: str,
    data: DashboardWidgetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(DashboardWidget)
        .join(Dashboard)
        .where(DashboardWidget.id == widget_id)
        .where(Dashboard.user_id == current_user.id)
    )
    widget = result.scalar_one_or_none()
    
    if not widget:
        raise HTTPException(404, "Widget not found")
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(widget, key, value)
    
    await db.commit()
    await db.refresh(widget)
    return widget

@router.delete("/widgets/{widget_id}")
async def delete_widget(
    widget_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(DashboardWidget)
        .join(Dashboard)
        .where(DashboardWidget.id == widget_id)
        .where(Dashboard.user_id == current_user.id)
    )
    widget = result.scalar_one_or_none()
    
    if not widget:
        raise HTTPException(404, "Widget not found")
    
    await db.delete(widget)
    await db.commit()
    return {"status": "deleted"}

@router.post("/widgets/data")
async def get_widget_data(
    request_data: WidgetDataRequest,  # Renamed parameter to avoid name collision
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch aggregated data for a widget"""
    table = await db.get(TableMeta, request_data.table_id)
    if not table:
        raise HTTPException(404, "Table not found")
    
    # Build the query dynamically based on request
    quoted_table = quote_ident(table.physical_name)
    
    # Select clause
    select_parts = []
    group_by_parts = []
    
    if request_data.group_by_column:
        select_parts.append(f"{request_data.group_by_column} as label")
        group_by_parts.append(request_data.group_by_column)
    elif request_data.x_axis_column:
        select_parts.append(f"{request_data.x_axis_column} as label")
        group_by_parts.append(request_data.x_axis_column)
    
    # Aggregation
    if request_data.aggregation == "count":
        select_parts.append("COUNT(*) as value")
    elif request_data.y_axis_column:
        agg_func = request_data.aggregation.upper()
        select_parts.append(f"{agg_func}({request_data.y_axis_column}) as value")
    else:
        select_parts.append("COUNT(*) as value")
    
    # Build query
    query = f"SELECT {', '.join(select_parts)} FROM {quoted_table}"
    
    # Add filters if any
    if request_data.filters:
        where_clauses = []
        for filter in request_data.filters:
            # Simple filter implementation
            column = filter.get("column")
            operator = filter.get("operator", "=")
            value = filter.get("value")
            if column and value is not None:
                where_clauses.append(f"{column} {operator} '{value}'")
        if where_clauses:
            query += f" WHERE {' AND '.join(where_clauses)}"
    
    # Group by
    if group_by_parts:
        query += f" GROUP BY {', '.join(group_by_parts)}"
    
    # Limit
    query += f" LIMIT {request_data.limit}"
    
    result = await db.execute(text(query))
    rows = result.fetchall()
    
    # Format for charts
    return {
        "data": [{"label": row.label if hasattr(row, 'label') else "Total", 
                  "value": row.value} for row in rows]
    }
