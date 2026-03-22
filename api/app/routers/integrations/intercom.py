"""
Intercom integration — comprehensive AI-powered customer support integration.

Features:
1. Content Sync - Push workflows/documents to Intercom's Fin AI (External Pages)
2. Conversation Webhook - Surface relevant workflows in agent conversations
3. Agent Search - Direct search endpoint for Intercom custom apps

Intercom's killer APIs:
- AI Content API: External Pages get indexed by Fin AI for customer answers
- Conversations API: Add internal notes with relevant workflows
- Webhooks: Real-time conversation events for contextual suggestions
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import time
from typing import Optional, Dict, Any, List
import asyncio
from urllib.parse import urlencode
from datetime import datetime, timezone

from fastapi import (
    APIRouter, Depends, HTTPException, Request, Response, BackgroundTasks, status
)
from pydantic import BaseModel, Field
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.database import get_session as get_db
from app.models import User, AppSettings, ProcessRecordingSession, Document, Folder
from app.security import get_current_user
from app.services.crypto import encrypt, decrypt
from app.core.config import settings
from app.routers.integrations.slack import search_unified

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/intercom")


# ── Config models ──

class IntercomConfig(BaseModel):
    access_token: str
    client_secret: str
    project_id: str
    region: str = Field(default="us", description="us | eu | au")
    content_source_id: Optional[str] = None  # Created on first sync
    sync_enabled: bool = True
    webhook_enabled: bool = False
    last_synced_at: Optional[datetime] = None
    sync_stats: Optional[Dict[str, Any]] = None


class IntercomConfigOut(BaseModel):
    enabled: bool = True
    sync_enabled: bool = True
    webhook_enabled: bool = False
    project_id: str
    region: str = "us"
    content_source_id: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    sync_stats: Optional[Dict[str, Any]] = None
    connected: bool = False


class IntercomSyncRequest(BaseModel):
    force: bool = False  # Force full resync even if up-to-date


class IntercomTestRequest(BaseModel):
    test_type: str = "connection"  # "connection" or "content_sync"


# ── Intercom API client ──

class IntercomAPIClient:
    """Async Intercom API client with rate limiting and proper error handling."""
    
    def __init__(self, access_token: str, region: str = "us"):
        self.access_token = access_token
        self.region = region
        self.base_url = self._get_base_url(region)
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Intercom-Version": "2.15",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
    
    def _get_base_url(self, region: str) -> str:
        """Get API base URL for region."""
        if region == "eu":
            return "https://api.eu.intercom.io"
        elif region == "au":
            return "https://api.au.intercom.io"
        else:
            return "https://api.intercom.io"
    
    async def get(self, path: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        """GET request with error handling."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}{path}",
                headers=self.headers,
                params=params or {}
            )
            
            if response.status_code == 401:
                raise HTTPException(401, "Invalid Intercom access token")
            elif response.status_code == 403:
                raise HTTPException(403, "Insufficient Intercom permissions")
            elif response.status_code == 429:
                # Respect rate limits
                retry_after = int(response.headers.get("Retry-After", "60"))
                await asyncio.sleep(min(retry_after, 300))  # Max 5 min wait
                raise HTTPException(429, f"Rate limited, retry after {retry_after}s")
            elif response.status_code >= 400:
                raise HTTPException(response.status_code, f"Intercom API error: {response.text}")
            
            return response.json()
    
    async def post(self, path: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """POST request with error handling."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}{path}",
                headers=self.headers,
                json=data
            )
            
            if response.status_code == 401:
                raise HTTPException(401, "Invalid Intercom access token")
            elif response.status_code == 403:
                raise HTTPException(403, "Insufficient Intercom permissions")
            elif response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", "60"))
                await asyncio.sleep(min(retry_after, 300))
                raise HTTPException(429, f"Rate limited, retry after {retry_after}s")
            elif response.status_code >= 400:
                raise HTTPException(response.status_code, f"Intercom API error: {response.text}")
            
            return response.json()
    
    async def put(self, path: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """PUT request with error handling."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.put(
                f"{self.base_url}{path}",
                headers=self.headers,
                json=data
            )
            
            if response.status_code == 401:
                raise HTTPException(401, "Invalid Intercom access token")
            elif response.status_code == 403:
                raise HTTPException(403, "Insufficient Intercom permissions") 
            elif response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", "60"))
                await asyncio.sleep(min(retry_after, 300))
                raise HTTPException(429, f"Rate limited, retry after {retry_after}s")
            elif response.status_code >= 400:
                raise HTTPException(response.status_code, f"Intercom API error: {response.text}")
            
            return response.json()


# ── Content rendering helpers ──

def render_workflow_html(workflow: Dict[str, Any], steps: List[Dict[str, Any]]) -> str:
    """Convert workflow steps to clean HTML for Intercom External Pages."""
    html_parts = [
        f"<h1>{workflow.get('name', 'Untitled Workflow')}</h1>"
    ]
    
    if workflow.get('summary'):
        html_parts.append(f"<p>{workflow['summary']}</p>")
    
    if steps:
        html_parts.append("<ol>")
        for i, step in enumerate(steps, 1):
            title = step.get('generated_title') or step.get('description') or f"Step {i}"
            description = step.get('generated_description', '')
            
            html_parts.append(f"<li><strong>{title}</strong>")
            if description:
                # Simple text cleanup - remove extra whitespace
                clean_desc = re.sub(r'\s+', ' ', description).strip()
                html_parts.append(f"<p>{clean_desc}</p>")
            html_parts.append("</li>")
        html_parts.append("</ol>")
    
    return "\n".join(html_parts)


def render_document_html(document: Dict[str, Any]) -> str:
    """Convert TipTap JSON document to HTML for Intercom External Pages."""
    html_parts = [
        f"<h1>{document.get('name', 'Untitled Document')}</h1>"
    ]
    
    # Convert TipTap content to HTML
    content = document.get('content')
    if content:
        html_content = tiptap_to_html(content)
        if html_content:
            html_parts.append(html_content)
    
    return "\n".join(html_parts)


def tiptap_to_html(content: Any) -> str:
    """Convert TipTap JSON document to HTML string."""
    if not content or not isinstance(content, dict):
        return ""
    nodes = content.get("content", [])
    return _nodes_to_html(nodes)


def _nodes_to_html(nodes: list[dict], indent: str = "") -> str:
    """Convert TipTap nodes to HTML."""
    parts: list[str] = []
    for node in nodes:
        t = node.get("type", "")
        if t == "heading":
            level = node.get("attrs", {}).get("level", 1)
            text = _inline_to_html(node.get("content", []))
            parts.append(f"<h{level}>{text}</h{level}>")
        elif t == "paragraph":
            text = _inline_to_html(node.get("content", []))
            if text.strip():
                parts.append(f"<p>{text}</p>")
        elif t == "bulletList":
            parts.append("<ul>")
            for item in node.get("content", []):
                item_content = item.get("content", [])
                for ic in item_content:
                    text = _inline_to_html(ic.get("content", []))
                    if text.strip():
                        parts.append(f"<li>{text}</li>")
            parts.append("</ul>")
        elif t == "orderedList":
            parts.append("<ol>")
            for item in node.get("content", []):
                item_content = item.get("content", [])
                for ic in item_content:
                    text = _inline_to_html(ic.get("content", []))
                    if text.strip():
                        parts.append(f"<li>{text}</li>")
            parts.append("</ol>")
        elif t == "codeBlock":
            lang = node.get("attrs", {}).get("language", "")
            code = _inline_to_html(node.get("content", []))
            if lang:
                parts.append(f"<pre><code class='language-{lang}'>{code}</code></pre>")
            else:
                parts.append(f"<pre><code>{code}</code></pre>")
        elif t == "blockquote":
            inner = _nodes_to_html(node.get("content", []))
            if inner.strip():
                parts.append(f"<blockquote>{inner}</blockquote>")
        elif t == "horizontalRule":
            parts.append("<hr>")
        elif t == "image":
            attrs = node.get("attrs", {})
            alt = attrs.get("alt", "")
            src = attrs.get("src", "")
            if src:
                parts.append(f"<img src='{src}' alt='{alt}' />")
        elif t == "table":
            parts.append(_table_to_html(node))
        elif t == "taskList":
            parts.append("<ul>")
            for item in node.get("content", []):
                checked = item.get("attrs", {}).get("checked", False)
                check_html = "☑" if checked else "☐"
                item_content = item.get("content", [])
                for ic in item_content:
                    text = _inline_to_html(ic.get("content", []))
                    if text.strip():
                        parts.append(f"<li>{check_html} {text}</li>")
            parts.append("</ul>")
        else:
            # Fallback: try to extract text
            text = _inline_to_html(node.get("content", []))
            if text.strip():
                parts.append(f"<p>{text}</p>")
    return "\n".join(parts)


def _inline_to_html(nodes: list[dict]) -> str:
    """Convert inline TipTap nodes to HTML."""
    parts: list[str] = []
    for node in (nodes or []):
        t = node.get("type", "")
        if t == "text":
            text = node.get("text", "")
            marks = node.get("marks", [])
            for mark in marks:
                mt = mark.get("type", "")
                if mt == "bold":
                    text = f"<strong>{text}</strong>"
                elif mt == "italic":
                    text = f"<em>{text}</em>"
                elif mt == "code":
                    text = f"<code>{text}</code>"
                elif mt == "strike":
                    text = f"<s>{text}</s>"
                elif mt == "link":
                    href = mark.get("attrs", {}).get("href", "")
                    text = f"<a href='{href}' target='_blank'>{text}</a>"
            parts.append(text)
        elif t == "hardBreak":
            parts.append("<br>")
        elif t == "image":
            attrs = node.get("attrs", {})
            alt = attrs.get("alt", "")
            src = attrs.get("src", "")
            if src:
                parts.append(f"<img src='{src}' alt='{alt}' />")
    return "".join(parts)


def _table_to_html(node: dict) -> str:
    """Convert TipTap table to HTML."""
    rows: list[list[str]] = []
    for row in node.get("content", []):
        cells: list[str] = []
        for cell in row.get("content", []):
            cell_html = _nodes_to_html(cell.get("content", []))
            cells.append(cell_html)
        rows.append(cells)
    
    if not rows:
        return ""
    
    html_parts = ["<table>"]
    
    # First row as header
    if rows:
        html_parts.append("<thead><tr>")
        for cell in rows[0]:
            html_parts.append(f"<th>{cell}</th>")
        html_parts.append("</tr></thead>")
    
    # Remaining rows as body
    if len(rows) > 1:
        html_parts.append("<tbody>")
        for row in rows[1:]:
            html_parts.append("<tr>")
            for cell in row:
                html_parts.append(f"<td>{cell}</td>")
            html_parts.append("</tr>")
        html_parts.append("</tbody>")
    
    html_parts.append("</table>")
    return "\n".join(html_parts)


# ── Configuration helpers ──

async def get_intercom_config(project_id: str, db: AsyncSession) -> Optional[Dict[str, Any]]:
    """Get decrypted Intercom config for a project."""
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == f"intercom_config_{project_id}")
    )
    setting = result.scalar_one_or_none()
    if not setting:
        return None
    
    config = setting.value.copy()
    
    # Decrypt secrets
    if config.get("access_token"):
        config["access_token"] = decrypt(config["access_token"])
    if config.get("client_secret"):
        config["client_secret"] = decrypt(config["client_secret"])
    
    return config


async def save_intercom_config(project_id: str, config: Dict[str, Any], db: AsyncSession):
    """Save encrypted Intercom config for a project."""
    key = f"intercom_config_{project_id}"
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    setting = result.scalar_one_or_none()
    
    config_dict = config.copy()
    
    # Encrypt secrets before storing
    if config_dict.get("access_token"):
        config_dict["access_token"] = encrypt(config_dict["access_token"])
    if config_dict.get("client_secret"):
        config_dict["client_secret"] = encrypt(config_dict["client_secret"])
    
    if setting:
        setting.value = config_dict
    else:
        setting = AppSettings(key=key, value=config_dict)
        db.add(setting)
    
    await db.commit()


# ── Webhook verification ──

def verify_intercom_signature(
    client_secret: str,
    timestamp: str,
    body: bytes,
    signature: str,
) -> bool:
    """Verify Intercom request signature using HMAC-SHA1."""
    # Check timestamp (prevent replay attacks)
    try:
        request_time = int(timestamp)
        current_time = int(time.time())
        if abs(current_time - request_time) > 300:  # 5 minutes
            logger.warning("Intercom request timestamp too old: %s", timestamp)
            return False
    except (ValueError, TypeError):
        logger.warning("Invalid Intercom timestamp: %s", timestamp)
        return False

    # Build signature and compute HMAC-SHA1
    body_str = body.decode('utf-8', errors='ignore')
    computed_signature = hmac.new(
        client_secret.encode('utf-8'),
        body_str.encode('utf-8'),
        hashlib.sha1
    ).hexdigest()

    # Remove 'sha1=' prefix if present
    if signature.startswith('sha1='):
        signature = signature[5:]

    return hmac.compare_digest(computed_signature, signature)


# ── Content sync implementation ──

async def sync_content_to_intercom(
    project_id: str, 
    config: Dict[str, Any], 
    db: AsyncSession,
    force: bool = False
) -> Dict[str, Any]:
    """Sync workflows and documents to Intercom as External Pages."""
    client = IntercomAPIClient(config["access_token"], config["region"])
    
    # Get or create Content Import Source
    source_id = config.get("content_source_id")
    if not source_id:
        source_data = {
            "name": f"Stept - {settings.FRONTEND_URL}",
            "url": settings.FRONTEND_URL,
            "sync_behavior": "api",
            "description": "Process documentation and workflows from Stept"
        }
        source_response = await client.post("/ai/content_import_sources", source_data)
        source_id = source_response["id"]
        
        # Save source_id back to config
        config["content_source_id"] = source_id
        await save_intercom_config(project_id, config, db)
    
    # Get workflows and documents to sync
    workflows_synced = 0
    documents_synced = 0
    errors = []
    
    try:
        # Sync completed workflows
        from sqlalchemy.orm import selectinload
        workflow_result = await db.execute(
            select(ProcessRecordingSession)
            .where(
                and_(
                    ProcessRecordingSession.project_id == project_id,
                    ProcessRecordingSession.status == "completed",
                    ProcessRecordingSession.is_private == False  # noqa: E712
                )
            )
            .options(selectinload(ProcessRecordingSession.steps))
        )
        workflows = workflow_result.scalars().all()
        
        for workflow in workflows:
            try:
                # Check if already synced recently (unless force)
                if not force and config.get("last_synced_at"):
                    last_sync = config["last_synced_at"]
                    if isinstance(last_sync, str):
                        last_sync = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
                    if workflow.updated_at <= last_sync:
                        continue
                
                # Render workflow HTML
                raw_steps = sorted(workflow.steps, key=lambda s: s.step_number) if workflow.steps else []
                steps_dicts = [
                    {
                        'generated_title': s.generated_title,
                        'description': s.description,
                        'generated_description': s.generated_description,
                    }
                    for s in raw_steps
                ]
                workflow_dict = {
                    'name': workflow.name,
                    'summary': workflow.summary
                }
                html_content = render_workflow_html(workflow_dict, steps_dicts)
                
                # Build External Page data
                external_page_data = {
                    "title": workflow.name or "Untitled Workflow",
                    "html": html_content,
                    "url": f"{settings.FRONTEND_URL}/projects/{project_id}/workflows/{workflow.id}",
                    "external_id": f"stept_workflow_{workflow.id}",
                    "source_id": source_id,
                    "ai_agent_availability": True,  # Fin AI can use it
                    "ai_copilot_availability": True  # Show in AI Copilot sidebar
                }
                
                # Create/update External Page
                await client.post("/ai/content/external_pages", external_page_data)
                workflows_synced += 1
                
            except Exception as e:
                logger.error(f"Failed to sync workflow {workflow.id}: {e}")
                errors.append(f"Workflow '{workflow.name}': {str(e)}")
        
        # Sync public documents
        document_result = await db.execute(
            select(Document)
            .where(
                and_(
                    Document.project_id == project_id,
                    Document.is_private == False
                )
            )
        )
        documents = document_result.scalars().all()
        
        for document in documents:
            try:
                # Check if already synced recently (unless force)
                if not force and config.get("last_synced_at"):
                    last_sync = config["last_synced_at"]
                    if isinstance(last_sync, str):
                        last_sync = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
                    if document.updated_at <= last_sync:
                        continue
                
                # Render document HTML
                document_dict = {
                    'name': document.name,
                    'content': document.content
                }
                html_content = render_document_html(document_dict)
                
                # Build External Page data
                external_page_data = {
                    "title": document.name or "Untitled Document",
                    "html": html_content,
                    "url": f"{settings.FRONTEND_URL}/projects/{project_id}/documents/{document.id}",
                    "external_id": f"stept_document_{document.id}",
                    "source_id": source_id,
                    "ai_agent_availability": True,
                    "ai_copilot_availability": True
                }
                
                # Create/update External Page
                await client.post("/ai/content/external_pages", external_page_data)
                documents_synced += 1
                
            except Exception as e:
                logger.error(f"Failed to sync document {document.id}: {e}")
                errors.append(f"Document '{document.name}': {str(e)}")
        
        # Update sync timestamp and stats
        now = datetime.now(timezone.utc)
        config["last_synced_at"] = now.isoformat()
        config["sync_stats"] = {
            "workflows_synced": workflows_synced,
            "documents_synced": documents_synced,
            "errors": errors,
            "last_sync": now.isoformat()
        }
        await save_intercom_config(project_id, config, db)
        
        return {
            "status": "success",
            "workflows_synced": workflows_synced,
            "documents_synced": documents_synced,
            "errors": errors
        }
        
    except Exception as e:
        logger.error(f"Content sync failed: {e}")
        return {
            "status": "error",
            "error": str(e),
            "workflows_synced": workflows_synced,
            "documents_synced": documents_synced
        }


# ── Background sync task ──

async def handle_content_sync_task(project_id: str, force: bool = False):
    """Background task to sync content to Intercom."""
    try:
        async with AsyncSession(bind=next(get_db()).bind) as db:
            config = await get_intercom_config(project_id, db)
            if not config or not config.get("sync_enabled"):
                logger.warning(f"Intercom sync disabled for project {project_id}")
                return
            
            await sync_content_to_intercom(project_id, config, db, force)
            
    except Exception as e:
        logger.error(f"Background content sync failed: {e}")


# ── API endpoints ──

@router.get("/config")
async def get_intercom_config_endpoint(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IntercomConfigOut:
    """Get Intercom integration config for a project."""
    config = await get_intercom_config(project_id, db)
    if not config:
        return IntercomConfigOut(
            enabled=False,
            project_id=project_id,
            connected=False
        )
    
    return IntercomConfigOut(
        enabled=config.get("enabled", True),
        sync_enabled=config.get("sync_enabled", True),
        webhook_enabled=config.get("webhook_enabled", False),
        project_id=config["project_id"],
        region=config.get("region", "us"),
        content_source_id=config.get("content_source_id"),
        last_synced_at=config.get("last_synced_at"),
        sync_stats=config.get("sync_stats"),
        connected=bool(config.get("access_token")),
    )


@router.put("/config")
async def update_intercom_config(
    project_id: str,
    config: IntercomConfig,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update Intercom integration config for a project."""
    config_dict = config.model_dump()
    config_dict["project_id"] = project_id  # Ensure project_id matches
    
    await save_intercom_config(project_id, config_dict, db)
    return {"status": "ok"}


@router.delete("/config")
async def disconnect_intercom(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disconnect Intercom integration."""
    key = f"intercom_config_{project_id}"
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        await db.delete(setting)
        await db.commit()
    return {"status": "ok"}


@router.post("/test")
async def test_intercom_connection(
    project_id: str,
    test_req: IntercomTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test Intercom connection."""
    config = await get_intercom_config(project_id, db)
    if not config or not config.get("access_token"):
        raise HTTPException(status_code=400, detail="Intercom not configured")
    
    try:
        client = IntercomAPIClient(config["access_token"], config.get("region", "us"))
        
        if test_req.test_type == "content_sync":
            # Test content sync capability
            source_data = {
                "name": f"Stept Test - {settings.FRONTEND_URL}",
                "url": settings.FRONTEND_URL,
                "sync_behavior": "api",
                "description": "Test connection from Stept"
            }
            response = await client.post("/ai/content_import_sources", source_data)
            return {
                "status": "success",
                "message": "Content sync test successful",
                "source_id": response.get("id")
            }
        else:
            # Test basic API connection
            response = await client.get("/me")
            return {
                "status": "success",
                "message": f"Connected successfully as {response.get('name', 'Unknown')}",
                "app_name": response.get("name"),
                "app_id": response.get("id")
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Intercom test failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")


@router.post("/sync")
async def trigger_content_sync(
    project_id: str,
    sync_req: IntercomSyncRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger full content sync to Intercom."""
    config = await get_intercom_config(project_id, db)
    if not config or not config.get("sync_enabled"):
        raise HTTPException(status_code=400, detail="Content sync not enabled")
    
    # Schedule background sync
    background_tasks.add_task(handle_content_sync_task, project_id, sync_req.force)
    
    return {"status": "scheduled", "message": "Content sync started in background"}


@router.post("/sync/{resource_type}/{resource_id}")
async def sync_single_resource(
    project_id: str,
    resource_type: str,
    resource_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sync a single workflow or document to Intercom."""
    config = await get_intercom_config(project_id, db)
    if not config or not config.get("sync_enabled"):
        raise HTTPException(status_code=400, detail="Content sync not enabled")
    
    if resource_type not in ["workflow", "document"]:
        raise HTTPException(status_code=400, detail="Invalid resource type")
    
    # For now, we'll trigger a full sync since individual sync would need more complexity
    background_tasks.add_task(handle_content_sync_task, project_id, True)
    
    return {"status": "scheduled", "message": f"Sync for {resource_type} {resource_id} started"}


@router.get("/sync/status")
async def get_sync_status(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get content sync status and stats."""
    config = await get_intercom_config(project_id, db)
    if not config:
        return {"status": "not_configured"}
    
    sync_stats = config.get("sync_stats", {})
    return {
        "status": "configured" if config.get("sync_enabled") else "disabled",
        "last_synced_at": config.get("last_synced_at"),
        "content_source_id": config.get("content_source_id"),
        "stats": sync_stats
    }


@router.get("/search")
async def search_from_intercom(
    q: str,
    conversation_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Search stept content from Intercom Canvas Kit apps.
    Public endpoint for Intercom Messenger integrations.
    """
    if not q or not q.strip():
        return {"results": [], "query": q}
    
    # For now, we'll use the first available project with Intercom enabled
    # In a production setup, you might want conversation_id → project_id mapping
    result = await db.execute(
        select(AppSettings).where(AppSettings.key.like("intercom_config_%"))
    )
    settings_list = result.scalars().all()
    
    project_id = None
    for setting in settings_list:
        if setting.value.get("enabled"):
            project_id = setting.key.replace("intercom_config_", "")
            break
    
    if not project_id:
        return {"results": [], "error": "No Intercom projects configured"}
    
    try:
        # Use the search function from Slack integration
        results = await search_unified(q.strip(), project_id, "", 5, db)
        
        # Format results for Intercom
        formatted_results = []
        for result in results:
            result_type = result.get("type", "workflow")
            
            if result_type == "workflow":
                url_path = f"/projects/{project_id}/workflows/{result['id']}"
            else:
                url_path = f"/projects/{project_id}/documents/{result['id']}"
            
            formatted_results.append({
                "id": result["id"],
                "title": result.get("name") or "Untitled",
                "type": result_type,
                "summary": result.get("summary") or result.get("snippet", ""),
                "url": f"{settings.FRONTEND_URL}{url_path}",
                "score": result.get("score", 0)
            })
        
        return {
            "results": formatted_results,
            "query": q,
            "project_id": project_id
        }
        
    except Exception as e:
        logger.error(f"Intercom search failed: {e}")
        return {"results": [], "error": str(e)}


@router.post("/webhook")
async def intercom_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle incoming Intercom webhook events.
    Processes conversation events to surface relevant workflows.
    """
    body = await request.body()
    
    # Parse the webhook payload
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")
    
    # Get headers for signature verification
    signature = request.headers.get("x-hub-signature", "")
    timestamp = str(int(time.time()))  # Intercom doesn't send timestamp in header
    
    # Find a project with webhook enabled for verification
    result = await db.execute(
        select(AppSettings).where(AppSettings.key.like("intercom_config_%"))
    )
    settings_list = result.scalars().all()
    
    verified = False
    project_id = None
    
    for setting in settings_list:
        config = setting.value
        if not config.get("webhook_enabled"):
            continue
        
        # Try to verify signature with this project's client secret
        if config.get("client_secret"):
            decrypted_secret = decrypt(config["client_secret"])
            if verify_intercom_signature(decrypted_secret, timestamp, body, signature):
                verified = True
                project_id = setting.key.replace("intercom_config_", "")
                break
    
    if not verified:
        logger.warning("Intercom webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    # Process webhook events
    topic = payload.get("topic", "")
    data = payload.get("data", {})
    
    if topic in ["conversation.user.created", "conversation.user.replied"]:
        # Extract conversation details
        conversation_id = data.get("item", {}).get("id", "")
        conversation_parts = data.get("item", {}).get("conversation_parts", {}).get("conversation_parts", [])
        
        if conversation_parts:
            # Get the latest user message
            latest_part = conversation_parts[-1]
            if latest_part.get("part_type") == "comment" and latest_part.get("author", {}).get("type") == "user":
                user_message = latest_part.get("body", "")
                
                if user_message and len(user_message) > 10:  # Only search meaningful messages
                    # Schedule search and response
                    background_tasks.add_task(
                        handle_conversation_search_task,
                        conversation_id,
                        user_message,
                        project_id,
                        db
                    )
    
    return {"ok": True}


async def handle_conversation_search_task(
    conversation_id: str,
    user_message: str,
    project_id: str,
    db: AsyncSession
):
    """Background task to search for relevant content and add note to conversation."""
    try:
        config = await get_intercom_config(project_id, db)
        if not config or not config.get("webhook_enabled"):
            return
        
        # Search for relevant content
        results = await search_unified(user_message, project_id, "", 3, db)
        
        if results:
            # Format results as internal note
            note_parts = ["🔍 **Relevant workflows/documents:**\n"]
            
            for result in results[:3]:  # Top 3 results
                result_type = result.get("type", "workflow")
                name = result.get("name") or "Untitled"
                summary = result.get("summary") or result.get("snippet", "")
                
                if result_type == "workflow":
                    emoji = "📋"
                    url_path = f"/projects/{project_id}/workflows/{result['id']}"
                else:
                    emoji = "📄"
                    url_path = f"/projects/{project_id}/documents/{result['id']}"
                
                note_parts.append(f"{emoji} **{name}**")
                if summary:
                    note_parts.append(f"   _{summary[:100]}..._" if len(summary) > 100 else f"   _{summary}_")
                note_parts.append(f"   🔗 {settings.FRONTEND_URL}{url_path}\n")
            
            note_text = "\n".join(note_parts)
            
            # Send internal note to conversation
            client = IntercomAPIClient(config["access_token"], config.get("region", "us"))
            
            note_data = {
                "message_type": "note",
                "type": "admin",
                "body": note_text
            }
            
            await client.post(f"/conversations/{conversation_id}/reply", note_data)
            logger.info(f"Added note to Intercom conversation {conversation_id}")
            
    except Exception as e:
        logger.error(f"Conversation search task failed: {e}")