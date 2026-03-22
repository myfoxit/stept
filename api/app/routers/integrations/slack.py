"""
Slack integration — comprehensive bot that surfaces stept workflows in Slack.

Features:
- Slash commands (/stept <query>) with rich Block Kit responses
- @mentions and DM support with threaded replies
- Interactive buttons ("Share to channel", "Open in stept")
- Proper signature verification and encrypted config storage
- Multi-project support with channel mapping
- Background tasks for 3-second timeout compliance
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from typing import Optional, Dict, Any, List
import asyncio
from urllib.parse import urlparse, urlencode

from fastapi import (
    APIRouter, Depends, HTTPException, Request, Response, BackgroundTasks, status
)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.database import get_session as get_db
from app.models import User, AppSettings, ProcessRecordingSession
from app.security import get_current_user
from app.services.crypto import encrypt, decrypt
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/slack")


# ── Config models ──

class SlackConfig(BaseModel):
    bot_token: str
    signing_secret: str
    default_project_id: Optional[str] = None
    channel_project_map: Optional[Dict[str, str]] = None  # channel_id -> project_id
    enabled: bool = True


class SlackConfigOut(BaseModel):
    enabled: bool
    default_project_id: Optional[str] = None
    channel_project_map: Optional[Dict[str, str]] = None
    connected: bool = False


class SlackTestRequest(BaseModel):
    channel: str


# ── Signature verification ──

def verify_slack_signature(
    signing_secret: str,
    timestamp: str,
    body: bytes,
    signature: str,
) -> bool:
    """Verify Slack request signature using HMAC-SHA256."""
    # Check timestamp (prevent replay attacks)
    try:
        request_time = int(timestamp)
        current_time = int(time.time())
        if abs(current_time - request_time) > 300:  # 5 minutes
            logger.warning("Slack request timestamp too old: %s", timestamp)
            return False
    except (ValueError, TypeError):
        logger.warning("Invalid Slack timestamp: %s", timestamp)
        return False

    # Build signature basestring and compute HMAC
    basestring = f"v0:{timestamp}:{body.decode('utf-8', errors='ignore')}"
    computed_signature = "v0=" + hmac.new(
        signing_secret.encode('utf-8'),
        basestring.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(computed_signature, signature)


async def get_slack_config(project_id: str, db: AsyncSession) -> Optional[Dict[str, Any]]:
    """Get decrypted Slack config for a project."""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == f"slack_config_{project_id}")
    )
    setting = result.scalar_one_or_none()
    if not setting or not setting.value.get("enabled"):
        return None
    
    config = setting.value.copy()
    
    # Decrypt secrets
    if config.get("bot_token"):
        config["bot_token"] = decrypt(config["bot_token"])
    if config.get("signing_secret"):
        config["signing_secret"] = decrypt(config["signing_secret"])
    
    return config


async def find_project_for_channel(channel: str, db: AsyncSession) -> Optional[tuple[str, Dict[str, Any]]]:
    """Find which project this Slack channel belongs to."""
    # Get all Slack configs
    result = await db.execute(
        select(AppSettings).where(AppSettings.key.like("slack_config_%"))
    )
    settings = result.scalars().all()
    
    for setting in settings:
        if not setting.value.get("enabled"):
            continue
        
        project_id = setting.key.replace("slack_config_", "")
        config = await get_slack_config(project_id, db)
        if not config:
            continue
        
        # Check channel mapping first, then default
        channel_map = config.get("channel_project_map", {})
        if channel in channel_map:
            mapped_project = channel_map[channel]
            mapped_config = await get_slack_config(mapped_project, db)
            if mapped_config:
                return mapped_project, mapped_config
        
        # Use default project if no specific mapping
        if config.get("default_project_id") == project_id:
            return project_id, config
        
        # Fallback: first enabled config
        if not config.get("default_project_id"):
            return project_id, config
    
    return None


# ── Search function ──

async def search_unified(
    query: str, project_id: str, user_id: str, limit: int, db: AsyncSession
) -> List[Dict[str, Any]]:
    """Extracted search function using unified-v2 logic."""
    from app.routers.search import (
        _ilike_unified_results,
        _fts_unified_results, 
        _semantic_unified_results,
        _rrf_merge,
        _trigram_fallback,
        _check_context_match,
        _recency_boost,
        _frequency_boost,
        RRF_K
    )
    
    # Get user for search context
    user = await db.get(User, user_id) if user_id else None
    if not user:
        # Try to find project owner as fallback
        from app.models import Project
        project = await db.get(Project, project_id)
        if project:
            user = await db.get(User, project.owner_id)
    
    if not user:
        return []
    
    try:
        # Use the same logic as unified_v2_search but without FastAPI dependencies
        
        # For very short queries (1-2 chars), use ILIKE which handles single chars better
        if len(query.strip()) <= 2:
            fts_results = await _ilike_unified_results(query, project_id, user.id, limit, db)
        else:
            fts_results = await _fts_unified_results(query, project_id, user.id, limit * 2, db)

        # Always try semantic (graceful fallback if no embedding API)
        semantic_results = await _semantic_unified_results(query, project_id, user.id, limit * 2, db)

        # RRF merge
        if semantic_results:
            merged = _rrf_merge(fts_results, semantic_results)
        else:
            # FTS only — assign synthetic RRF scores based on rank
            merged = []
            for rank, item in enumerate(fts_results, start=1):
                item_copy = item.copy()
                item_copy["rrf_score"] = round(1.0 / (RRF_K + rank), 6)
                merged.append(item_copy)

        # Phase 5: Trigram fallback if too few FTS results
        if len(fts_results) < 3 and len(query.strip()) > 2:
            trigram_results = await _trigram_fallback(query, project_id, user.id, limit, db)
            # Merge trigram results into existing with low RRF contribution
            existing_ids = {f"{r['type']}:{r['id']}" for r in merged}
            for tri_item in trigram_results:
                key = f"{tri_item['type']}:{tri_item['id']}"
                if key not in existing_ids:
                    tri_item["rrf_score"] = round(tri_item.get("score", 0) * 0.01, 6)
                    merged.append(tri_item)

        # Phase 3: Apply ranking boosts
        for item in merged:
            boost = 1.0
            session_obj = item.pop("_session", None)

            if item["type"] == "workflow" and session_obj:
                boost *= _recency_boost(session_obj.updated_at)
                boost *= _frequency_boost(getattr(session_obj, "view_count", None))

            item["score"] = round(item["rrf_score"] * boost, 6)

        # Sort by boosted score
        merged.sort(key=lambda r: r["score"], reverse=True)

        # Clean up internal fields
        for item in merged:
            item.pop("rrf_score", None)
            item.pop("_session", None)

        return merged[:limit]
        
    except Exception as e:
        logger.error("Search failed: %s", e)
        return []


# ── Block Kit helpers ──

def format_search_results(query: str, results: List[Dict[str, Any]], project_id: str) -> List[Dict[str, Any]]:
    """Format search results as Slack Block Kit blocks."""
    if not results:
        return [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"🔍 No results found for *{query}*\n\nTry different keywords, check spelling, or search for general concepts."
                }
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": "💡 *Tips:* Use key terms, acronyms, or action words (e.g., 'deploy', 'login', 'backup')"
                    }
                ]
            }
        ]
    
    blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"📚 Found {len(results)} result{'s' if len(results) != 1 else ''} for *{query}*:"
            }
        }
    ]
    
    for result in results[:3]:  # Limit to top 3 results
        result_type = result.get("type", "workflow")
        name = result.get("name") or "Untitled"
        summary = result.get("summary") or result.get("snippet", "")
        result_id = result.get("id", "")
        
        # Type emoji and badge
        if result_type == "workflow":
            emoji = "📋"
            type_badge = "Workflow"
            url_path = f"/projects/{project_id}/workflows/{result_id}"
            
            # Add step count if available
            step_count = len(result.get("matching_steps", []))
            step_info = f" • {step_count} step{'s' if step_count != 1 else ''}" if step_count > 0 else ""
        else:
            emoji = "📄"
            type_badge = "Document"
            url_path = f"/projects/{project_id}/documents/{result_id}"
            step_info = ""
        
        # Truncate summary
        if summary and len(summary) > 120:
            summary = summary[:117] + "..."
        
        # Build text block
        text = f"{emoji} *{name}*\n_{type_badge}{step_info}_"
        if summary:
            text += f"\n{summary}"
        
        # Action buttons
        buttons = [
            {
                "type": "button",
                "text": {"type": "plain_text", "text": "Open in stept"},
                "style": "primary",
                "url": f"{settings.FRONTEND_URL}{url_path}",
                "action_id": f"open_{result_id}"
            },
            {
                "type": "button", 
                "text": {"type": "plain_text", "text": "Share to channel"},
                "action_id": "share_to_channel",
                "value": json.dumps({
                    "result": result,
                    "project_id": project_id,
                    "query": query
                })
            }
        ]
        
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": text},
            "accessory": {
                "type": "overflow",
                "options": [
                    {
                        "text": {"type": "plain_text", "text": "Open in stept"},
                        "value": f"open_{result_id}",
                        "url": f"{settings.FRONTEND_URL}{url_path}"
                    },
                    {
                        "text": {"type": "plain_text", "text": "Share to channel"},
                        "value": json.dumps({
                            "result": result,
                            "project_id": project_id,
                            "query": query
                        })
                    }
                ]
            }
        })
        
        # Separate action row
        blocks.append({
            "type": "actions",
            "elements": buttons
        })
    
    return blocks


def format_shared_result(result: Dict[str, Any], project_id: str, query: str) -> List[Dict[str, Any]]:
    """Format a single result for sharing to channel (public view)."""
    result_type = result.get("type", "workflow")
    name = result.get("name") or "Untitled"
    summary = result.get("summary") or result.get("snippet", "")
    result_id = result.get("id", "")
    
    if result_type == "workflow":
        emoji = "📋"
        type_badge = "Workflow"
        url_path = f"/projects/{project_id}/workflows/{result_id}"
        step_count = len(result.get("matching_steps", []))
        step_info = f" • {step_count} step{'s' if step_count != 1 else ''}" if step_count > 0 else ""
    else:
        emoji = "📄"
        type_badge = "Document"
        url_path = f"/projects/{project_id}/documents/{result_id}"
        step_info = ""
    
    text = f"{emoji} *{name}*\n_{type_badge}{step_info}_"
    if summary and len(summary) > 120:
        summary = summary[:117] + "..."
    if summary:
        text += f"\n{summary}"
    
    return [
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": text},
            "accessory": {
                "type": "button",
                "text": {"type": "plain_text", "text": "Open in stept"},
                "style": "primary",
                "url": f"{settings.FRONTEND_URL}{url_path}",
                "action_id": f"open_{result_id}"
            }
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"📝 Found via: _{query}_ | Shared from stept"
                }
            ]
        }
    ]


# ── Background search task ──

async def handle_search_task(
    query: str, 
    channel: str, 
    user_id: str, 
    thread_ts: Optional[str],
    response_url: Optional[str],
    project_id: str,
    config: Dict[str, Any],
    is_ephemeral: bool = False
):
    """Background task to perform search and post results."""
    try:
        async with AsyncSession(bind=next(get_db()).bind) as db:
            results = await search_unified(query, project_id, user_id, 5, db)
            blocks = format_search_results(query, results, project_id)
            
            # Post to Slack
            headers = {"Authorization": f"Bearer {config['bot_token']}"}
            payload = {
                "channel": channel,
                "blocks": blocks
            }
            
            if thread_ts:
                payload["thread_ts"] = thread_ts
                
            if is_ephemeral and user_id:
                payload["user"] = user_id
                url = "https://slack.com/api/chat.postEphemeral"
            else:
                url = "https://slack.com/api/chat.postMessage"
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code == 200:
                    result = response.json()
                    if not result.get("ok"):
                        logger.error("Slack API error: %s", result.get("error"))
                else:
                    logger.error("Slack request failed: %d", response.status_code)
                    
    except Exception as e:
        logger.error("Background search task failed: %s", e)


# ── Config endpoints ──

@router.get("/config")
async def get_slack_config_endpoint(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SlackConfigOut:
    """Get Slack integration config for a project."""
    config = await get_slack_config(project_id, db)
    if not config:
        return SlackConfigOut(enabled=False, connected=False)
    
    return SlackConfigOut(
        enabled=config.get("enabled", False),
        default_project_id=config.get("default_project_id"),
        channel_project_map=config.get("channel_project_map", {}),
        connected=bool(config.get("bot_token")),
    )


@router.put("/config")
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
    
    # Encrypt secrets before storing
    if config_dict["bot_token"]:
        config_dict["bot_token"] = encrypt(config_dict["bot_token"])
    if config_dict["signing_secret"]:
        config_dict["signing_secret"] = encrypt(config_dict["signing_secret"])
    
    if setting:
        setting.value = config_dict
    else:
        setting = AppSettings(key=key, value=config_dict)
        db.add(setting)
    
    await db.commit()
    return {"status": "ok"}


@router.delete("/config")
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


@router.post("/test")
async def test_slack_connection(
    project_id: str,
    test_req: SlackTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test Slack connection by sending a test message."""
    config = await get_slack_config(project_id, db)
    if not config or not config.get("bot_token"):
        raise HTTPException(status_code=400, detail="Slack not configured")
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {config['bot_token']}"},
                json={
                    "channel": test_req.channel,
                    "text": f"🤖 Test message from stept! The integration is working correctly.",
                    "blocks": [
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": "🤖 *Test message from stept!*\n\nThe integration is working correctly. You can now:\n• Use `/stept <query>` to search\n• @mention the bot in channels\n• Send DMs to search privately"
                            }
                        }
                    ]
                },
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("ok"):
                    return {"status": "success", "message": "Test message sent successfully"}
                else:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Slack API error: {result.get('error', 'Unknown error')}"
                    )
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Failed to send test message"
                )
                
    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="Request to Slack timed out")
    except Exception as e:
        logger.error("Slack test failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")


# ── Slack webhook endpoints ──

@router.post("/webhook")
async def slack_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle incoming Slack events (@mentions, DMs, etc.).
    Verifies signature and processes events asynchronously.
    """
    body = await request.body()
    
    # Get headers
    timestamp = request.headers.get("x-slack-request-timestamp", "")
    signature = request.headers.get("x-slack-signature", "")
    
    # Parse the event
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")
    
    # Handle Slack URL verification challenge
    if payload.get("type") == "url_verification":
        return {"challenge": payload.get("challenge")}
    
    # Find project config for signature verification
    channel = payload.get("event", {}).get("channel", "")
    project_config = await find_project_for_channel(channel, db)
    if not project_config:
        logger.warning("No Slack config found for channel %s", channel)
        return {"ok": True}  # Acknowledge but ignore
    
    project_id, config = project_config
    
    # Verify signature
    if not verify_slack_signature(
        config["signing_secret"], timestamp, body, signature
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    # Process events
    event = payload.get("event", {})
    event_type = event.get("type")
    
    if event_type == "app_mention":
        # Bot was mentioned in a channel
        await handle_mention_event(event, project_id, config, background_tasks, db)
    
    elif event_type == "message":
        # Direct message or message in channel
        if event.get("channel_type") == "im":
            # Direct message - treat as search
            await handle_dm_event(event, project_id, config, background_tasks, db)
    
    return {"ok": True}


@router.post("/slash")
async def slack_slash_command(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle /stept <query> slash commands.
    Returns immediate ephemeral response, then searches in background.
    """
    body = await request.body()
    
    # Parse form data
    try:
        form_data = {}
        for pair in body.decode('utf-8').split('&'):
            if '=' in pair:
                key, value = pair.split('=', 1)
                form_data[key] = value.replace('+', ' ')
    except Exception:
        raise HTTPException(400, "Invalid form data")
    
    # Get parameters
    channel_id = form_data.get("channel_id", "")
    user_id = form_data.get("user_id", "")
    text = form_data.get("text", "").strip()
    response_url = form_data.get("response_url", "")
    trigger_id = form_data.get("trigger_id", "")
    
    # Find project for this channel
    project_config = await find_project_for_channel(channel_id, db)
    if not project_config:
        return {
            "response_type": "ephemeral",
            "text": "❌ Slack integration not configured for this channel. Ask an admin to set it up."
        }
    
    project_id, config = project_config
    
    # Verify signature (form data requires different handling)
    timestamp = request.headers.get("x-slack-request-timestamp", "")
    signature = request.headers.get("x-slack-signature", "")
    
    if not verify_slack_signature(
        config["signing_secret"], timestamp, body, signature
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    if not text:
        return {
            "response_type": "ephemeral",
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "👋 *How to use /stept:*\n\nType `/stept <your search query>` to find workflows and documents.\n\n*Examples:*\n• `/stept deploy production`\n• `/stept user login`\n• `/stept backup database`"
                    }
                }
            ]
        }
    
    # Schedule background search
    background_tasks.add_task(
        handle_search_task,
        text, channel_id, user_id, None, response_url,
        project_id, config, is_ephemeral=True
    )
    
    # Return immediate response
    return {
        "response_type": "ephemeral",
        "text": f"🔍 Searching for *{text}*..."
    }


@router.post("/interactive")
async def slack_interactive(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle interactive button clicks (Share to channel, etc.).
    """
    body = await request.body()
    
    # Parse form data 
    try:
        form_data = {}
        for pair in body.decode('utf-8').split('&'):
            if '=' in pair:
                key, value = pair.split('=', 1)
                form_data[key] = value.replace('+', ' ')
        
        # Parse the payload JSON
        payload_str = form_data.get("payload", "{}")
        payload = json.loads(payload_str)
    except Exception:
        raise HTTPException(400, "Invalid interaction data")
    
    # Get action details
    channel_id = payload.get("channel", {}).get("id", "")
    user_id = payload.get("user", {}).get("id", "")
    response_url = payload.get("response_url", "")
    
    actions = payload.get("actions", [])
    if not actions:
        return {"ok": True}
    
    action = actions[0]
    action_id = action.get("action_id", "")
    
    # Find project config
    project_config = await find_project_for_channel(channel_id, db)
    if not project_config:
        return {"text": "❌ Slack integration not configured"}
    
    project_id, config = project_config
    
    # Verify signature  
    timestamp = request.headers.get("x-slack-request-timestamp", "")
    signature = request.headers.get("x-slack-signature", "")
    
    if not verify_slack_signature(
        config["signing_secret"], timestamp, body, signature
    ):
        return {"text": "❌ Invalid signature"}
    
    # Handle "Share to channel" action
    if action_id == "share_to_channel":
        try:
            action_data = json.loads(action.get("value", "{}"))
            result = action_data.get("result", {})
            query = action_data.get("query", "")
            
            # Post shared result to channel
            blocks = format_shared_result(result, project_id, query)
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://slack.com/api/chat.postMessage",
                    headers={"Authorization": f"Bearer {config['bot_token']}"},
                    json={
                        "channel": channel_id,
                        "blocks": blocks,
                        "text": f"Shared: {result.get('name', 'Untitled')}"
                    }
                )
                
                if response.status_code == 200 and response.json().get("ok"):
                    return {
                        "response_type": "ephemeral",
                        "replace_original": False,
                        "text": "✅ Shared to channel!"
                    }
                else:
                    return {
                        "response_type": "ephemeral", 
                        "text": "❌ Failed to share to channel"
                    }
        except Exception as e:
            logger.error("Share to channel failed: %s", e)
            return {
                "response_type": "ephemeral",
                "text": "❌ Failed to share to channel"
            }
    
    return {"ok": True}


# ── Event handlers ──

async def handle_mention_event(
    event: Dict[str, Any], 
    project_id: str,
    config: Dict[str, Any], 
    background_tasks: BackgroundTasks,
    db: AsyncSession
):
    """Handle @mention events in channels."""
    text = event.get("text", "")
    channel = event.get("channel", "")
    user = event.get("user", "")
    ts = event.get("ts", "")
    
    # Extract query by removing mention
    query = text.split(">", 1)[-1].strip() if ">" in text else text.strip()
    
    if not query:
        # Send help message
        help_blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "👋 *How to search with stept:*\n\nMention me with your question:\n`@stept deploy production`\n`@stept user login process`\n\nOr use the `/stept` slash command for private results."
                }
            }
        ]
        
        background_tasks.add_task(
            post_slack_message,
            config["bot_token"], channel, help_blocks, ts
        )
        return
    
    # Search and reply in thread
    background_tasks.add_task(
        handle_search_task,
        query, channel, user, ts, None, project_id, config, is_ephemeral=False
    )


async def handle_dm_event(
    event: Dict[str, Any],
    project_id: str, 
    config: Dict[str, Any],
    background_tasks: BackgroundTasks,
    db: AsyncSession
):
    """Handle direct message events."""
    text = event.get("text", "").strip()
    channel = event.get("channel", "")
    user = event.get("user", "")
    
    # Ignore bot messages and empty messages
    if event.get("bot_id") or not text:
        return
    
    # Treat DM as search query
    background_tasks.add_task(
        handle_search_task,
        text, channel, user, None, None, project_id, config, is_ephemeral=False
    )


async def post_slack_message(
    bot_token: str,
    channel: str, 
    blocks: List[Dict[str, Any]],
    thread_ts: Optional[str] = None
):
    """Helper to post message to Slack."""
    try:
        payload = {
            "channel": channel,
            "blocks": blocks
        }
        if thread_ts:
            payload["thread_ts"] = thread_ts
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {bot_token}"},
                json=payload
            )
            
            if response.status_code == 200:
                result = response.json()
                if not result.get("ok"):
                    logger.error("Slack post failed: %s", result.get("error"))
            else:
                logger.error("Slack HTTP error: %d", response.status_code)
                
    except Exception as e:
        logger.error("Failed to post to Slack: %s", e)