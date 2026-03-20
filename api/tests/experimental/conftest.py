"""
Tests for experimental features (AI Chat, Knowledge Base, etc.)

These tests require the corresponding feature flags to be enabled.
Run with flags: STEPT_ENABLE_AI_CHAT=true STEPT_ENABLE_KNOWLEDGE_BASE=true pytest tests/ -v
"""
import pytest
import os


def pytest_collection_modifyitems(config, items):
    chat_enabled = os.getenv("STEPT_ENABLE_AI_CHAT", "false").lower() in ("true", "1", "yes")
    kb_enabled = os.getenv("STEPT_ENABLE_KNOWLEDGE_BASE", "false").lower() in ("true", "1", "yes")

    skip_chat = pytest.mark.skip(reason="STEPT_ENABLE_AI_CHAT not enabled")
    skip_kb = pytest.mark.skip(reason="STEPT_ENABLE_KNOWLEDGE_BASE not enabled")

    for item in items:
        if "experimental" not in str(item.fspath):
            continue
        name = item.fspath.basename
        if "chat" in name and not chat_enabled:
            item.add_marker(skip_chat)
        elif "knowledge" in name and not kb_enabled:
            item.add_marker(skip_kb)
