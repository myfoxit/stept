"""
Microsoft Teams integration — bot that surfaces stept workflows in Teams channels.

Features:
- Responds to @mentions with relevant workflow search results
- Can be configured per project
- Uses existing RAG search infrastructure
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import User, AppSettings
from app.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/teams")


# ── Config models ──

class TeamsConfig(BaseModel):
    webhook_url: str
    bot_id: Optional[str] = None
    project_id: Optional[str] = None
    enabled: bool = True


class TeamsConfigOut(BaseModel):
    enabled: bool
    project_id: Optional[str] = None
    connected: bool = False


# ── Config endpoints ──

@router.get("/teams/config")
async def get_teams_config(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamsConfigOut:
    """Get Teams integration config for a project."""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == f"teams_config_{project_id}")
    )
    setting = result.scalar_one_or_none()
    if not setting:
        return TeamsConfigOut(enabled=False, connected=False)
    
    config = setting.value
    return TeamsConfigOut(
        enabled=config.get("enabled", False),
        project_id=project_id,
        connected=bool(config.get("webhook_url")),
    )


@router.put("/teams/config")
async def update_teams_config(
    project_id: str,
    config: TeamsConfig,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update Teams integration config for a project."""
    key = f"teams_config_{project_id}"
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    setting = result.scalar_one_or_none()
    
    config_dict = config.model_dump()
    
    if setting:
        setting.value = config_dict
    else:
        setting = AppSettings(key=key, value=config_dict)
        db.add(setting)
    
    await db.commit()
    return {"status": "ok"}


@router.delete("/teams/config")
async def disconnect_teams(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disconnect Teams integration."""
    key = f"teams_config_{project_id}"
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        await db.delete(setting)
        await db.commit()
    return {"status": "ok"}


# ── Teams webhook (receives events from Teams via Bot Framework) ──

@router.post("/teams/webhook")
async def teams_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle incoming Teams Bot Framework activities.
    """
    body = await request.body()
    
    try:
        activity = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")
    
    activity_type = activity.get("type")
    
    if activity_type == "message":
        text = activity.get("text", "")
        # Strip bot mention
        query = text.split("</at>")[-1].strip() if "</at>" in text else text
        
        if query:
            conversation_id = activity.get("conversation", {}).get("id")
            service_url = activity.get("serviceUrl", "")
            await _handle_teams_query(query, conversation_id, service_url, activity, db)
    
    return {"ok": True}


async def _handle_teams_query(
    query: str,
    conversation_id: str,
    service_url: str,
    activity: dict,
    db: AsyncSession,
):
    """Search stept and post results back to Teams."""
    import httpx
    
    # Find config
    result = await db.execute(select(AppSettings))
    settings = result.scalars().all()
    
    webhook_url = None
    project_id = None
    for s in settings:
        if s.key.startswith("teams_config_") and isinstance(s.value, dict):
            config = s.value
            if config.get("enabled") and config.get("webhook_url"):
                webhook_url = config["webhook_url"]
                project_id = s.key.replace("teams_config_", "")
                break
    
    if not webhook_url:
        logger.warning("No Teams config found")
        return
    
    # Search
    from app.routers.search import _search_unified_v2
    try:
        results = await _search_unified_v2(query=query, project_id=project_id, limit=3, db=db)
    except Exception as e:
        logger.error("Teams search failed: %s", e)
        results = []
    
    # Format as Adaptive Card
    body_items = []
    if results:
        body_items.append({
            "type": "TextBlock",
            "text": f"📚 Found {len(results)} results for **{query}**:",
            "wrap": True,
        })
        for r in results[:3]:
            name = r.get("name") or r.get("title") or "Untitled"
            rtype = r.get("type", "workflow")
            snippet = r.get("snippet", "")[:100]
            icon = "📋" if rtype == "workflow" else "📄"
            body_items.append({
                "type": "TextBlock",
                "text": f"{icon} **{name}**\n{snippet}",
                "wrap": True,
            })
    else:
        body_items.append({
            "type": "TextBlock",
            "text": f"🔍 No results found for **{query}**.",
            "wrap": True,
        })
    
    card = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": body_items,
            }
        }]
    }
    
    # Post back via webhook
    try:
        async with httpx.AsyncClient() as client:
            await client.post(webhook_url, json=card)
    except Exception as e:
        logger.error("Failed to post to Teams: %s", e)
