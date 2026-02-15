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

    if not has_embedding_api():
        return {"error": "Semantic search is not available. No embedding API configured."}

    query_vector = await generate_embedding(query)
    if query_vector is None:
        return {"error": "Failed to generate query embedding."}

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
            chunk_info = f", Chunk {meta.get('chunk_index', 0) + 1}" if source_type == "document_chunk" else ""
            results.append({
                "source_type": "document",
                "source_id": doc_id,
                "title": title,
                "citation": f'[Source: Document "{title}"{chunk_info}]',
                "similarity": score,
            })

        elif source_type == "workflow":
            if source_id in seen_workflows:
                continue
            seen_workflows.add(source_id)
            wf_name = meta.get("name") or meta.get("generated_title") or "Untitled Workflow"
            results.append({
                "source_type": "workflow",
                "source_id": source_id,
                "title": wf_name,
                "citation": f'[Source: Workflow "{wf_name}"]',
                "similarity": score,
            })

        elif source_type == "step":
            wf_id = meta.get("session_id", "")
            if wf_id in seen_workflows:
                continue
            seen_workflows.add(wf_id)
            wf_name = meta.get("workflow_name", "Untitled Workflow")
            step_num = meta.get("step_number", "?")
            results.append({
                "source_type": "step",
                "source_id": source_id,
                "title": f"{wf_name} — Step {step_num}",
                "citation": f'[Source: Workflow "{wf_name}", Step {step_num}]',
                "similarity": score,
            })

    return {
        "success": True,
        "count": len(results),
        "results": results,
        "message": f"Found {len(results)} relevant result(s) for '{query}'.",
    }
