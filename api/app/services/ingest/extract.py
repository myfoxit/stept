"""
Text extraction for uploaded files (PDF, DOCX, Markdown, plain text).
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def extract_text(file_path: str, mime_type: str) -> str:
    """Extract plain text from a file based on its mime type."""

    if mime_type == "application/pdf":
        return _extract_pdf(file_path)
    elif mime_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ):
        return _extract_docx(file_path)
    elif mime_type in ("text/markdown", "text/x-markdown"):
        return _read_text(file_path)
    elif mime_type.startswith("text/"):
        return _read_text(file_path)
    else:
        logger.warning("Unsupported mime type for extraction: %s", mime_type)
        return _read_text(file_path)


def _read_text(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def _extract_pdf(file_path: str) -> str:
    try:
        import fitz  # pymupdf
    except ImportError:
        logger.error("pymupdf not installed — cannot extract PDF text")
        return ""

    text_parts = []
    with fitz.open(file_path) as doc:
        for page in doc:
            text_parts.append(page.get_text())
    return "\n".join(text_parts)


def _extract_docx(file_path: str) -> str:
    try:
        import docx
    except ImportError:
        logger.error("python-docx not installed — cannot extract DOCX text")
        return ""

    doc = docx.Document(file_path)
    return "\n".join(p.text for p in doc.paragraphs if p.text)
