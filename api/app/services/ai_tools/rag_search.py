"""
AI Tool: rag_search — semantic search across workflows AND documents.

Returns top results with source citations for RAG-augmented chat responses.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

name = "rag_search"
description = (
    "Search the knowledge base (workflows and documents) using semantic similarity. "
    "Use this when the user asks knowledge questions, 'how do I...', or needs information "
    "that might be in recorded workflows or documentation pages. "
    "Returns relevant results with source citations."
)
parameters = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "The search query describing what information is needed",
        },
    },
    "required": ["query"],
}


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    try:
        from app.services.ai_tools.validation import sanitize_string
        query = sanitize_string(kwargs.get("query", ""), "query") or ""
    except (ValueError, TypeError) as exc:
        return {"error": f"Invalid input: {exc}"}

    if not query:
        return {"error": "A search query is required."}

    from app.services.embeddings import generate_embedding, has_embedding_api

    if has_embedding_api():
        return await _semantic_search(db, query, user_id, project_id)
    else:
        return await _keyword_fallback(db, query, user_id, project_id)


async def _keyword_fallback(
    db: AsyncSession,
    query: str,
    user_id: str,
    project_id: Optional[str],
) -> dict:
    """Keyword-based fallback when no embedding API is available."""
    from sqlalchemy import select, and_
    from app.models import ProcessRecordingSession, Document
    from app.services.embeddings import keyword_similarity

    results: list[dict] = []

    # Search workflows
    wf_filters = [ProcessRecordingSession.user_id == user_id]
    if project_id:
        wf_filters.append(ProcessRecordingSession.project_id == project_id)
    wf_stmt = select(ProcessRecordingSession).where(and_(*wf_filters))
    wf_rows = (await db.execute(wf_stmt)).scalars().all()

    from app.services.embeddings import workflow_text
    for wf in wf_rows:
        text = workflow_text(wf)
        if not text.strip():
            continue
        score = keyword_similarity(query, text)
        if score > 0.15:
            name = wf.name or wf.generated_title or "Untitled Workflow"
            snippet = text.strip()
            results.append({
                "source_type": "workflow",
                "source_id": wf.id,
                "title": name,
                "link": f"/workflow/{wf.id}",
                "snippet": snippet,
                "citation": f'[📄 {name}](/workflow/{wf.id})',
                "similarity": round(score, 4),
            })

    # Search documents (documents belong to projects, not users directly)
    doc_filters = []
    if project_id:
        doc_filters.append(Document.project_id == project_id)
    else:
        # Find all projects the user is a member of
        from app.models import Project, project_members
        from sqlalchemy import select as sa_select
        proj_stmt = sa_select(project_members.c.project_id).where(
            project_members.c.user_id == user_id
        )
        proj_ids = [row[0] for row in (await db.execute(proj_stmt)).all()]
        if proj_ids:
            doc_filters.append(Document.project_id.in_(proj_ids))
        else:
            doc_filters.append(Document.project_id == "__none__")  # no results
    doc_stmt = select(Document).where(and_(*doc_filters))
    doc_rows = (await db.execute(doc_stmt)).scalars().all()

    from app.document_export import tiptap_to_markdown
    for doc in doc_rows:
        text_parts = [doc.name or ""]
        if doc.content:
            try:
                text_parts.append(tiptap_to_markdown(doc.content))
            except Exception:
                pass
        text = "\n".join(text_parts)
        if not text.strip():
            continue
        score = keyword_similarity(query, text)
        if score > 0.15:
            title = doc.name or "Untitled"
            # Include content snippet for LLM context
            snippet = text.strip()
            results.append({
                "source_type": "document",
                "source_id": doc.id,
                "title": title,
                "link": f"/editor/{doc.id}",
                "snippet": snippet,
                "citation": f'[📝 {title}](/editor/{doc.id})',
                "similarity": round(score, 4),
            })

    # Sort by score, take top 5
    results.sort(key=lambda r: r["similarity"], reverse=True)
    results = results[:5]

    # Cap total snippet size to ~20k chars (~5k tokens) to control costs
    total_chars = 0
    MAX_TOTAL_CHARS = 20000
    for r in results:
        snippet = r.get("snippet", "")
        remaining = MAX_TOTAL_CHARS - total_chars
        if remaining <= 0:
            r["snippet"] = "[Content truncated — token budget reached]"
        elif len(snippet) > remaining:
            r["snippet"] = snippet[:remaining] + "\n...[truncated]"
        total_chars += len(r.get("snippet", ""))

    if not results:
        return {
            "success": True,
            "count": 0,
            "results": [],
            "message": f"No results found for '{query}'.",
        }

    return {
        "success": True,
        "count": len(results),
        "results": results,
        "message": f"Found {len(results)} result(s) for '{query}' (keyword search).",
    }


async def _semantic_search(
    db: AsyncSession,
    query: str,
    user_id: str,
    project_id: Optional[str],
) -> dict:
    from app.services.embeddings import generate_embedding

    query_vector = await generate_embedding(query)
    if query_vector is None:
        # Semantic failed — fall back to keyword
        return await _keyword_fallback(db, query, user_id, project_id)

    from sqlalchemy import text as sa_text

    vector_str = "[" + ",".join(str(v) for v in query_vector) + "]"

    # Search all source types: workflow, step, document, document_chunk
    sql = sa_text("""
        SELECT
            e.source_type,
            e.source_id,
            e.metadata,
            e.embedding <=> :query_vector AS distance
        FROM embeddings e
        WHERE 1=1
        {project_filter}
        ORDER BY e.embedding <=> :query_vector
        LIMIT 10
    """.format(
        project_filter="AND e.metadata->>'project_id' = :project_id" if project_id else ""
    ))

    params: dict[str, Any] = {"query_vector": vector_str}
    if project_id:
        params["project_id"] = project_id

    result = await db.execute(sql, params)
    rows = result.fetchall()

    if not rows:
        return {
            "success": True,
            "count": 0,
            "results": [],
            "message": f"No results found for '{query}'.",
        }

    # Deduplicate: prefer document over document_chunk for same doc
    seen_docs: set[str] = set()
    seen_workflows: set[str] = set()
    results: list[dict] = []

    # Pre-fetch documents and workflows for snippets
    from app.models import Document, ProcessRecordingSession
    from sqlalchemy import select

    for source_type, source_id, metadata, distance in rows:
        if len(results) >= 5:
            break

        score = round(max(0.0, 1.0 - distance), 4)
        meta = metadata or {}

        if source_type == "document" or source_type == "document_chunk":
            doc_id = meta.get("doc_id", source_id)
            if doc_id in seen_docs:
                continue
            seen_docs.add(doc_id)
            title = meta.get("title", "Untitled")
            # Always fetch full document content — chunks are just for finding,
            # the LLM needs complete context to answer properly
            snippet = ""
            try:
                doc = await db.get(Document, doc_id)
                if doc and doc.content:
                    from app.document_export import tiptap_to_markdown
                    snippet = tiptap_to_markdown(doc.content).strip()
            except Exception:
                snippet = meta.get("chunk_text", "")
            results.append({
                "source_type": "document",
                "source_id": doc_id,
                "title": title,
                "link": f"/editor/{doc_id}",
                "snippet": snippet,
                "citation": f'[📝 {title}](/editor/{doc_id})',
                "similarity": score,
            })

        elif source_type == "workflow":
            if source_id in seen_workflows:
                continue
            seen_workflows.add(source_id)
            wf_name = meta.get("name") or meta.get("generated_title") or "Untitled Workflow"
            snippet = meta.get("chunk_text", "")
            if not snippet:
                try:
                    wf = await db.get(ProcessRecordingSession, source_id)
                    if wf:
                        from app.services.embeddings import workflow_text
                        snippet = workflow_text(wf).strip()
                except Exception:
                    pass
            results.append({
                "source_type": "workflow",
                "source_id": source_id,
                "title": wf_name,
                "link": f"/workflow/{source_id}",
                "snippet": snippet,
                "citation": f'[📄 {wf_name}](/workflow/{source_id})',
                "similarity": score,
            })

        elif source_type == "step":
            wf_id = meta.get("session_id", "")
            if wf_id in seen_workflows:
                continue
            seen_workflows.add(wf_id)
            wf_name = meta.get("workflow_name", "Untitled Workflow")
            step_num = meta.get("step_number", "?")
            snippet = meta.get("chunk_text", "")
            results.append({
                "source_type": "step",
                "source_id": source_id,
                "title": f"{wf_name} — Step {step_num}",
                "link": f"/workflow/{wf_id}",
                "snippet": snippet,
                "citation": f'[📄 {wf_name}, Step {step_num}](/workflow/{wf_id})',
                "similarity": score,
            })

    # Cap total snippet size to ~20k chars (~5k tokens) to control costs
    total_chars = 0
    MAX_TOTAL_CHARS = 20000
    for r in results:
        snippet = r.get("snippet", "")
        remaining = MAX_TOTAL_CHARS - total_chars
        if remaining <= 0:
            r["snippet"] = "[Content truncated — token budget reached]"
        elif len(snippet) > remaining:
            r["snippet"] = snippet[:remaining] + "\n...[truncated]"
        total_chars += len(r.get("snippet", ""))

    return {
        "success": True,
        "count": len(results),
        "results": results,
        "message": f"Found {len(results)} relevant result(s) for '{query}'.",
    }
