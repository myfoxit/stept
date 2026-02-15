"""
Maintain tsvector search indexes for documents and workflows.
Called on save/update to keep search_tsv columns fresh.
"""
from __future__ import annotations
import logging
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def extract_tiptap_text(content) -> str:
    """Recursively extract plain text from TipTap JSON."""
    if not isinstance(content, dict):
        return str(content) if content else ""
    texts = []
    if "text" in content:
        texts.append(content["text"])
    for child in content.get("content", []):
        texts.append(extract_tiptap_text(child))
    return " ".join(t for t in texts if t)


async def update_document_search(db: AsyncSession, doc_id: str, name: str, content) -> None:
    """Update search_text and search_tsv for a document."""
    plain_text = extract_tiptap_text(content)
    full_text = f"{name or ''} {plain_text}"
    await db.execute(
        sa_text(
            "UPDATE documents SET search_text = :text, "
            "search_tsv = to_tsvector('english', :tsv_text) "
            "WHERE id = :id"
        ),
        {"text": full_text, "tsv_text": full_text, "id": doc_id},
    )


async def update_workflow_search(db: AsyncSession, session_id: str) -> None:
    """Update search_tsv for a workflow from its name, summary, and step descriptions."""
    await db.execute(
        sa_text("""
            UPDATE process_recording_sessions SET search_tsv = to_tsvector('english',
                coalesce(name, '') || ' ' ||
                coalesce(generated_title, '') || ' ' ||
                coalesce(summary, '') || ' ' ||
                coalesce((
                    SELECT string_agg(
                        coalesce(s.description, '') || ' ' || coalesce(s.generated_title, '') || ' ' || coalesce(s.generated_description, ''),
                        ' '
                    )
                    FROM process_recording_steps s
                    WHERE s.session_id = process_recording_sessions.id
                ), '')
            )
            WHERE id = :id
        """),
        {"id": session_id},
    )


async def backfill_all_search(db: AsyncSession) -> int:
    """Backfill search_tsv for all documents and workflows. Returns count updated."""
    # Documents
    result = await db.execute(sa_text("""
        UPDATE documents SET
            search_text = coalesce(name, '') || ' ' || coalesce(search_text, ''),
            search_tsv = to_tsvector('english', coalesce(name, '') || ' ' || coalesce(search_text, ''))
        WHERE search_tsv IS NULL
    """))
    doc_count = result.rowcount

    # Workflows
    result = await db.execute(sa_text("""
        UPDATE process_recording_sessions SET search_tsv = to_tsvector('english',
            coalesce(name, '') || ' ' ||
            coalesce(generated_title, '') || ' ' ||
            coalesce(summary, '')
        )
        WHERE search_tsv IS NULL
    """))
    wf_count = result.rowcount

    await db.commit()
    return doc_count + wf_count
