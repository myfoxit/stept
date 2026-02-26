"""
Context Links router — CRUD + match endpoint for the Chrome extension.
v2: compound AND/OR rules, regex match types, known-apps endpoint.
"""
from __future__ import annotations

import fnmatch
import re
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import ContextLink, User, ProcessRecordingSession, Document
from app.security import get_current_user

router = APIRouter()


# ── Known Apps ───────────────────────────────────────────────────────────

KNOWN_APPS = [
    {"name": "Visual Studio Code", "aliases": ["VSCode", "Code", "VS Code"], "bundle_id": "com.microsoft.VSCode"},
    {"name": "Google Chrome", "aliases": ["Chrome"], "bundle_id": "com.google.Chrome"},
    {"name": "Microsoft Excel", "aliases": ["Excel"], "bundle_id": "com.microsoft.Excel"},
    {"name": "Microsoft Word", "aliases": ["Word"], "bundle_id": "com.microsoft.Word"},
    {"name": "Figma", "aliases": ["Figma"], "bundle_id": "com.figma.Desktop"},
    {"name": "Slack", "aliases": ["Slack"], "bundle_id": "com.tinyspeck.slackmacgap"},
    {"name": "Terminal", "aliases": ["Terminal", "iTerm", "iTerm2", "Warp", "Alacritty", "Kitty"], "bundle_id": "com.apple.Terminal"},
    {"name": "Notion", "aliases": ["Notion"], "bundle_id": "notion.id"},
    {"name": "Safari", "aliases": ["Safari"], "bundle_id": "com.apple.Safari"},
    {"name": "Firefox", "aliases": ["Firefox"], "bundle_id": "org.mozilla.firefox"},
    {"name": "Microsoft Teams", "aliases": ["Teams"], "bundle_id": "com.microsoft.teams2"},
    {"name": "Zoom", "aliases": ["Zoom"], "bundle_id": "us.zoom.xos"},
    {"name": "Adobe Photoshop", "aliases": ["Photoshop", "PS"], "bundle_id": "com.adobe.Photoshop"},
    {"name": "Adobe Illustrator", "aliases": ["Illustrator", "AI"], "bundle_id": "com.adobe.Illustrator"},
    {"name": "Sketch", "aliases": ["Sketch"], "bundle_id": "com.bohemiancoding.sketch3"},
    {"name": "IntelliJ IDEA", "aliases": ["IntelliJ", "IDEA"], "bundle_id": "com.jetbrains.intellij"},
    {"name": "Xcode", "aliases": ["Xcode"], "bundle_id": "com.apple.dt.Xcode"},
    {"name": "Postman", "aliases": ["Postman"], "bundle_id": "com.postmanlabs.mac"},
    {"name": "TablePlus", "aliases": ["TablePlus"], "bundle_id": "com.tinyapp.TablePlus"},
    {"name": "Docker Desktop", "aliases": ["Docker"], "bundle_id": "com.docker.docker"},
    {"name": "Linear", "aliases": ["Linear"], "bundle_id": "com.linear"},
    {"name": "Obsidian", "aliases": ["Obsidian"], "bundle_id": "md.obsidian"},
    {"name": "Arc", "aliases": ["Arc"], "bundle_id": "company.thebrowser.Browser"},
    {"name": "Microsoft Outlook", "aliases": ["Outlook"], "bundle_id": "com.microsoft.Outlook"},
    {"name": "Microsoft PowerPoint", "aliases": ["PowerPoint", "PPT"], "bundle_id": "com.microsoft.Powerpoint"},
    {"name": "Notes", "aliases": ["Apple Notes", "Notes"], "bundle_id": "com.apple.Notes"},
    {"name": "Preview", "aliases": ["Preview"], "bundle_id": "com.apple.Preview"},
    {"name": "Finder", "aliases": ["Finder"], "bundle_id": "com.apple.finder"},
    {"name": "1Password", "aliases": ["1Password"], "bundle_id": "com.1password.1password"},
    {"name": "Discord", "aliases": ["Discord"], "bundle_id": "com.hnc.Discord"},
    {"name": "Spotify", "aliases": ["Spotify"], "bundle_id": "com.spotify.client"},
]

# Build a lookup: lowercase alias/name → canonical app name
_APP_ALIAS_MAP: dict[str, str] = {}
for _app in KNOWN_APPS:
    _APP_ALIAS_MAP[_app["name"].lower()] = _app["name"]
    for _alias in _app["aliases"]:
        _APP_ALIAS_MAP[_alias.lower()] = _app["name"]


def _resolve_app_name(value: str) -> str:
    """Resolve an alias to a canonical app name (case-insensitive)."""
    return _APP_ALIAS_MAP.get(value.lower(), value)


# ── Schemas ──────────────────────────────────────────────────────────────

class ContextLinkCreate(BaseModel):
    project_id: str
    match_type: str  # url_exact, url_pattern, url_regex, app_name, app_exact, app_regex, window_title, window_regex
    match_value: str
    resource_type: str  # workflow, document
    resource_id: str
    note: Optional[str] = None
    priority: int = 0
    group_id: Optional[str] = None


class ContextLinkUpdate(BaseModel):
    match_type: Optional[str] = None
    match_value: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    note: Optional[str] = None
    priority: Optional[int] = None
    group_id: Optional[str] = None


class ContextLinkOut(BaseModel):
    id: str
    project_id: str
    match_type: str
    match_value: str
    resource_type: str
    resource_id: str
    note: Optional[str] = None
    priority: int = 0
    group_id: Optional[str] = None

    class Config:
        from_attributes = True


class ContextMatchOut(BaseModel):
    id: str
    match_type: str
    match_value: str
    resource_type: str
    resource_id: str
    resource_name: str
    resource_summary: Optional[str] = None
    note: Optional[str] = None
    priority: int = 0
    group_id: Optional[str] = None


# ── Match helpers ────────────────────────────────────────────────────────

def _link_matches(link: ContextLink, url: str | None, app_name: str | None,
                  window_title: str | None, hostname: str | None,
                  hostname_base: str | None) -> bool:
    """Return True if a single link matches the given context."""
    mt = link.match_type
    mv = link.match_value

    if mt == "url_exact":
        return bool(url and url == mv)

    if mt == "url_pattern":
        if not url:
            return False
        # Auto-wrap with wildcards if no glob chars present (enables "contains" behavior)
        pattern = mv if any(c in mv for c in '*?[') else f"*{mv}*"
        return fnmatch.fnmatch(url.lower(), pattern.lower())

    if mt == "url_regex":
        if not url:
            return False
        try:
            return bool(re.search(mv, url))
        except re.error:
            return False

    if mt == "app_name":
        # Case-insensitive CONTAINS + alias resolution
        if not app_name:
            return False
        canonical = _resolve_app_name(mv)
        app_lower = app_name.lower()
        # Check: does the match value (or its canonical form) appear in the app name?
        if mv.lower() in app_lower or canonical.lower() in app_lower:
            return True
        # Also check reverse: does the app name appear in the canonical?
        if app_lower in canonical.lower():
            return True
        return False

    if mt == "app_exact":
        return bool(app_name and app_name == mv)

    if mt == "app_regex":
        if not app_name:
            return False
        try:
            return bool(re.search(mv, app_name))
        except re.error:
            return False

    if mt == "window_title":
        return bool(window_title and mv.lower() in window_title.lower())

    if mt == "window_regex":
        if not window_title:
            return False
        try:
            return bool(re.search(mv, window_title))
        except re.error:
            return False

    return False


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/context-links/known-apps")
async def list_known_apps():
    """Return curated list of common apps with aliases."""
    return {"apps": KNOWN_APPS}


@router.post("/context-links", response_model=ContextLinkOut)
async def create_context_link(
    body: ContextLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    link = ContextLink(
        project_id=body.project_id,
        created_by=current_user.id,
        match_type=body.match_type,
        match_value=body.match_value,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        note=body.note,
        priority=body.priority,
        group_id=body.group_id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


@router.get("/context-links", response_model=list[ContextLinkOut])
async def list_context_links(
    project_id: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import project_members

    if project_id:
        q = select(ContextLink).where(ContextLink.project_id == project_id)
    else:
        user_projects = select(project_members.c.project_id).where(
            project_members.c.user_id == current_user.id
        )
        q = select(ContextLink).where(ContextLink.project_id.in_(user_projects))
    if resource_type:
        q = q.where(ContextLink.resource_type == resource_type)
    if resource_id:
        q = q.where(ContextLink.resource_id == resource_id)
    q = q.order_by(ContextLink.priority.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/context-links/match")
async def match_context_links(
    url: Optional[str] = Query(None),
    app_name: Optional[str] = Query(None),
    window_title: Optional[str] = Query(None),
    hostname: Optional[str] = Query(None),
    hostname_base: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Match context links against a URL, app name, and/or window title.

    Grouping logic:
    - Links with the same group_id form an AND group (all must match)
    - Links with null group_id are each their own group
    - Across groups: any group matching triggers (OR)
    - The highest-priority matching group's resources are returned
    """
    from app.models import project_members

    # Derive hostname from URL if not provided
    if url and not hostname:
        try:
            parsed = urlparse(url)
            hostname = parsed.hostname or None
        except Exception:
            pass
    if hostname and not hostname_base:
        parts = hostname.rsplit(".", 2)
        hostname_base = ".".join(parts[-2:]) if len(parts) >= 2 else hostname

    # Fetch all candidate links
    if project_id:
        q = select(ContextLink).where(ContextLink.project_id == project_id)
    else:
        user_projects = select(project_members.c.project_id).where(
            project_members.c.user_id == current_user.id
        )
        q = select(ContextLink).where(ContextLink.project_id.in_(user_projects))

    result = await db.execute(q)
    links: list[ContextLink] = list(result.scalars().all())

    # Group links by group_id (null group_id → each link is its own group)
    groups: dict[str, list[ContextLink]] = {}
    solo_counter = 0
    for link in links:
        if link.group_id:
            groups.setdefault(link.group_id, []).append(link)
        else:
            groups[f"__solo_{solo_counter}"] = [link]
            solo_counter += 1

    # Evaluate each group: AND within group, OR across groups
    matched_groups: list[tuple[int, list[ContextLink]]] = []  # (max_priority, links)
    for group_key, group_links in groups.items():
        all_match = all(
            _link_matches(link, url, app_name, window_title, hostname, hostname_base)
            for link in group_links
        )
        if all_match:
            max_priority = max(link.priority for link in group_links)
            matched_groups.append((max_priority, group_links))

    # Sort by highest priority group first
    matched_groups.sort(key=lambda g: g[0], reverse=True)

    # Flatten matched links, dedup by resource
    seen_resources: set[tuple[str, str]] = set()
    matched: list[ContextLink] = []
    for _, group_links in matched_groups:
        for link in sorted(group_links, key=lambda l: l.priority, reverse=True):
            resource_key = (link.resource_type, link.resource_id)
            if resource_key not in seen_resources:
                seen_resources.add(resource_key)
                matched.append(link)

    # Resolve resource names
    out: list[dict] = []
    for link in matched:
        resource_name = ""
        resource_summary = None
        if link.resource_type == "workflow":
            r = await db.execute(
                select(ProcessRecordingSession).where(ProcessRecordingSession.id == link.resource_id)
            )
            wf = r.scalar_one_or_none()
            if wf:
                resource_name = wf.name or "Untitled Workflow"
                resource_summary = getattr(wf, "summary", None)
        elif link.resource_type == "document":
            r = await db.execute(
                select(Document).where(Document.id == link.resource_id)
            )
            doc = r.scalar_one_or_none()
            if doc:
                resource_name = doc.name or "Untitled Document"

        out.append(
            ContextMatchOut(
                id=link.id,
                match_type=link.match_type,
                match_value=link.match_value,
                resource_type=link.resource_type,
                resource_id=link.resource_id,
                resource_name=resource_name,
                resource_summary=resource_summary,
                note=link.note,
                priority=link.priority,
                group_id=link.group_id,
            ).model_dump()
        )

    return {"matches": out}


@router.put("/context-links/{link_id}", response_model=ContextLinkOut)
async def update_context_link(
    link_id: str,
    body: ContextLinkUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ContextLink).where(ContextLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Context link not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(link, field, value)
    await db.commit()
    await db.refresh(link)
    return link


@router.delete("/context-links/{link_id}")
async def delete_context_link(
    link_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ContextLink).where(ContextLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Context link not found")
    await db.delete(link)
    await db.commit()
    return {"ok": True}
