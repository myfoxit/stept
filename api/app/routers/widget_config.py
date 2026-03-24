"""Widget configuration endpoint for embed widgets."""
from __future__ import annotations

from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import ProcessRecordingSession, ProcessRecordingStep, Project, ContextLink
from app.mcp_auth import validate_api_key

router = APIRouter()


def _convert_workflow_to_guide(workflow: ProcessRecordingSession, steps: List[ProcessRecordingStep]) -> Dict[str, Any]:
    """Convert a workflow and its steps to guide format for the widget."""
    guide_steps = []
    
    for step in steps:
        # Convert step to widget format
        step_data = {
            "index": step.step_number,
            "type": step.step_type or "action",
            "description": step.generated_description or step.description or "",
            "selector": None,  # Would need to derive from element_info
            "action": step.action_type,
            "pageUrl": step.url,
            "screenshot": f"/api/v1/public/workflow/{workflow.id}/step/{step.step_number}/screenshot",
        }
        
        # Try to extract selector from element_info
        if step.element_info:
            # This is a simplified selector extraction - would need more sophisticated logic
            element = step.element_info
            selector = None
            
            if isinstance(element, dict):
                # Try various selector strategies
                if element.get("id"):
                    selector = f"#{element['id']}"
                elif element.get("testId"):
                    selector = f"[data-testid='{element['testId']}']"
                elif element.get("className"):
                    # Use first class name
                    classes = element["className"].split()
                    if classes:
                        selector = f".{classes[0]}"
                elif element.get("tagName"):
                    selector = element["tagName"].lower()
            
            step_data["selector"] = selector
        
        guide_steps.append(step_data)
    
    return {
        "id": workflow.id,
        "name": workflow.name or "Untitled Guide",
        "description": workflow.summary or "",
        "steps": guide_steps,
        "tags": workflow.tags or [],
        "estimatedTime": workflow.estimated_time,
        "difficulty": workflow.difficulty,
    }


def _get_tooltips_from_context_links(project_id: str, context_links: List[ContextLink]) -> List[Dict[str, Any]]:
    """Convert context links to tooltip format for the widget."""
    tooltips = []
    
    for link in context_links:
        if link.resource_type == "document":
            tooltip = {
                "id": link.id,
                "trigger": {
                    "type": link.match_type,
                    "value": link.match_value,
                },
                "content": {
                    "type": "document",
                    "resourceId": link.resource_id,
                    "title": link.note or "Documentation",
                    "url": f"/api/v1/public/document/{link.resource_id}",
                }
            }
            tooltips.append(tooltip)
    
    return tooltips


@router.get("/widget/config")
async def get_widget_config(
    project_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    x_api_key: Optional[str] = Header(None, alias="X-Api-Key"),
):
    """Returns full widget config for embed widgets."""
    # Authenticate via X-Api-Key header (MCP key)
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-Api-Key header")
    
    api_key = await validate_api_key(x_api_key, db)
    if not api_key or api_key.project_id != project_id:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    # Get the project
    project_stmt = select(Project).where(Project.id == project_id)
    project = (await db.execute(project_stmt)).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get all published workflows for the project
    workflows_stmt = select(ProcessRecordingSession).where(
        and_(
            ProcessRecordingSession.project_id == project_id,
            ProcessRecordingSession.status == "completed",
            ProcessRecordingSession.is_processed == True,
            ProcessRecordingSession.deleted_at.is_(None),
            # Only include public workflows or workflows without privacy settings
            ProcessRecordingSession.is_private == False,
        )
    )
    workflows = (await db.execute(workflows_stmt)).scalars().all()
    
    # Convert workflows to guides
    guides = []
    for workflow in workflows:
        # Get steps for this workflow
        steps_stmt = select(ProcessRecordingStep).where(
            ProcessRecordingStep.session_id == workflow.id
        ).order_by(ProcessRecordingStep.step_number)
        steps = (await db.execute(steps_stmt)).scalars().all()
        
        guide = _convert_workflow_to_guide(workflow, steps)
        guides.append(guide)
    
    # Get context links (tooltips) for the project
    context_links_stmt = select(ContextLink).where(
        ContextLink.project_id == project_id
    )
    context_links = (await db.execute(context_links_stmt)).scalars().all()
    tooltips = _get_tooltips_from_context_links(project_id, context_links)
    
    # Build widget config
    config = {
        "projectId": project_id,
        "projectName": project.name,
        "guides": guides,
        "tooltips": tooltips,
        "helpWidget": {
            "enabled": True,
            "position": "bottom-right",
            "color": "#6366f1",
            "showGuides": True,
            "showTooltips": True,
        },
        "analytics": {
            "enabled": True,
            "endpoint": "/api/v1/widget/events",
        },
        "branding": {
            "showSteptBranding": True,
            "customLogo": None,
            "customColors": {},
        }
    }
    
    return config