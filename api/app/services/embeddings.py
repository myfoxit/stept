"""
Embedding service for RAG (Retrieval-Augmented Generation).

Supports:
  - OpenAI embeddings API (text-embedding-3-small, 1536 dims)
  - Keyword-based fallback when no embedding API is available

The embedding model is configurable via the LLM settings (DB or env).
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
from collections import Counter
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EMBEDDING_DIM = 1536
EMBEDDING_MODEL = "text-embedding-3-small"
MAX_BATCH_SIZE = 100  # OpenAI batch limit per request


# ---------------------------------------------------------------------------
# Helpers — resolve API key & base URL from LLM config
# ---------------------------------------------------------------------------

def _get_openai_config() -> tuple[str | None, str]:
    """Return (api_key, base_url) suitable for OpenAI embeddings."""
    from app.services.llm import _api_key, _base_url, _provider

    provider = _provider()
    api_key = _api_key()

    # Only use OpenAI embeddings when provider is openai-compatible
    if provider in ("openai",) and api_key:
        return api_key, _base_url()
    # For other providers (anthropic, ollama) or no key: no embeddings
    return None, ""


def has_embedding_api() -> bool:
    """Check if an embedding API is available."""
    api_key, _ = _get_openai_config()
    return api_key is not None


# ---------------------------------------------------------------------------
# OpenAI embeddings
# ---------------------------------------------------------------------------

async def generate_embedding(text: str) -> list[float] | None:
    """Generate a single embedding vector. Returns None if API unavailable."""
    results = await generate_embeddings([text])
    return results[0] if results else None


async def generate_embeddings(texts: list[str]) -> list[list[float]] | None:
    """
    Generate embeddings for a batch of texts via OpenAI API.
    Returns None if API is unavailable or the call fails.
    """
    api_key, base_url = _get_openai_config()
    if not api_key:
        return None

    all_embeddings: list[list[float]] = []

    # Process in batches
    for i in range(0, len(texts), MAX_BATCH_SIZE):
        batch = texts[i : i + MAX_BATCH_SIZE]
        # Clean texts: strip whitespace, truncate to ~8k tokens (~32k chars)
        cleaned = [t.strip()[:32_000] for t in batch]

        url = f"{base_url}/v1/embeddings"
        headers = {
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
        }
        payload = {
            "model": EMBEDDING_MODEL,
            "input": cleaned,
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()

            # Sort by index to maintain order
            sorted_data = sorted(data["data"], key=lambda x: x["index"])
            batch_embeddings = [item["embedding"] for item in sorted_data]
            all_embeddings.extend(batch_embeddings)

        except Exception as exc:
            logger.error("Embedding API call failed: %s", exc)
            return None

    return all_embeddings


# ---------------------------------------------------------------------------
# Content hashing (for skip-if-unchanged logic)
# ---------------------------------------------------------------------------

def content_hash(text: str) -> str:
    """SHA-256 hex digest of the text content."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Text assembly — build searchable text from workflow / step data
# ---------------------------------------------------------------------------

def workflow_text(session) -> str:
    """Build a searchable text blob from a ProcessRecordingSession."""
    parts: list[str] = []
    if session.name:
        parts.append(session.name)
    if session.generated_title:
        parts.append(session.generated_title)
    if session.summary:
        parts.append(session.summary)
    if session.tags:
        parts.append(" ".join(session.tags) if isinstance(session.tags, list) else str(session.tags))
    if session.guide_markdown:
        parts.append(session.guide_markdown[:4000])  # truncate long guides
    return "\n".join(parts)


def step_text(step) -> str:
    """Build a searchable text blob from a ProcessRecordingStep."""
    parts: list[str] = []
    if step.generated_title:
        parts.append(step.generated_title)
    if step.generated_description:
        parts.append(step.generated_description)
    if step.description:
        parts.append(step.description)
    if step.window_title:
        parts.append(step.window_title)
    if step.content:
        parts.append(step.content)
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Keyword fallback — simple TF-IDF-like cosine similarity
# ---------------------------------------------------------------------------

_STOP_WORDS = frozenset(
    "a an and are as at be by for from has have how i in is it of on or "
    "the to was were what when where which who will with you do does did "
    "can could should would may might shall not no".split()
)


def _tokenize(text: str) -> list[str]:
    """Simple tokenizer: lowercase, alphanumeric tokens, remove stop words."""
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return [t for t in tokens if t not in _STOP_WORDS and len(t) > 1]


def _tf(tokens: list[str]) -> dict[str, float]:
    """Term frequency (normalized)."""
    counts = Counter(tokens)
    total = len(tokens) or 1
    return {t: c / total for t, c in counts.items()}


def keyword_similarity(query: str, document: str) -> float:
    """
    Compute a simple keyword-based similarity score (0-1).
    Uses TF cosine similarity as a lightweight fallback.
    """
    q_tokens = _tokenize(query)
    d_tokens = _tokenize(document)

    if not q_tokens or not d_tokens:
        return 0.0

    q_tf = _tf(q_tokens)
    d_tf = _tf(d_tokens)

    # Cosine similarity between TF vectors
    common = set(q_tf) & set(d_tf)
    if not common:
        return 0.0

    dot = sum(q_tf[t] * d_tf[t] for t in common)
    mag_q = math.sqrt(sum(v * v for v in q_tf.values()))
    mag_d = math.sqrt(sum(v * v for v in d_tf.values()))

    if mag_q == 0 or mag_d == 0:
        return 0.0

    return dot / (mag_q * mag_d)
