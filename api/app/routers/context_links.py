"""
Context Links router.

Match types (unchanged — keep the full power on the document/workflow surface):
  url_exact, url_pattern (glob/contains), url_regex
  app_name (contains + alias resolution), app_exact, app_regex
  window_title (contains), window_regex

Group logic (unchanged):
  Links sharing a group_id form an AND group (all must match).
  Across groups: OR — any matching group surfaces its resources.

New in v3:
  - source: "user" | "auto"  — user links always outrank auto links by default
  - weight: base score for the scoring service (user=1000, auto=100)
  - click_count: incremented on explicit user click; boosts score over time
  - Auto-create endpoint with duplicate detection: reuses existing entries
  - Scoring-based match response (replaces flat priority ordering)
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
from app.services.context_scoring import ScoringContext, compute_final_score

router = APIRouter()

# ── Weight constants ──────────────────────────────────────────────────────────

USER_WEIGHT: float = 1000.0   # Weight assigned to user-created links
AUTO_WEIGHT: float = 100.0    # Weight assigned to auto-created links


# ── Known Apps ────────────────────────────────────────────────────────────────

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

_APP_ALIAS_MAP: dict[str, str] = {}
for _app in KNOWN_APPS:
    _APP_ALIAS_MAP[_app["name"].lower()] = _app["name"]
    for _alias in _app["aliases"]:
        _APP_ALIAS_MAP[_alias.lower()] = _app["name"]


def _resolve_app_name(value: str) -> str:
    return _APP_ALIAS_MAP.get(value.lower(), value)


# ── Schemas ───────────────────────────────────────────────────────────────────

class ContextLinkCreate(BaseModel):
    project_id: str
    match_type: str
    match_value: str
    resource_type: str
    resource_id: str
    note: Optional[str] = None


class ContextLinkUpdate(BaseModel):
    match_type: Optional[str] = None
    match_value: Optional[str] = None
    note: Optional[str] = None
    weight: Optional[float] = None


class ContextLinkOut(BaseModel):
    id: str
    project_id: str
    match_type: str
    match_value: str
    resource_type: str
    resource_id: str
    note: Optional[str] = None
    source: str = "user"
    weight: float = USER_WEIGHT
    click_count: int = 0

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
    source: str = "user"
    weight: float = USER_WEIGHT
    click_count: int = 0
    final_score: float = 0.0


class AutoCreateRequest(BaseModel):
    """
    Create a context link automatically from a recorded workflow or document URL.
    Derives a url_pattern from the provided URL and reuses any existing entry
    for the same (project, pattern, resource) tuple instead of creating a duplicate.
    """
    project_id: str
    resource_type: str          # "workflow" | "document"
    resource_id: str
    url: str                    # Full URL — hostname_base pattern is derived from this
    note: Optional[str] = None


# ── Match helpers ─────────────────────────────────────────────────────────────

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
        if not app_name:
            return False
        canonical = _resolve_app_name(mv)
        app_lower = app_name.lower()
        if mv.lower() in app_lower or canonical.lower() in app_lower:
            return True
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


def _derive_url_pattern(url: str) -> str:
    """
    Derive a glob pattern from a URL suitable for auto-linking.
    e.g. https://app.salesforce.com/lightning/r/... → *.salesforce.com*
    """
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        parts = hostname.rsplit(".", 2)
        hostname_base = ".".join(parts[-2:]) if len(parts) >= 2 else hostname
        return f"*.{hostname_base}*"
    except Exception:
        return url


# ── Endpoints ─────────────────────────────────────────────────────────────────

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
    """Create a user-defined context link. Always assigned source='user' and weight=1000."""
    # Dedup check: if same (project, match_type, match_value, resource) exists, return it
    existing = await _find_duplicate(db, body.project_id, body.match_type, body.match_value, body.resource_id)
    if existing:
        # Upgrade source to "user" if it was auto, since user is now claiming it
        if existing.source == "auto":
            existing.source = "user"
            existing.weight = USER_WEIGHT
            await db.commit()
            await db.refresh(existing)
        return existing

    link = ContextLink(
        project_id=body.project_id,
        created_by=current_user.id,
        match_type=body.match_type,
        match_value=body.match_value,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        note=body.note,
        source="user",
        weight=USER_WEIGHT,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


@router.post("/context-links/auto", response_model=ContextLinkOut)
async def auto_create_context_link(
    body: AutoCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Auto-create a context link from a workflow/document URL.
    Derives a url_pattern (e.g. *.salesforce.com*) and deduplicates:
    if an entry for (project, pattern, resource) already exists it is returned
    as-is rather than creating a new row.  Auto links always use weight=100
    unless a user has already claimed the same pattern (weight stays at 1000).
    """
    pattern = _derive_url_pattern(body.url)

    existing = await _find_duplicate(db, body.project_id, "url_pattern", pattern, body.resource_id)
    if existing:
        # Don't downgrade a user link to auto
        return existing

    link = ContextLink(
        project_id=body.project_id,
        created_by=current_user.id,
        match_type="url_pattern",
        match_value=pattern,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        note=body.note,
        source="auto",
        weight=AUTO_WEIGHT,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


@router.post("/context-links/{link_id}/click", response_model=ContextLinkOut)
async def record_context_click(
    link_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Record that the user clicked/opened a context-surfaced resource.
    Increments click_count on the link, which feeds ClickCountScorer.
    Call this whenever the user explicitly navigates to a resource via a
    context suggestion (not on passive display).
    """
    result = await db.execute(select(ContextLink).where(ContextLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Context link not found")
    link.click_count = (link.click_count or 0) + 1
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
    q = q.order_by(ContextLink.weight.desc(), ContextLink.click_count.desc())
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
    """
    Match context links against a URL, app name, and/or window title.

    Grouping (AND/OR) logic is unchanged:
      - Links in the same group_id: ALL must match (AND).
      - Across groups: ANY matching group surfaces its resources (OR).

    Ranking is now score-based (see context_scoring.py):
      - User-defined links (weight=1000) always outrank auto links (weight=100)
        unless the auto link has accumulated significant click_count signal.
      - Results are sorted by final_score descending.
      - final_score is included in the response for debugging.
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

    # Fetch all candidate links for this project/user
    if project_id:
        q = select(ContextLink).where(ContextLink.project_id == project_id)
    else:
        user_projects = select(project_members.c.project_id).where(
            project_members.c.user_id == current_user.id
        )
        q = select(ContextLink).where(ContextLink.project_id.in_(user_projects))

    result = await db.execute(q)
    links: list[ContextLink] = list(result.scalars().all())

    # Each link is evaluated independently (OR across all matchers).
    # Multiple matchers for the same resource are fine — the best-scoring one wins.
    seen_resources: set[tuple[str, str]] = set()
    matched_links: list[ContextLink] = []
    for link in links:
        if _link_matches(link, url, app_name, window_title, hostname, hostname_base):
            resource_key = (link.resource_type, link.resource_id)
            if resource_key not in seen_resources:
                seen_resources.add(resource_key)
                matched_links.append(link)

    # ── Score each matched link ───────────────────────────────────────────
    # Enrich ScoringContext with available signals.
    # resource_total_views: fetch view_count from the resource row.
    # user_has_viewed: not yet tracked per-user — stub as False.
    # user_onboarding_complete: stub as False until onboarding tracking lands.

    async def _get_resource_views(link: ContextLink) -> int:
        try:
            if link.resource_type == "workflow":
                r = await db.execute(
                    select(ProcessRecordingSession.view_count).where(
                        ProcessRecordingSession.id == link.resource_id
                    )
                )
                return r.scalar_one_or_none() or 0
            # Documents don't have view_count yet — return 0
            return 0
        except Exception:
            return 0

    scored: list[tuple[float, ContextLink]] = []
    for link in matched_links:
        resource_views = await _get_resource_views(link)
        ctx = ScoringContext(
            base_weight=link.weight if link.weight is not None else (
                USER_WEIGHT if (link.source or "user") == "user" else AUTO_WEIGHT
            ),
            source=link.source or "user",
            context_click_count=link.click_count or 0,
            resource_total_views=resource_views,
            user_has_viewed=False,          # TODO: per-user view tracking
            user_onboarding_complete=False, # TODO: onboarding status
        )
        final_score = compute_final_score(ctx)
        scored.append((final_score, link))

    scored.sort(key=lambda t: t[0], reverse=True)

    # ── Resolve resource names & build response ───────────────────────────
    out: list[dict] = []
    for final_score, link in scored:
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
                source=link.source or "user",
                weight=link.weight if link.weight is not None else USER_WEIGHT,
                click_count=link.click_count or 0,
                final_score=final_score,
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


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _find_duplicate(
    db: AsyncSession,
    project_id: str,
    match_type: str,
    match_value: str,
    resource_id: str,
) -> ContextLink | None:
    """
    Check for an existing (project, match_type, match_value, resource_id) entry.
    Used by both create endpoints to prevent duplicate rows.
    """
    result = await db.execute(
        select(ContextLink).where(
            ContextLink.project_id == project_id,
            ContextLink.match_type == match_type,
            ContextLink.match_value == match_value,
            ContextLink.resource_id == resource_id,
        )
    )
    return result.scalar_one_or_none()
