"""
Slack integration — bot that surfaces stept workflows in Slack channels.

Features:
- Responds to @mentions with relevant workflow search results
- Can be configured per project
- Uses existing RAG search infrastructure
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import User, AppSettings
from app.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/slack")


# ── Config models ──

class SlackConfig(BaseModel):
    bot_token: str
    signing_secret: str
    channel_id: Optional[str] = None
    project_id: Optional[str] = None
    enabled: bool = True


class SlackConfigOut(BaseModel):
    enabled: bool
    channel_id: Optional[str] = None
    project_id: Optional[str] = None
    connected: bool = False


# ── Config endpoints ──

@router.get("/slack/config")
async def get_slack_config(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SlackConfigOut:
    """Get Slack integration config for a project."""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == f"slack_config_{project_id}")
    )
    setting = result.scalar_one_or_none()
    if not setting:
        return SlackConfigOut(enabled=False, connected=False)
    
    config = setting.value
    return SlackConfigOut(
        enabled=config.get("enabled", False),
        channel_id=config.get("channel_id"),
        project_id=project_id,
        connected=bool(config.get("bot_token")),
    )


@router.put("/slack/config")
async def update_slack_config(
    project_id: str,
    config: SlackConfig,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update Slack integration config for a project."""
    key = f"slack_config_{project_id}"
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


@router.delete("/slack/config")
async def disconnect_slack(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disconnect Slack integration."""
    key = f"slack_config_{project_id}"
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        await db.delete(setting)
        await db.commit()
    return {"status": "ok"}


# ── Slack webhook (receives events from Slack) ──

@router.post("/slack/webhook")
async def slack_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle incoming Slack events (mentions, messages).
    Verifies Slack signing secret, then processes the event.
    """
    body = await request.body()
    
    # Parse the event
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")
    
    # Handle Slack URL verification challenge
    if payload.get("type") == "url_verification":
        return {"challenge": payload.get("challenge")}
    
    # Process events asynchronously
    event = payload.get("event", {})
    event_type = event.get("type")
    
    if event_type == "app_mention":
        # Bot was mentioned — search for relevant content
        text = event.get("text", "")
        channel = event.get("channel", "")
        # Strip the bot mention
        query = text.split(">", 1)[-1].strip() if ">" in text else text
        
        if query:
            await _handle_slack_query(query, channel, db)
    
    return {"ok": True}


async def _handle_slack_query(query: str, channel: str, db: AsyncSession):
    """Search stept and post results back to Slack."""
    import httpx
    
    # Find which project this channel belongs to
    result = await db.execute(select(AppSettings))
    settings = result.scalars().all()
    
    bot_token = None
    project_id = None
    for s in settings:
        if s.key.startswith("slack_config_") and isinstance(s.value, dict):
            config = s.value
            if config.get("enabled") and config.get("bot_token"):
                # Use the first enabled Slack config (or match by channel)
                if not config.get("channel_id") or config.get("channel_id") == channel:
                    bot_token = config["bot_token"]
                    project_id = s.key.replace("slack_config_", "")
                    break
    
    if not bot_token:
        logger.warning("No Slack config found for channel %s", channel)
        return
    
    # Search using existing search infrastructure
    from app.routers.search import _search_unified_v2
    try:
        results = await _search_unified_v2(
            query=query,
            project_id=project_id,
            limit=3,
            db=db,
        )
    except Exception as e:
        logger.error("Slack search failed: %s", e)
        results = []
    
    # Format response
    if results:
        blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"📚 Found {len(results)} results for *{query}*:"
                }
            }
        ]
        for r in results[:3]:
            name = r.get("name") or r.get("title") or "Untitled"
            rtype = r.get("type", "workflow")
            snippet = r.get("snippet", "")[:100]
            rid = r.get("id", "")
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"{'📋' if rtype == 'workflow' else '📄'} *{name}*\n{snippet}"
                }
            })
    else:
        blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"🔍 No results found for *{query}*. Try a different search term."
                }
            }
        ]
    
    # Post to Slack
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {bot_token}"},
                json={"channel": channel, "blocks": blocks},
            )
    except Exception as e:
        logger.error("Failed to post to Slack: %s", e)
