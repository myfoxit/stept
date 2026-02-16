"""Link detection service — finds related content via embedding similarity."""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select, and_, delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Embedding, KnowledgeLink, LinkType, Document, ProcessRecordingSession

logger = logging.getLogger(__name__)


async def detect_related_content(
    project_id: str,
    resource_type: str,
    resource_id: str,
    db: AsyncSession,
    threshold: float = 0.80,
    max_suggestions: int = 5,
) -> list[dict]:
    """
    Find content related to a given resource using embedding similarity.
    Uses pgvector cosine distance operator.
    """
    # Get the embedding for this resource
    source_emb_type = {
        "document": "document",
        "workflow": "workflow",
        "knowledge_source": "knowledge_source",
    }.get(resource_type, resource_type)

    stmt = select(Embedding).where(
        and_(
            Embedding.source_type == source_emb_type,
            Embedding.source_id == resource_id,
        )
    )
    result = await db.execute(stmt)
    source_emb = result.scalar_one_or_none()

    if not source_emb:
        logger.debug("No embedding found for %s/%s", resource_type, resource_id)
        return []

    # Find similar embeddings in the same project using cosine distance
    # Filter to main resource types only (not chunks/steps)
    try:
        cosine_dist = Embedding.embedding.cosine_distance(source_emb.embedding)
    except Exception:
        logger.warning("pgvector cosine_distance not available")
        return []

    similar_stmt = (
        select(
            Embedding.source_type,
            Embedding.source_id,
            Embedding.metadata_,
            cosine_dist.label("distance"),
        )
        .where(
            and_(
                Embedding.source_type.in_(["document", "workflow", "knowledge_source"]),
                Embedding.source_id != resource_id,
                Embedding.metadata_["project_id"].as_string() == project_id,
            )
        )
        .order_by(cosine_dist)
        .limit(max_suggestions * 2)  # fetch extra, filter by threshold
    )

    rows = (await db.execute(similar_stmt)).all()

    results = []
    for source_type, source_id, metadata, distance in rows:
        similarity = 1.0 - distance
        if similarity < threshold:
            continue
        results.append({
            "resource_type": source_type,
            "resource_id": source_id,
            "similarity": round(similarity, 3),
            "title": (metadata or {}).get("title") or (metadata or {}).get("name") or "Untitled",
        })
        if len(results) >= max_suggestions:
            break

    return results


async def auto_link_resource(
    project_id: str,
    resource_type: str,
    resource_id: str,
    user_id: str | None,
    db: AsyncSession,
    threshold: float = 0.85,
) -> int:
    """Auto-detect and create KnowledgeLinks. Returns count of links created."""
    try:
        related = await detect_related_content(
            project_id, resource_type, resource_id, db,
            threshold=threshold, max_suggestions=5,
        )
    except Exception as exc:
        logger.error("Auto-link detection failed for %s/%s: %s", resource_type, resource_id, exc)
        return 0

    count = 0
    for item in related:
        # Check if link already exists (either direction)
        existing = await db.execute(
            select(KnowledgeLink).where(
                and_(
                    KnowledgeLink.project_id == project_id,
                    KnowledgeLink.link_type == LinkType.RELATED,
                    (
                        (
                            (KnowledgeLink.source_type == resource_type) &
                            (KnowledgeLink.source_id == resource_id) &
                            (KnowledgeLink.target_type == item["resource_type"]) &
                            (KnowledgeLink.target_id == item["resource_id"])
                        ) |
                        (
                            (KnowledgeLink.source_type == item["resource_type"]) &
                            (KnowledgeLink.source_id == item["resource_id"]) &
                            (KnowledgeLink.target_type == resource_type) &
                            (KnowledgeLink.target_id == resource_id)
                        )
                    ),
                )
            )
        )
        if existing.scalar_one_or_none():
            continue

        link = KnowledgeLink(
            project_id=project_id,
            source_type=resource_type,
            source_id=resource_id,
            target_type=item["resource_type"],
            target_id=item["resource_id"],
            link_type=LinkType.RELATED,
            confidence=item["similarity"],
            auto_detected=True,
            created_by=user_id,
        )
        db.add(link)
        count += 1

    if count:
        await db.flush()
        logger.info("Auto-linked %d resources for %s/%s", count, resource_type, resource_id)

    return count
