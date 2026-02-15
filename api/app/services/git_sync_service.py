"""
Git sync service — bidirectional sync between Ondoki pages and a Git repository.

Supports GitHub, GitLab, and Bitbucket via their REST APIs.
"""
from __future__ import annotations

import base64
import logging
import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document, Folder, GitSyncConfig
from app.services.crypto import encrypt, decrypt
from app.utils import gen_suffix

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# TipTap JSON ↔ Markdown converters
# ---------------------------------------------------------------------------

def tiptap_to_markdown(content: Any) -> str:
    """Convert TipTap JSON to Markdown."""
    if not content:
        return ""
    if isinstance(content, str):
        return content

    def _marks(text: str, marks: list[dict]) -> str:
        for m in marks:
            mt = m.get("type", "")
            if mt == "bold":
                text = f"**{text}**"
            elif mt == "italic":
                text = f"*{text}*"
            elif mt == "strike":
                text = f"~~{text}~~"
            elif mt == "code":
                text = f"`{text}`"
            elif mt == "link":
                href = m.get("attrs", {}).get("href", "")
                text = f"[{text}]({href})"
        return text

    def _node(node: dict, depth: int = 0, ordered_idx: int | None = None) -> str:
        t = node.get("type", "")
        children = node.get("content", [])

        if t == "doc":
            return "".join(_node(c) for c in children)

        if t == "text":
            return _marks(node.get("text", ""), node.get("marks", []))

        if t == "paragraph":
            inner = "".join(_node(c) for c in children)
            return inner + "\n\n"

        if t == "heading":
            level = node.get("attrs", {}).get("level", 1)
            inner = "".join(_node(c) for c in children)
            return f"{'#' * level} {inner}\n\n"

        if t == "bulletList":
            return "".join(_node(c, depth) for c in children)

        if t == "orderedList":
            out = ""
            for i, c in enumerate(children, 1):
                out += _node(c, depth, i)
            return out

        if t == "listItem":
            prefix = "  " * depth
            if ordered_idx is not None:
                prefix += f"{ordered_idx}. "
            else:
                prefix += "- "
            parts = []
            for c in children:
                if c.get("type") in ("bulletList", "orderedList"):
                    parts.append(_node(c, depth + 1))
                else:
                    inner = "".join(_node(cc) for cc in c.get("content", []))
                    parts.append(prefix + inner + "\n")
            return "".join(parts)

        if t == "blockquote":
            inner = "".join(_node(c) for c in children)
            return "".join(f"> {line}\n" for line in inner.strip().split("\n")) + "\n"

        if t == "codeBlock":
            lang = node.get("attrs", {}).get("language", "")
            inner = "".join(_node(c) for c in children)
            return f"```{lang}\n{inner.strip()}\n```\n\n"

        if t == "horizontalRule":
            return "---\n\n"

        if t == "image":
            attrs = node.get("attrs", {})
            src = attrs.get("src", "")
            alt = attrs.get("alt", "")
            return f"![{alt}]({src})\n\n"

        if t == "table":
            rows = [c for c in children if c.get("type") == "tableRow"]
            if not rows:
                return ""
            lines: list[str] = []
            for ri, row in enumerate(rows):
                cells = row.get("content", [])
                cell_texts = []
                for cell in cells:
                    inner = "".join(_node(cc) for cc in cell.get("content", []))
                    cell_texts.append(inner.strip().replace("\n", " "))
                lines.append("| " + " | ".join(cell_texts) + " |")
                if ri == 0:
                    lines.append("| " + " | ".join("---" for _ in cell_texts) + " |")
            return "\n".join(lines) + "\n\n"

        if t == "hardBreak":
            return "  \n"

        # Fallback: process children
        return "".join(_node(c) for c in children)

    return _node(content).strip() + "\n"


def markdown_to_tiptap(md: str) -> dict:
    """
    Convert Markdown string to a basic TipTap JSON document.
    Handles headings, paragraphs, bold, italic, code, lists, links, images,
    blockquotes, horizontal rules. Not a full parser — good enough for v1.
    """
    lines = md.split("\n")
    content: list[dict] = []
    i = 0

    def _inline(text: str) -> list[dict]:
        """Parse inline marks: bold, italic, code, links, images."""
        nodes: list[dict] = []
        pattern = re.compile(
            r'!\[([^\]]*)\]\(([^)]+)\)'   # image
            r'|\[([^\]]*)\]\(([^)]+)\)'    # link
            r'|`([^`]+)`'                  # code
            r'|\*\*(.+?)\*\*'             # bold
            r'|\*(.+?)\*'                  # italic
            r'|~~(.+?)~~'                  # strike
        )
        pos = 0
        for m in pattern.finditer(text):
            if m.start() > pos:
                nodes.append({"type": "text", "text": text[pos:m.start()]})

            if m.group(1) is not None or m.group(2) is not None:
                # image
                alt = m.group(1) or ""
                src = m.group(2) or ""
                nodes.append({"type": "image", "attrs": {"src": src, "alt": alt}})
            elif m.group(3) is not None:
                # link
                nodes.append({
                    "type": "text",
                    "text": m.group(3),
                    "marks": [{"type": "link", "attrs": {"href": m.group(4)}}],
                })
            elif m.group(5) is not None:
                nodes.append({"type": "text", "text": m.group(5), "marks": [{"type": "code"}]})
            elif m.group(6) is not None:
                nodes.append({"type": "text", "text": m.group(6), "marks": [{"type": "bold"}]})
            elif m.group(7) is not None:
                nodes.append({"type": "text", "text": m.group(7), "marks": [{"type": "italic"}]})
            elif m.group(8) is not None:
                nodes.append({"type": "text", "text": m.group(8), "marks": [{"type": "strike"}]})

            pos = m.end()

        if pos < len(text):
            nodes.append({"type": "text", "text": text[pos:]})
        return nodes if nodes else [{"type": "text", "text": text}] if text else []

    while i < len(lines):
        line = lines[i]

        # Blank line
        if not line.strip():
            i += 1
            continue

        # Horizontal rule
        if re.match(r'^(---|\*\*\*|___)\s*$', line):
            content.append({"type": "horizontalRule"})
            i += 1
            continue

        # Heading
        hm = re.match(r'^(#{1,6})\s+(.+)$', line)
        if hm:
            level = len(hm.group(1))
            inline = _inline(hm.group(2).strip())
            content.append({"type": "heading", "attrs": {"level": level}, "content": inline})
            i += 1
            continue

        # Code block
        if line.startswith("```"):
            lang = line[3:].strip()
            code_lines: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # skip closing ```
            code_text = "\n".join(code_lines)
            node: dict = {"type": "codeBlock", "content": [{"type": "text", "text": code_text}]}
            if lang:
                node["attrs"] = {"language": lang}
            content.append(node)
            continue

        # Blockquote
        if line.startswith("> "):
            bq_lines: list[str] = []
            while i < len(lines) and lines[i].startswith("> "):
                bq_lines.append(lines[i][2:])
                i += 1
            inner_text = " ".join(bq_lines)
            content.append({
                "type": "blockquote",
                "content": [{"type": "paragraph", "content": _inline(inner_text)}],
            })
            continue

        # Unordered list
        if re.match(r'^[-*+]\s', line):
            items: list[dict] = []
            while i < len(lines) and re.match(r'^[-*+]\s', lines[i]):
                item_text = re.sub(r'^[-*+]\s', '', lines[i])
                items.append({
                    "type": "listItem",
                    "content": [{"type": "paragraph", "content": _inline(item_text)}],
                })
                i += 1
            content.append({"type": "bulletList", "content": items})
            continue

        # Ordered list
        if re.match(r'^\d+\.\s', line):
            items_o: list[dict] = []
            while i < len(lines) and re.match(r'^\d+\.\s', lines[i]):
                item_text = re.sub(r'^\d+\.\s', '', lines[i])
                items_o.append({
                    "type": "listItem",
                    "content": [{"type": "paragraph", "content": _inline(item_text)}],
                })
                i += 1
            content.append({"type": "orderedList", "content": items_o})
            continue

        # Default: paragraph
        inline = _inline(line)
        if inline:
            content.append({"type": "paragraph", "content": inline})
        i += 1

    return {"type": "doc", "content": content}


# ---------------------------------------------------------------------------
# Git provider abstraction
# ---------------------------------------------------------------------------

class GitProvider(ABC):
    """Abstract base for Git hosting provider APIs."""

    def __init__(self, repo_url: str, branch: str, access_token: str):
        self.repo_url = repo_url
        self.branch = branch
        self.access_token = access_token

    @abstractmethod
    async def list_files(self, path: str = "") -> list[dict]:
        """List files at path. Returns list of {path, type, sha}."""
        ...

    @abstractmethod
    async def get_file(self, path: str) -> dict:
        """Get file content. Returns {content, sha, path}."""
        ...

    @abstractmethod
    async def create_or_update_file(self, path: str, content: str, message: str, sha: str | None = None) -> dict:
        ...

    @abstractmethod
    async def delete_file(self, path: str, message: str, sha: str) -> None:
        ...


class GitHubProvider(GitProvider):
    """GitHub REST API (Contents API)."""

    def _parse_owner_repo(self) -> tuple[str, str]:
        # https://github.com/owner/repo or owner/repo
        url = self.repo_url.rstrip("/").removesuffix(".git")
        parts = url.split("/")
        return parts[-2], parts[-1]

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def _api(self, path: str) -> str:
        owner, repo = self._parse_owner_repo()
        return f"https://api.github.com/repos/{owner}/{repo}/contents/{path.lstrip('/')}"

    async def list_files(self, path: str = "") -> list[dict]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                self._api(path),
                headers=self._headers(),
                params={"ref": self.branch},
            )
            resp.raise_for_status()
            items = resp.json()
            if isinstance(items, dict):
                items = [items]
            result = []
            for item in items:
                result.append({"path": item["path"], "type": item["type"], "sha": item["sha"]})
                if item["type"] == "dir":
                    result.extend(await self.list_files(item["path"]))
            return result

    async def get_file(self, path: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                self._api(path),
                headers=self._headers(),
                params={"ref": self.branch},
            )
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

    async def delete_file(self, path: str, message: str, sha: str) -> None:
        body = {"message": message, "sha": sha, "branch": self.branch}
        async with httpx.AsyncClient() as client:
            resp = await client.request("DELETE", self._api(path), headers=self._headers(), json=body)
            resp.raise_for_status()


class GitLabProvider(GitProvider):
    """GitLab REST API (Repository Files API)."""

    def _parse_project_path(self) -> str:
        url = self.repo_url.rstrip("/").removesuffix(".git")
        # https://gitlab.com/owner/repo → owner/repo (URL-encoded)
        parts = url.split("gitlab.com/")[-1] if "gitlab.com" in url else url.split("/", 3)[-1]
        return parts.replace("/", "%2F")

    def _headers(self) -> dict:
        return {"PRIVATE-TOKEN": self.access_token}

    def _base(self) -> str:
        # Support self-hosted GitLab
        url = self.repo_url.rstrip("/").removesuffix(".git")
        if "gitlab.com" in url:
            return "https://gitlab.com/api/v4"
        # Extract base URL for self-hosted
        parts = url.split("/")
        return f"{parts[0]}//{parts[2]}/api/v4"

    async def list_files(self, path: str = "") -> list[dict]:
        project = self._parse_project_path()
        base = self._base()
        params: dict[str, Any] = {"ref": self.branch, "recursive": "true", "per_page": 100}
        if path:
            params["path"] = path
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{base}/projects/{project}/repository/tree",
                headers=self._headers(),
                params=params,
            )
            resp.raise_for_status()
            return [{"path": f["path"], "type": f["type"], "sha": f.get("id", "")} for f in resp.json()]

    async def get_file(self, path: str) -> dict:
        project = self._parse_project_path()
        base = self._base()
        encoded_path = path.replace("/", "%2F")
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{base}/projects/{project}/repository/files/{encoded_path}",
                headers=self._headers(),
                params={"ref": self.branch},
            )
            resp.raise_for_status()
            data = resp.json()
            content = base64.b64decode(data["content"]).decode("utf-8")
            return {"content": content, "sha": data.get("blob_id", ""), "path": path}

    async def create_or_update_file(self, path: str, content: str, message: str, sha: str | None = None) -> dict:
        project = self._parse_project_path()
        base = self._base()
        encoded_path = path.replace("/", "%2F")
        body = {
            "branch": self.branch,
            "content": content,
            "commit_message": message,
        }
        async with httpx.AsyncClient() as client:
            # Try update first, create if 404
            resp = await client.put(
                f"{base}/projects/{project}/repository/files/{encoded_path}",
                headers=self._headers(),
                json=body,
            )
            if resp.status_code == 404:
                resp = await client.post(
                    f"{base}/projects/{project}/repository/files/{encoded_path}",
                    headers=self._headers(),
                    json=body,
                )
            resp.raise_for_status()
            return resp.json()

    async def delete_file(self, path: str, message: str, sha: str) -> None:
        project = self._parse_project_path()
        base = self._base()
        encoded_path = path.replace("/", "%2F")
        body = {"branch": self.branch, "commit_message": message}
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{base}/projects/{project}/repository/files/{encoded_path}",
                headers=self._headers(),
                json=body,
            )
            resp.raise_for_status()


class BitbucketProvider(GitProvider):
    """Bitbucket REST API (Source / Src API)."""

    def _parse_owner_repo(self) -> tuple[str, str]:
        url = self.repo_url.rstrip("/").removesuffix(".git")
        parts = url.split("/")
        return parts[-2], parts[-1]

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.access_token}"}

    def _api(self, path: str = "") -> str:
        owner, repo = self._parse_owner_repo()
        base = f"https://api.bitbucket.org/2.0/repositories/{owner}/{repo}/src/{self.branch}"
        if path:
            return f"{base}/{path.lstrip('/')}"
        return base

    async def list_files(self, path: str = "") -> list[dict]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(self._api(path), headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
            result = []
            for item in data.get("values", []):
                ftype = "dir" if item["type"] == "commit_directory" else "file"
                result.append({"path": item["path"], "type": ftype, "sha": item.get("commit", {}).get("hash", "")})
                if ftype == "dir":
                    result.extend(await self.list_files(item["path"]))
            return result

    async def get_file(self, path: str) -> dict:
        owner, repo = self._parse_owner_repo()
        url = f"https://api.bitbucket.org/2.0/repositories/{owner}/{repo}/src/{self.branch}/{path}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            content = resp.text
            return {"content": content, "sha": "", "path": path}

    async def create_or_update_file(self, path: str, content: str, message: str, sha: str | None = None) -> dict:
        owner, repo = self._parse_owner_repo()
        url = f"https://api.bitbucket.org/2.0/repositories/{owner}/{repo}/src"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                headers=self._headers(),
                data={"message": message, path: content, "branch": self.branch},
            )
            resp.raise_for_status()
            return {"status": "ok"}

    async def delete_file(self, path: str, message: str, sha: str) -> None:
        # Bitbucket doesn't have a direct delete-file endpoint via src API;
        # would need to use the commits API. Stub for now.
        logger.warning("Bitbucket file deletion not fully supported yet")


def get_provider(config: GitSyncConfig) -> GitProvider:
    """Factory to get the right provider instance."""
    token = decrypt(config.access_token)
    providers = {
        "github": GitHubProvider,
        "gitlab": GitLabProvider,
        "bitbucket": BitbucketProvider,
    }
    cls = providers.get(config.provider)
    if not cls:
        raise ValueError(f"Unsupported provider: {config.provider}")
    return cls(repo_url=config.repo_url, branch=config.branch, access_token=token)


# ---------------------------------------------------------------------------
# Sync logic
# ---------------------------------------------------------------------------

async def _build_folder_path_map(db: AsyncSession, project_id: str) -> dict[str | None, str]:
    """Build a map of folder_id → path prefix (e.g. 'My Folder/')."""
    result = await db.execute(
        select(Folder).where(Folder.project_id == project_id)
    )
    folders = {f.id: f for f in result.scalars().all()}

    path_map: dict[str | None, str] = {None: ""}

    def _get_path(folder_id: str) -> str:
        if folder_id in path_map:
            return path_map[folder_id]
        folder = folders.get(folder_id)
        if not folder:
            return ""
        parent_path = _get_path(folder.parent_id) if folder.parent_id else ""
        p = f"{parent_path}{folder.name}/"
        path_map[folder_id] = p
        return p

    for fid in folders:
        _get_path(fid)

    return path_map


def _sanitize_filename(name: str) -> str:
    """Make a document name safe for use as a filename."""
    if not name:
        return "Untitled"
    # Replace problematic chars
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    return name.strip() or "Untitled"


async def push_to_git(db: AsyncSession, config: GitSyncConfig) -> dict:
    """Push all project documents to the configured Git repo."""
    provider = get_provider(config)
    project_id = config.project_id
    directory = config.directory.strip("/")

    # Update status
    config.last_sync_status = "in_progress"
    config.last_sync_error = None
    await db.commit()

    try:
        # Get existing files in repo for SHA lookup
        existing_files: dict[str, str] = {}  # path → sha
        try:
            files = await provider.list_files(directory)
            existing_files = {f["path"]: f["sha"] for f in files if f["type"] == "file"}
        except httpx.HTTPStatusError:
            pass  # Directory may not exist yet

        # Get all documents
        result = await db.execute(
            select(Document).where(Document.project_id == project_id)
        )
        documents = result.scalars().all()

        # Build folder path map
        path_map = await _build_folder_path_map(db, project_id)

        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        message = f"Sync from Ondoki - {timestamp}"
        pushed = 0

        for doc in documents:
            folder_path = path_map.get(doc.folder_id, "")
            filename = _sanitize_filename(doc.name or "Untitled") + ".md"
            file_path = f"{directory}/{folder_path}{filename}" if directory else f"{folder_path}{filename}"
            file_path = file_path.lstrip("/")

            # Convert content
            md = tiptap_to_markdown(doc.content)

            sha = existing_files.get(file_path)
            
            # If no SHA found but file might exist, try fetching it directly
            if not sha:
                try:
                    existing = await provider.get_file(file_path)
                    sha = existing.get("sha")
                except httpx.HTTPStatusError:
                    pass  # File doesn't exist yet, will create
            
            await provider.create_or_update_file(file_path, md, message, sha=sha)
            pushed += 1

        config.last_sync_at = datetime.now(timezone.utc)
        config.last_sync_status = "success"
        config.last_sync_error = None
        await db.commit()

        return {"status": "success", "pushed": pushed}

    except Exception as e:
        logger.exception("Git push failed")
        await db.rollback()
        config.last_sync_status = "error"
        config.last_sync_error = str(e)[:500]
        await db.commit()
        raise


async def pull_from_git(db: AsyncSession, config: GitSyncConfig) -> dict:
    """Pull files from Git repo and create/update documents."""
    provider = get_provider(config)
    project_id = config.project_id
    directory = config.directory.strip("/")

    config.last_sync_status = "in_progress"
    config.last_sync_error = None
    await db.commit()

    try:
        # List files from repo
        all_files = await provider.list_files(directory)
        ext = ".md" if config.sync_format == "markdown" else ".html"
        target_files = [f for f in all_files if f["type"] == "file" and f["path"].endswith(ext)]

        # Build existing doc map: folder_path/name → document
        result = await db.execute(
            select(Document).where(Document.project_id == project_id)
        )
        documents = result.scalars().all()
        path_map = await _build_folder_path_map(db, project_id)

        # Reverse: build doc path → doc
        doc_by_path: dict[str, Document] = {}
        for doc in documents:
            folder_path = path_map.get(doc.folder_id, "")
            filename = _sanitize_filename(doc.name or "Untitled") + ext
            p = f"{folder_path}{filename}".lstrip("/")
            doc_by_path[p] = doc

        # Reverse folder map: path → folder_id
        folder_by_path: dict[str, str] = {}
        result2 = await db.execute(select(Folder).where(Folder.project_id == project_id))
        for f in result2.scalars().all():
            fp = path_map.get(f.id, "").rstrip("/")
            if fp:
                folder_by_path[fp] = f.id

        pulled = 0
        created = 0

        for file_info in target_files:
            file_path = file_info["path"]
            # Remove directory prefix
            rel_path = file_path
            if directory:
                rel_path = file_path[len(directory):].lstrip("/")

            file_data = await provider.get_file(file_path)
            raw_content = file_data["content"]

            # Parse content
            if config.sync_format == "markdown":
                tiptap_content = markdown_to_tiptap(raw_content)
            else:
                # HTML: wrap in basic tiptap structure
                tiptap_content = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": raw_content}]}]}

            # Determine folder and name from path
            parts = rel_path.rsplit("/", 1)
            if len(parts) == 2:
                folder_rel, filename = parts
            else:
                folder_rel, filename = "", parts[0]

            doc_name = filename.removesuffix(ext)

            # Find or create folder
            folder_id = None
            if folder_rel:
                folder_id = folder_by_path.get(folder_rel)
                if not folder_id:
                    # Create folder hierarchy
                    folder_parts = folder_rel.split("/")
                    current_parent = None
                    current_path = ""
                    for fp in folder_parts:
                        current_path = f"{current_path}/{fp}" if current_path else fp
                        if current_path in folder_by_path:
                            current_parent = folder_by_path[current_path]
                        else:
                            new_folder = Folder(
                                id=gen_suffix(),
                                name=fp,
                                project_id=project_id,
                                parent_id=current_parent,
                            )
                            new_folder.set_path(
                                path_map.get(current_parent, "") if current_parent else ""
                            )
                            db.add(new_folder)
                            await db.flush()
                            folder_by_path[current_path] = new_folder.id
                            path_map[new_folder.id] = current_path + "/"
                            current_parent = new_folder.id
                    folder_id = current_parent

            # Match existing doc
            existing_doc = doc_by_path.get(rel_path)
            if existing_doc:
                existing_doc.content = tiptap_content
                existing_doc.name = doc_name
                pulled += 1
            else:
                new_doc = Document(
                    id=gen_suffix(),
                    name=doc_name,
                    content=tiptap_content,
                    project_id=project_id,
                    folder_id=folder_id,
                )
                db.add(new_doc)
                created += 1

        config.last_sync_at = datetime.now(timezone.utc)
        config.last_sync_status = "success"
        config.last_sync_error = None
        await db.commit()

        return {"status": "success", "updated": pulled, "created": created}

    except Exception as e:
        logger.exception("Git pull failed")
        await db.rollback()
        config.last_sync_status = "error"
        config.last_sync_error = str(e)[:500]
        await db.commit()
        raise


async def test_connection(config: GitSyncConfig) -> dict:
    """Test that the provider credentials work."""
    provider = get_provider(config)
    try:
        await provider.list_files(config.directory.strip("/") or "")
        return {"status": "ok"}
    except httpx.HTTPStatusError as e:
        return {"status": "error", "detail": f"HTTP {e.response.status_code}: {e.response.text[:200]}"}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:200]}
