"""
Microsoft Teams integration — enterprise-grade bot that surfaces stept workflows in Teams.

Features:
- Bot Framework authentication with JWT verification and shared secret fallback
- Rich Adaptive Cards with interactive buttons and proper formatting
- Thread support for channel messages and 1:1 DM handling
- Multi-project support with channel mapping
- Encrypted config storage and proper outbound authentication
- Test endpoint for connection validation
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Optional, Dict, Any, List
import asyncio
from urllib.parse import urlparse, urlencode
import jwt
from cryptography.hazmat.primitives import serialization

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
from app.routers.integrations.slack import search_unified

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/teams")


# ── Config models ──

class TeamsConfig(BaseModel):
    app_id: Optional[str] = None
    app_password: Optional[str] = None
    webhook_url: Optional[str] = None  # Fallback for simple setups
    default_project_id: Optional[str] = None
    channel_project_map: Optional[Dict[str, str]] = None  # conversation_id -> project_id
    enabled: bool = True


class TeamsConfigOut(BaseModel):
    enabled: bool
    default_project_id: Optional[str] = None
    channel_project_map: Optional[Dict[str, str]] = None
    connected: bool = False


class TeamsTestRequest(BaseModel):
    conversation_id: str


# ── Bot Framework authentication ──

async def verify_teams_jwt(token: str) -> Optional[Dict[str, Any]]:
    """Verify JWT token from Microsoft Bot Framework."""
    try:
        # Get OpenID configuration
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Microsoft Bot Framework OpenID metadata
            response = await client.get(
                "https://login.botframework.com/v1/.well-known/openidconfiguration"
            )
            if response.status_code != 200:
                logger.warning("Failed to fetch Bot Framework OpenID config")
                return None
                
            openid_config = response.json()
            jwks_uri = openid_config.get("jwks_uri")
            
            if not jwks_uri:
                logger.warning("No jwks_uri in OpenID config")
                return None
            
            # Get JWKS (JSON Web Key Set)
            jwks_response = await client.get(jwks_uri)
            if jwks_response.status_code != 200:
                logger.warning("Failed to fetch JWKS")
                return None
                
            jwks = jwks_response.json()
            
        # Decode JWT header to get kid (key ID)
        try:
            header = jwt.get_unverified_header(token)
            kid = header.get("kid")
            if not kid:
                logger.warning("No kid in JWT header")
                return None
        except Exception as e:
            logger.warning("Failed to decode JWT header: %s", e)
            return None
        
        # Find matching key in JWKS
        key_data = None
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                key_data = key
                break
        
        if not key_data:
            logger.warning("Key not found in JWKS for kid: %s", kid)
            return None
        
        # Construct public key from JWK
        try:
            if key_data.get("kty") == "RSA":
                # Convert JWK to PEM format
                n = base64.urlsafe_b64decode(key_data["n"] + "==")
                e = base64.urlsafe_b64decode(key_data["e"] + "==")
                
                from cryptography.hazmat.primitives.asymmetric import rsa
                from cryptography.hazmat.primitives import serialization
                
                numbers = rsa.RSAPublicNumbers(
                    int.from_bytes(e, 'big'),
                    int.from_bytes(n, 'big')
                )
                public_key = numbers.public_key()
                pem = public_key.public_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PublicFormat.SubjectPublicKeyInfo
                )
            else:
                logger.warning("Unsupported key type: %s", key_data.get("kty"))
                return None
        except Exception as e:
            logger.warning("Failed to construct public key: %s", e)
            return None
        
        # Verify JWT
        try:
            payload = jwt.decode(
                token,
                pem,
                algorithms=["RS256"],
                options={"verify_aud": False}  # Bot Framework doesn't always include audience
            )
            
            # Basic validation
            now = time.time()
            if payload.get("exp", 0) < now:
                logger.warning("JWT token expired")
                return None
            
            if payload.get("nbf", 0) > now + 300:  # Allow 5min clock skew
                logger.warning("JWT token not yet valid")
                return None
                
            # Verify issuer is Microsoft
            issuer = payload.get("iss", "")
            if not issuer.startswith("https://api.botframework.com") and not issuer.startswith("https://sts.windows.net/"):
                logger.warning("Invalid JWT issuer: %s", issuer)
                return None
            
            return payload
            
        except jwt.InvalidTokenError as e:
            logger.warning("JWT validation failed: %s", e)
            return None
            
    except Exception as e:
        logger.error("JWT verification error: %s", e)
        return None


def verify_teams_signature(
    shared_secret: str,
    timestamp: str, 
    body: bytes,
    signature: str,
) -> bool:
    """Verify Teams request signature using shared secret (fallback method)."""
    try:
        request_time = int(timestamp)
        current_time = int(time.time())
        if abs(current_time - request_time) > 300:  # 5 minutes
            logger.warning("Teams request timestamp too old: %s", timestamp)
            return False
    except (ValueError, TypeError):
        logger.warning("Invalid Teams timestamp: %s", timestamp)
        return False

    # Build signature basestring and compute HMAC
    basestring = f"{timestamp}:{body.decode('utf-8', errors='ignore')}"
    computed_signature = base64.b64encode(
        hmac.new(
            shared_secret.encode('utf-8'),
            basestring.encode('utf-8'),
            hashlib.sha256
        ).digest()
    ).decode('utf-8')

    return hmac.compare_digest(computed_signature, signature)


async def get_teams_config(project_id: str, db: AsyncSession) -> Optional[Dict[str, Any]]:
    """Get decrypted Teams config for a project."""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == f"teams_config_{project_id}")
    )
    setting = result.scalar_one_or_none()
    if not setting or not setting.value.get("enabled"):
        return None
    
    config = setting.value.copy()
    
    # Decrypt secrets
    if config.get("app_id"):
        config["app_id"] = decrypt(config["app_id"])
    if config.get("app_password"):
        config["app_password"] = decrypt(config["app_password"])
    if config.get("webhook_url"):
        config["webhook_url"] = decrypt(config["webhook_url"])
    
    return config


async def find_project_for_conversation(conversation_id: str, db: AsyncSession) -> Optional[tuple[str, Dict[str, Any]]]:
    """Find which project this Teams conversation belongs to."""
    # Get all Teams configs
    result = await db.execute(
        select(AppSettings).where(AppSettings.key.like("teams_config_%"))
    )
    settings = result.scalars().all()
    
    for setting in settings:
        if not setting.value.get("enabled"):
            continue
        
        project_id = setting.key.replace("teams_config_", "")
        config = await get_teams_config(project_id, db)
        if not config:
            continue
        
        # Check conversation mapping first, then default
        conversation_map = config.get("channel_project_map", {})
        if conversation_id in conversation_map:
            mapped_project = conversation_map[conversation_id]
            mapped_config = await get_teams_config(mapped_project, db)
            if mapped_config:
                return mapped_project, mapped_config
        
        # Use default project if no specific mapping
        if config.get("default_project_id") == project_id:
            return project_id, config
        
        # Fallback: first enabled config
        if not config.get("default_project_id"):
            return project_id, config
    
    return None


# ── Bot Framework authentication helpers ──

async def get_bot_framework_token(app_id: str, app_password: str) -> Optional[str]:
    """Get access token for Bot Framework outbound requests."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": app_id,
                    "client_secret": app_password,
                    "scope": "https://api.botframework.com/.default"
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("access_token")
            else:
                logger.error("Failed to get Bot Framework token: %d", response.status_code)
                return None
                
    except Exception as e:
        logger.error("Bot Framework auth error: %s", e)
        return None


# ── Adaptive Cards helpers ──

def format_teams_search_results(query: str, results: List[Dict[str, Any]], project_id: str) -> Dict[str, Any]:
    """Format search results as Teams Adaptive Card."""
    if not results:
        return {
            "type": "AdaptiveCard",
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "version": "1.4",
            "body": [
                {
                    "type": "TextBlock",
                    "text": f"🔍 No results found for **{query}**",
                    "size": "Medium",
                    "weight": "Bolder",
                    "wrap": True
                },
                {
                    "type": "TextBlock",
                    "text": "Try different keywords, check spelling, or search for general concepts.",
                    "wrap": True,
                    "spacing": "Small"
                },
                {
                    "type": "Container",
                    "style": "accent",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "💡 **Tips:** Use key terms, acronyms, or action words (e.g., 'deploy', 'login', 'backup')",
                            "wrap": True,
                            "size": "Small"
                        }
                    ]
                }
            ]
        }
    
    # Header with result count
    body_items = [
        {
            "type": "TextBlock",
            "text": f"📚 Found {len(results)} result{'s' if len(results) != 1 else ''} for **{query}**:",
            "size": "Medium", 
            "weight": "Bolder",
            "wrap": True
        }
    ]
    
    # Results (limit to top 3)
    for result in results[:3]:
        result_type = result.get("type", "workflow")
        name = result.get("name") or "Untitled"
        summary = result.get("summary") or result.get("snippet", "")
        result_id = result.get("id", "")
        
        # Type badge and emoji
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
        
        # Build result container
        result_items = [
            {
                "type": "TextBlock",
                "text": f"{emoji} **{name}**",
                "weight": "Bolder",
                "wrap": True
            },
            {
                "type": "TextBlock", 
                "text": f"*{type_badge}{step_info}*",
                "size": "Small",
                "color": "Accent",
                "spacing": "None",
                "wrap": True
            }
        ]
        
        if summary:
            result_items.append({
                "type": "TextBlock",
                "text": summary,
                "wrap": True,
                "spacing": "Small"
            })
        
        # Action buttons
        actions = [
            {
                "type": "Action.OpenUrl",
                "title": "Open in stept",
                "url": f"{settings.FRONTEND_URL}{url_path}"
            },
            {
                "type": "Action.Submit",
                "title": "Share to channel",
                "data": {
                    "action": "share_to_channel",
                    "result": result,
                    "project_id": project_id,
                    "query": query
                }
            }
        ]
        
        # Result container
        result_container = {
            "type": "Container",
            "style": "emphasis",
            "items": result_items,
            "actions": actions,
            "spacing": "Medium",
            "separator": True if len(body_items) > 1 else False
        }
        
        body_items.append(result_container)
    
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": body_items
    }


def format_teams_shared_result(result: Dict[str, Any], project_id: str, query: str) -> Dict[str, Any]:
    """Format a single result for sharing to Teams conversation (public view)."""
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
    
    # Truncate summary
    if summary and len(summary) > 120:
        summary = summary[:117] + "..."
    
    body_items = [
        {
            "type": "TextBlock",
            "text": f"{emoji} **{name}**",
            "weight": "Bolder",
            "wrap": True
        },
        {
            "type": "TextBlock",
            "text": f"*{type_badge}{step_info}*",
            "size": "Small",
            "color": "Accent",
            "spacing": "None",
            "wrap": True
        }
    ]
    
    if summary:
        body_items.append({
            "type": "TextBlock",
            "text": summary,
            "wrap": True,
            "spacing": "Small"
        })
    
    # Footer with attribution
    body_items.append({
        "type": "TextBlock",
        "text": f"📝 Found via: *{query}* | Shared from stept",
        "size": "Small",
        "color": "Accent",
        "spacing": "Medium",
        "wrap": True
    })
    
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": body_items,
        "actions": [
            {
                "type": "Action.OpenUrl",
                "title": "Open in stept",
                "url": f"{settings.FRONTEND_URL}{url_path}"
            }
        ]
    }


# ── Background search task ──

async def handle_teams_search_task(
    query: str,
    conversation_id: str,
    service_url: str, 
    activity_id: Optional[str],
    from_id: str,
    project_id: str,
    config: Dict[str, Any],
    is_dm: bool = False
):
    """Background task to perform search and post results to Teams."""
    try:
        async with AsyncSession(bind=next(get_db()).bind) as db:
            results = await search_unified(query, project_id, from_id, 5, db)
            card = format_teams_search_results(query, results, project_id)
            
            # Prepare response activity
            response_activity = {
                "type": "message",
                "attachments": [
                    {
                        "contentType": "application/vnd.microsoft.card.adaptive",
                        "content": card
                    }
                ]
            }
            
            # Send response based on configuration mode
            if config.get("app_id") and config.get("app_password"):
                # Bot Framework mode - proper threaded reply
                await send_bot_framework_message(
                    config["app_id"],
                    config["app_password"], 
                    service_url,
                    conversation_id,
                    activity_id,
                    response_activity
                )
            elif config.get("webhook_url"):
                # Simple webhook mode
                await send_webhook_message(config["webhook_url"], response_activity)
            else:
                logger.error("No valid Teams config found for sending message")
                
    except Exception as e:
        logger.error("Teams search task failed: %s", e)


async def send_bot_framework_message(
    app_id: str,
    app_password: str,
    service_url: str,
    conversation_id: str,
    reply_to_id: Optional[str],
    activity: Dict[str, Any]
):
    """Send message via Bot Framework REST API."""
    try:
        # Get access token
        token = await get_bot_framework_token(app_id, app_password)
        if not token:
            logger.error("Failed to get Bot Framework token")
            return
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        # Choose endpoint based on whether we're replying to a specific message
        if reply_to_id:
            # Reply to specific activity (threaded)
            url = f"{service_url}/v3/conversations/{conversation_id}/activities/{reply_to_id}"
            activity["replyToId"] = reply_to_id
        else:
            # New message in conversation
            url = f"{service_url}/v3/conversations/{conversation_id}/activities"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=activity)
            
            if response.status_code in [200, 201]:
                logger.info("Teams message sent successfully")
            else:
                logger.error("Teams message failed: %d - %s", response.status_code, response.text)
                
    except Exception as e:
        logger.error("Failed to send Bot Framework message: %s", e)


async def send_webhook_message(webhook_url: str, activity: Dict[str, Any]):
    """Send message via simple webhook (fallback mode)."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(webhook_url, json=activity)
            
            if response.status_code in [200, 201]:
                logger.info("Teams webhook message sent successfully")
            else:
                logger.error("Teams webhook failed: %d - %s", response.status_code, response.text)
                
    except Exception as e:
        logger.error("Failed to send webhook message: %s", e)


# ── Config endpoints ──

@router.get("/config")
async def get_teams_config_endpoint(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamsConfigOut:
    """Get Teams integration config for a project."""
    config = await get_teams_config(project_id, db)
    if not config:
        return TeamsConfigOut(enabled=False, connected=False)
    
    return TeamsConfigOut(
        enabled=config.get("enabled", False),
        default_project_id=config.get("default_project_id"),
        channel_project_map=config.get("channel_project_map", {}),
        connected=bool(config.get("app_id") or config.get("webhook_url")),
    )


@router.put("/config")
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
    
    # Encrypt secrets before storing
    if config_dict.get("app_id"):
        config_dict["app_id"] = encrypt(config_dict["app_id"])
    if config_dict.get("app_password"):
        config_dict["app_password"] = encrypt(config_dict["app_password"])
    if config_dict.get("webhook_url"):
        config_dict["webhook_url"] = encrypt(config_dict["webhook_url"])
    
    if setting:
        setting.value = config_dict
    else:
        setting = AppSettings(key=key, value=config_dict)
        db.add(setting)
    
    await db.commit()
    return {"status": "ok"}


@router.delete("/config")
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


@router.post("/test")
async def test_teams_connection(
    project_id: str,
    test_req: TeamsTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test Teams connection by sending a test card."""
    config = await get_teams_config(project_id, db)
    if not config or not (config.get("app_id") or config.get("webhook_url")):
        raise HTTPException(status_code=400, detail="Teams not configured")
    
    # Build test card
    test_card = {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json", 
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": "🤖 **Test message from stept!**",
                "size": "Medium",
                "weight": "Bolder",
                "wrap": True
            },
            {
                "type": "TextBlock",
                "text": "The integration is working correctly. You can now:",
                "wrap": True,
                "spacing": "Medium"
            },
            {
                "type": "Container",
                "items": [
                    {
                        "type": "TextBlock",
                        "text": "• @mention the bot to search workflows and documents",
                        "wrap": True
                    },
                    {
                        "type": "TextBlock", 
                        "text": "• Send direct messages to search privately",
                        "wrap": True
                    },
                    {
                        "type": "TextBlock",
                        "text": "• Use interactive buttons to share results",
                        "wrap": True
                    }
                ]
            }
        ]
    }
    
    activity = {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": test_card
            }
        ]
    }
    
    try:
        if config.get("app_id") and config.get("app_password"):
            # Bot Framework mode - need service URL for test
            # This is a limitation - we need the actual conversation context
            return {
                "status": "partial_success", 
                "message": "Configuration looks valid, but full testing requires an active conversation. @mention the bot in Teams to verify."
            }
            
        elif config.get("webhook_url"):
            # Webhook mode
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(config["webhook_url"], json=activity)
                
                if response.status_code in [200, 201]:
                    return {"status": "success", "message": "Test card sent successfully"}
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Webhook failed: {response.status_code}"
                    )
        else:
            raise HTTPException(status_code=400, detail="No valid configuration found")
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="Request to Teams timed out")
    except Exception as e:
        logger.error("Teams test failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")


# ── Teams webhook endpoint ──

@router.post("/webhook")
async def teams_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle incoming Teams Bot Framework activities.
    Supports both JWT authentication and shared secret fallback.
    """
    body = await request.body()
    
    # Parse the activity
    try:
        activity = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")
    
    # Extract basic info for finding config
    conversation = activity.get("conversation", {})
    conversation_id = conversation.get("id", "")
    service_url = activity.get("serviceUrl", "")
    
    # Find project config
    project_config = await find_project_for_conversation(conversation_id, db)
    if not project_config:
        logger.warning("No Teams config found for conversation %s", conversation_id)
        return {"status": "ok"}  # Acknowledge but ignore
    
    project_id, config = project_config
    
    # Authentication - try JWT first, fall back to shared secret
    auth_header = request.headers.get("authorization", "")
    timestamp = request.headers.get("x-teams-timestamp", str(int(time.time())))
    signature = request.headers.get("x-teams-signature", "")
    
    authenticated = False
    
    # Try JWT authentication (proper Bot Framework)
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        jwt_payload = await verify_teams_jwt(token)
        if jwt_payload:
            # Verify service URL is in allowlist (basic security)
            service_domain = urlparse(service_url).netloc
            allowed_domains = ["smba.trafficmanager.net", "teams.microsoft.com", "dev.teams.microsoft.com"]
            if any(domain in service_domain for domain in allowed_domains):
                authenticated = True
            else:
                logger.warning("Service URL not in allowlist: %s", service_url)
    
    # Fall back to shared secret (if configured)
    if not authenticated and config.get("app_password"):
        if verify_teams_signature(config["app_password"], timestamp, body, signature):
            authenticated = True
    
    # For development/webhook mode, allow unauthenticated requests
    if not authenticated and config.get("webhook_url") and not config.get("app_id"):
        authenticated = True  # Webhook mode doesn't have authentication
    
    if not authenticated:
        raise HTTPException(status_code=401, detail="Authentication failed")
    
    # Process activity
    activity_type = activity.get("type", "")
    
    if activity_type == "conversationUpdate":
        # Bot was added to team/conversation
        await handle_conversation_update(activity, project_id, config, background_tasks, db)
        
    elif activity_type == "message":
        # Handle messages (mentions, DMs)
        await handle_message_activity(activity, project_id, config, background_tasks, db)
    
    return {"status": "ok"}


# ── Event handlers ──

async def handle_conversation_update(
    activity: Dict[str, Any],
    project_id: str,
    config: Dict[str, Any],
    background_tasks: BackgroundTasks,
    db: AsyncSession
):
    """Handle conversationUpdate activities (bot added to team)."""
    members_added = activity.get("membersAdded", [])
    bot_id = activity.get("recipient", {}).get("id", "")
    
    # Check if our bot was added
    for member in members_added:
        if member.get("id") == bot_id:
            # Send welcome message
            welcome_card = {
                "type": "AdaptiveCard",
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "version": "1.4",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": "👋 **Welcome to stept!**",
                        "size": "Medium",
                        "weight": "Bolder",
                        "wrap": True
                    },
                    {
                        "type": "TextBlock",
                        "text": "I can help you search workflows and documents. Here's how to use me:",
                        "wrap": True,
                        "spacing": "Medium"
                    },
                    {
                        "type": "Container",
                        "items": [
                            {
                                "type": "TextBlock",
                                "text": "• **@mention me** in channels: `@stept deploy production`",
                                "wrap": True
                            },
                            {
                                "type": "TextBlock",
                                "text": "• **Direct message** me to search privately",
                                "wrap": True
                            },
                            {
                                "type": "TextBlock",
                                "text": "• Use the **interactive buttons** to share results with your team",
                                "wrap": True
                            }
                        ]
                    }
                ]
            }
            
            conversation_id = activity.get("conversation", {}).get("id", "")
            service_url = activity.get("serviceUrl", "")
            
            background_tasks.add_task(
                send_bot_framework_message,
                config.get("app_id", ""),
                config.get("app_password", ""),
                service_url,
                conversation_id,
                None,  # No reply-to for welcome message
                {
                    "type": "message",
                    "attachments": [
                        {
                            "contentType": "application/vnd.microsoft.card.adaptive",
                            "content": welcome_card
                        }
                    ]
                }
            )
            break


async def handle_message_activity(
    activity: Dict[str, Any],
    project_id: str,
    config: Dict[str, Any], 
    background_tasks: BackgroundTasks,
    db: AsyncSession
):
    """Handle message activities (@mentions, DMs, action submits)."""
    activity_id = activity.get("id", "")
    text = activity.get("text", "")
    conversation = activity.get("conversation", {})
    conversation_id = conversation.get("id", "")
    conversation_type = conversation.get("conversationType", "")
    service_url = activity.get("serviceUrl", "")
    from_obj = activity.get("from", {})
    from_id = from_obj.get("id", "")
    
    # Handle action submits (button clicks)
    value = activity.get("value")
    if value and isinstance(value, dict):
        action = value.get("action")
        if action == "share_to_channel":
            await handle_share_to_channel_action(
                value, conversation_id, service_url, activity_id,
                project_id, config, background_tasks
            )
            return
    
    # Handle text messages
    if not text or not text.strip():
        return
    
    # Extract query
    query = text.strip()
    
    # Handle @mentions - extract query after mention
    if "<at>" in text and "</at>" in text:
        # Extract text after the mention tag
        mention_end = text.find("</at>")
        if mention_end != -1:
            query = text[mention_end + 5:].strip()
    
    # Skip empty queries
    if not query:
        # Send help message
        help_card = {
            "type": "AdaptiveCard",
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "version": "1.4",
            "body": [
                {
                    "type": "TextBlock",
                    "text": "👋 **How to search with stept:**",
                    "size": "Medium",
                    "weight": "Bolder",
                    "wrap": True
                },
                {
                    "type": "TextBlock",
                    "text": "Mention me with your question or send me a direct message:",
                    "wrap": True,
                    "spacing": "Medium"
                },
                {
                    "type": "Container",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "`@stept deploy production`",
                            "wrap": True
                        },
                        {
                            "type": "TextBlock",
                            "text": "`@stept user login process`",
                            "wrap": True
                        }
                    ]
                }
            ]
        }
        
        background_tasks.add_task(
            send_bot_framework_message,
            config.get("app_id", ""),
            config.get("app_password", ""),
            service_url,
            conversation_id,
            activity_id,  # Reply in thread
            {
                "type": "message", 
                "attachments": [
                    {
                        "contentType": "application/vnd.microsoft.card.adaptive",
                        "content": help_card
                    }
                ]
            }
        )
        return
    
    # Determine if this is a DM
    is_dm = conversation_type == "personal"
    
    # Schedule search task
    background_tasks.add_task(
        handle_teams_search_task,
        query,
        conversation_id,
        service_url,
        activity_id,
        from_id,
        project_id,
        config,
        is_dm
    )


async def handle_share_to_channel_action(
    action_data: Dict[str, Any],
    conversation_id: str,
    service_url: str,
    reply_to_id: str,
    project_id: str,
    config: Dict[str, Any],
    background_tasks: BackgroundTasks
):
    """Handle 'Share to channel' button clicks."""
    try:
        result = action_data.get("result", {})
        query = action_data.get("query", "")
        
        if not result:
            logger.warning("No result data in share action")
            return
        
        # Format shared result card
        shared_card = format_teams_shared_result(result, project_id, query)
        
        # Send shared result as new message
        background_tasks.add_task(
            send_bot_framework_message,
            config.get("app_id", ""),
            config.get("app_password", ""),
            service_url,
            conversation_id,
            None,  # New message, not a reply
            {
                "type": "message",
                "attachments": [
                    {
                        "contentType": "application/vnd.microsoft.card.adaptive",
                        "content": shared_card
                    }
                ]
            }
        )
        
        # Send confirmation to the original thread
        confirmation_card = {
            "type": "AdaptiveCard",
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "version": "1.4",
            "body": [
                {
                    "type": "TextBlock",
                    "text": "✅ Shared to channel!",
                    "weight": "Bolder",
                    "color": "Good",
                    "wrap": True
                }
            ]
        }
        
        background_tasks.add_task(
            send_bot_framework_message,
            config.get("app_id", ""),
            config.get("app_password", ""),
            service_url,
            conversation_id,
            reply_to_id,
            {
                "type": "message",
                "attachments": [
                    {
                        "contentType": "application/vnd.microsoft.card.adaptive", 
                        "content": confirmation_card
                    }
                ]
            }
        )
        
    except Exception as e:
        logger.error("Share to channel action failed: %s", e)