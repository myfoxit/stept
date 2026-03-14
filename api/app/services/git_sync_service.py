"""
Git export service — one-way push of Stept pages to a Git repository.

Supports GitHub, GitLab, and Bitbucket via their REST APIs.
"""
from __future__ import annotations

import base64
import logging
import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document, Folder, GitSyncConfig
from app.services.crypto import decrypt

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# TipTap JSON → Markdown converter
# ---------------------------------------------------------------------------

def tiptap_to_markdown(content: Any) -> str:
    """Convert TipTap JSON document to Markdown string."""
    if not content or not isinstance(content, dict):
        return ""
    nodes = content.get("content", [])
    return _nodes_to_md(nodes)


def _nodes_to_md(nodes: list[dict], indent: str = "") -> str:
    parts: list[str] = []
    for node in nodes:
        t = node.get("type", "")
        if t == "heading":
            level = node.get("attrs", {}).get("level", 1)
            text = _inline_to_md(node.get("content", []))
            parts.append(f"{'#' * level} {text}")
        elif t == "paragraph":
            text = _inline_to_md(node.get("content", []))
            parts.append(f"{indent}{text}")
        elif t == "bulletList":
            for item in node.get("content", []):
                item_content = item.get("content", [])
                for ic in item_content:
                    text = _inline_to_md(ic.get("content", []))
                    parts.append(f"{indent}- {text}")
        elif t == "orderedList":
            for idx, item in enumerate(node.get("content", []), 1):
                item_content = item.get("content", [])
                for ic in item_content:
                    text = _inline_to_md(ic.get("content", []))
                    parts.append(f"{indent}{idx}. {text}")
        elif t == "codeBlock":
            lang = node.get("attrs", {}).get("language", "")
            code = _inline_to_md(node.get("content", []))
            parts.append(f"```{lang}\n{code}\n```")
        elif t == "blockquote":
            inner = _nodes_to_md(node.get("content", []))
            for line in inner.split("\n"):
                parts.append(f"> {line}")
        elif t == "horizontalRule":
            parts.append("---")
        elif t == "image":
            attrs = node.get("attrs", {})
            parts.append(f"![{attrs.get('alt', '')}]({attrs.get('src', '')})")
        elif t == "table":
            parts.append(_table_to_md(node))
        elif t == "taskList":
            for item in node.get("content", []):
                checked = item.get("attrs", {}).get("checked", False)
                mark = "x" if checked else " "
                item_content = item.get("content", [])
                for ic in item_content:
                    text = _inline_to_md(ic.get("content", []))
                    parts.append(f"- [{mark}] {text}")
        else:
            # Fallback: try to extract text
            text = _inline_to_md(node.get("content", []))
            if text:
                parts.append(text)
    return "\n\n".join(parts)


def _inline_to_md(nodes: list[dict]) -> str:
    parts: list[str] = []
    for node in (nodes or []):
        t = node.get("type", "")
        if t == "text":
            text = node.get("text", "")
            marks = node.get("marks", [])
            for mark in marks:
                mt = mark.get("type", "")
                if mt == "bold":
                    text = f"**{text}**"
                elif mt == "italic":
                    text = f"*{text}*"
                elif mt == "code":
                    text = f"`{text}`"
                elif mt == "strike":
                    text = f"~~{text}~~"
                elif mt == "link":
                    href = mark.get("attrs", {}).get("href", "")
                    text = f"[{text}]({href})"
            parts.append(text)
        elif t == "hardBreak":
            parts.append("\n")
        elif t == "image":
            attrs = node.get("attrs", {})
            parts.append(f"![{attrs.get('alt', '')}]({attrs.get('src', '')})")
    return "".join(parts)


def _table_to_md(node: dict) -> str:
    rows: list[list[str]] = []
    for row in node.get("content", []):
        cells: list[str] = []
        for cell in row.get("content", []):
            text = _nodes_to_md(cell.get("content", []))
            cells.append(text.replace("\n", " "))
        rows.append(cells)
    if not rows:
        return ""
    lines: list[str] = []
    lines.append("| " + " | ".join(rows[0]) + " |")
    lines.append("| " + " | ".join("---" for _ in rows[0]) + " |")
    for row in rows[1:]:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def _sanitize_filename(name: str) -> str:
    """Sanitize a filename for use in git."""
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = name.strip('. ')
    return name or "Untitled"


# ---------------------------------------------------------------------------
# Git provider abstraction
# ---------------------------------------------------------------------------

class GitProvider(ABC):
    def __init__(self, repo_url: str, branch: str, access_token: str):
        self.repo_url = repo_url
        self.branch = branch
        self.access_token = access_token

    @abstractmethod
    async def get_file(self, path: str) -> dict:
        """Get file content. Returns {content, sha, path}."""

    @abstractmethod
    async def create_or_update_file(self, path: str, content: str, message: str, sha: str | None = None) -> dict:
        ...


class GitHubProvider(GitProvider):
    def _api(self, path: str = "") -> str:
        # Extract owner/repo from URL
        parts = self.repo_url.rstrip("/").split("/")
        owner, repo = parts[-2], parts[-1].replace(".git", "")
        return f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def get_file(self, path: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(self._api(path), headers=self._headers(), params={"ref": self.branch})
            resp.raise_for_status()
            data = resp.json()
            content = base64.b64decode(data["content"]).decode("utf-8")
            return {"content": content, "sha": data["sha"], "path": data["path"]}

    async def create_or_update_file(self, path: str, content: str, message: str, sha: str | None = None) -> dict:
        body: dict[str, Any] = {
            "message": message,
            "content": base64.b64encode(content.encode()).decode(),
            "branch": self.branch,
        }
        if sha:
            body["sha"] = sha
        async with httpx.AsyncClient() as client:
            resp = await client.put(self._api(path), headers=self._headers(), json=body)
            resp.raise_for_status()
            return resp.json()


class GitLabProvider(GitProvider):
    def _project_id(self) -> str:
        parts = self.repo_url.rstrip("/").split("/")
        return "%2F".join(parts[-2:]).replace(".git", "")

    def _api(self, path: str = "") -> str:
        encoded_path = path.replace("/", "%2F")
        return f"https://gitlab.com/api/v4/projects/{self._project_id()}/repository/files/{encoded_path}"

    def _headers(self) -> dict:
        return {"PRIVATE-TOKEN": self.access_token}

    async def get_file(self, path: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(self._api(path), headers=self._headers(), params={"ref": self.branch})
            resp.raise_for_status()
            data = resp.json()
            content = base64.b64decode(data["content"]).decode("utf-8")
            return {"content": content, "sha": data.get("blob_id", ""), "path": path}

    async def create_or_update_file(self, path: str, content: str, message: str, sha: str | None = None) -> dict:
        body = {
            "branch": self.branch,
            "content": content,
            "commit_message": message,
        }
        async with httpx.AsyncClient() as client:
            # Try update first, create if 404
            resp = await client.put(self._api(path), headers=self._headers(), json=body)
            if resp.status_code == 404:
                resp = await client.post(self._api(path), headers=self._headers(), json=body)
            resp.raise_for_status()
            return resp.json()


class BitbucketProvider(GitProvider):
    def _api(self, path: str = "") -> str:
        parts = self.repo_url.rstrip("/").split("/")
        owner, repo = parts[-2], parts[-1].replace(".git", "")
        return f"https://api.bitbucket.org/2.0/repositories/{owner}/{repo}/src"

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.access_token}"}

    async def get_file(self, path: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{self._api()}/{self.branch}/{path}", headers=self._headers())
            resp.raise_for_status()
            return {"content": resp.text, "sha": "", "path": path}

    async def create_or_update_file(self, path: str, content: str, message: str, sha: str | None = None) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                self._api(),
                headers=self._headers(),
                data={"message": message, "branch": self.branch, path: content},
            )
            resp.raise_for_status()
            return resp.json()


# ---------------------------------------------------------------------------
# Provider factory
# ---------------------------------------------------------------------------

PROVIDERS = {
    "github": GitHubProvider,
    "gitlab": GitLabProvider,
    "bitbucket": BitbucketProvider,
}


def get_provider(config: GitSyncConfig) -> GitProvider:
    token = decrypt(config.access_token)
    if not token:
        raise ValueError("Could not decrypt access token. Please re-save your token in settings.")
    cls = PROVIDERS.get(config.provider)
    if not cls:
        raise ValueError(f"Unsupported provider: {config.provider}")
    return cls(repo_url=config.repo_url, branch=config.branch, access_token=token)


# ---------------------------------------------------------------------------
# Folder path builder
# ---------------------------------------------------------------------------

async def _build_folder_path_map(db: AsyncSession, project_id: str) -> dict[str | None, str]:
    """Build a map of folder_id → path prefix (e.g. 'My Folder/')."""
    result = await db.execute(select(Folder).where(Folder.project_id == project_id))
    folders = {f.id: f for f in result.scalars().all()}
    path_map: dict[str | None, str] = {None: ""}

    def _get_path(folder_id: str) -> str:
        if folder_id in path_map:
            return path_map[folder_id]
        folder = folders.get(folder_id)
        if not folder:
            return ""
        parent_path = _get_path(folder.parent_id) if folder.parent_id else ""
        p = f"{parent_path}{_sanitize_filename(folder.name)}/"
        path_map[folder_id] = p
        return p

    for fid in folders:
        _get_path(fid)
    return path_map


# ---------------------------------------------------------------------------
# Export (push) to Git
# ---------------------------------------------------------------------------

async def export_to_git(db: AsyncSession, config: GitSyncConfig) -> dict:
    """Export all project documents to the configured Git repo as Markdown."""
    provider = get_provider(config)
    project_id = config.project_id
    directory = config.directory.strip("/")

    config.last_sync_status = "in_progress"
    config.last_sync_error = None
    await db.commit()

    try:
        # Get all documents
        result = await db.execute(select(Document).where(Document.project_id == project_id))
        documents = result.scalars().all()

        # Build folder path map
        path_map = await _build_folder_path_map(db, project_id)

        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        message = f"Export from Stept - {timestamp}"
        exported = 0

        for doc in documents:
            folder_path = path_map.get(doc.folder_id, "")
            filename = _sanitize_filename(doc.name or "Untitled") + ".md"
            file_path = f"{directory}/{folder_path}{filename}" if directory else f"{folder_path}{filename}"
            file_path = file_path.lstrip("/")

            md = tiptap_to_markdown(doc.content)

            # Check if file exists to get SHA (required for updates)
            sha = None
            try:
                existing = await provider.get_file(file_path)
                sha = existing.get("sha")
            except httpx.HTTPStatusError:
                pass  # File doesn't exist yet

            await provider.create_or_update_file(file_path, md, message, sha=sha)
            exported += 1

        config.last_sync_at = datetime.now(timezone.utc)
        config.last_sync_status = "success"
        config.last_sync_error = None
        await db.commit()

        return {"status": "success", "exported": exported}

    except Exception as e:
        logger.exception("Git export failed")
        await db.rollback()
        config.last_sync_status = "error"
        config.last_sync_error = str(e)[:500]
        await db.commit()
        raise


async def test_connection(config: GitSyncConfig) -> dict:
    """Test that the configured Git credentials work."""
    try:
        provider = get_provider(config)
        await provider.get_file("")  # Try listing repo root
        return {"status": "ok"}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            return {"status": "error", "detail": "Invalid credentials"}
        elif e.response.status_code == 404:
            return {"status": "ok", "detail": "Connected (repo or directory is empty)"}
        return {"status": "error", "detail": f"HTTP {e.response.status_code}"}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:200]}
