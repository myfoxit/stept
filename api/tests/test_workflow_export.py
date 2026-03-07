"""Tests for workflow export helpers (markdown/html/confluence/notion)."""

from datetime import datetime

import pytest

from app.workflow_export import (
    generate_markdown,
    generate_html,
    generate_confluence_storage,
    generate_notion_markdown,
)


@pytest.fixture
def workflow():
    return {
        "id": "wf-1",
        "name": "Deploy Workflow",
        "created_at": datetime(2026, 1, 5, 13, 30),
    }


@pytest.fixture
def mixed_steps():
    return [
        {"step_number": 1, "step_type": "header", "content": "Prepare"},
        {"step_number": 2, "step_type": "tip", "content": "Use staging first"},
        {"step_number": 3, "step_type": "alert", "content": "Do not force push"},
        {"step_number": 4, "step_type": "screenshot", "description": "Open CI"},
        {"step_number": 5, "step_type": "capture", "description": "Run tests", "text_typed": "make test"},
        {"step_number": 6, "step_type": "video", "window_title": "Deploy Screen", "key_pressed": "Enter"},
    ]


# Note: get_step_image_bytes/base64 delegate to async storage backends.
# Old filesystem-based tests removed — need mocking for proper coverage.

# ── generate_markdown (sync) ─────────────────────────────────────────────

def test_generate_markdown_title_and_metadata(workflow, mixed_steps):
    md = generate_markdown(workflow, mixed_steps, files={})
    assert "# Deploy Workflow" in md
    assert "**Created:** 2026-01-05 13:30" in md
    assert "**Steps:** 3" in md


@pytest.mark.parametrize(
    "step, expected",
    [
        ({"step_number": 1, "step_type": "header", "content": "Section"}, "## Section"),
        ({"step_number": 1, "step_type": "tip", "content": "Be careful"}, "> 💡 **Tip:** Be careful"),
        ({"step_number": 1, "step_type": "alert", "content": "Danger"}, "> ⚠️ **Alert:** Danger"),
    ],
)
def test_generate_markdown_special_step_types(workflow, step, expected):
    md = generate_markdown(workflow, [step], files={})
    assert expected in md


def test_generate_markdown_visible_step_numbering_ignores_non_visible(workflow):
    steps = [
        {"step_number": 1, "step_type": "header", "content": "H"},
        {"step_number": 2, "step_type": "screenshot", "description": "A"},
        {"step_number": 3, "step_type": "tip", "content": "T"},
        {"step_number": 4, "step_type": "capture", "description": "B"},
    ]
    md = generate_markdown(workflow, steps, files={})
    assert "### Step 1: A" in md
    assert "### Step 2: B" in md


@pytest.mark.parametrize(
    "step, snippet",
    [
        ({"step_number": 1, "description": "Type", "text_typed": "hello"}, "**Text entered:** `hello`"),
        ({"step_number": 1, "description": "Key", "key_pressed": "Enter"}, "**Key pressed:** `Enter`"),
    ],
)
def test_generate_markdown_additional_details(workflow, step, snippet):
    md = generate_markdown(workflow, [step], files={})
    assert snippet in md


def test_generate_markdown_image_placeholder_without_base_url(workflow):
    steps = [{"step_number": 7, "description": "With image"}]
    md = generate_markdown(workflow, steps, files={7: "step_7.png"}, include_images=True)
    assert "*[Image for step 1]*" in md


def test_generate_markdown_image_url_with_base_url(workflow):
    steps = [{"step_number": 7, "description": "With image"}]
    md = generate_markdown(
        workflow, steps, files={7: "step_7.png"},
        include_images=True, image_base_url="https://cdn.example.com",
    )
    assert "![Step 1](https://cdn.example.com/session/wf-1/image/7)" in md


@pytest.mark.parametrize("step_type", ["screenshot", "capture", "gif", "video", None])
def test_generate_markdown_counts_visible_step_types(workflow, step_type):
    step = {"step_number": 1, "step_type": step_type, "description": "x"}
    md = generate_markdown(workflow, [step], files={})
    assert "**Steps:** 1" in md


@pytest.mark.parametrize("name", [None, "", "Automation Guide"])
def test_generate_markdown_title_fallback(name):
    wf = {"id": "wf-2", "name": name}
    md = generate_markdown(wf, [], files={})
    expected = "Untitled Workflow" if not name else "Automation Guide"
    assert f"# {expected}" in md


# ── generate_html (now async) ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_html_has_document_structure(workflow, mixed_steps):
    html = await generate_html(workflow, mixed_steps, files={}, storage_path="/tmp")
    assert "<!DOCTYPE html>" in html
    assert "<html lang='en'>" in html
    assert "<h1>Deploy Workflow</h1>" in html


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "step, snippet",
    [
        ({"step_number": 1, "step_type": "header", "content": "Sec"}, "<h2 class='section-header'>Sec</h2>"),
        ({"step_number": 1, "step_type": "tip", "content": "Idea"}, "<div class='tip'>💡 <strong>Tip:</strong> Idea</div>"),
        ({"step_number": 1, "step_type": "alert", "content": "Warn"}, "<div class='alert'>⚠️ <strong>Alert:</strong> Warn</div>"),
    ],
)
async def test_generate_html_special_nodes(workflow, step, snippet):
    html = await generate_html(workflow, [step], files={}, storage_path="/tmp")
    assert snippet in html


@pytest.mark.asyncio
async def test_generate_html_for_pdf_includes_print_css(workflow):
    html = await generate_html(workflow, [{"step_number": 1, "description": "x"}], files={}, storage_path="/tmp", for_pdf=True)
    assert "@media print" in html
    assert "page-break-inside: avoid" in html


@pytest.mark.asyncio
async def test_generate_html_uses_image_base_url_when_not_embedded(workflow):
    html = await generate_html(
        workflow,
        [{"step_number": 2, "description": "Image"}],
        files={2: "step2.png"}, storage_path="/tmp",
        embed_images=False, image_base_url="https://assets.example.com",
    )
    assert "https://assets.example.com/session/wf-1/image/2" in html


@pytest.mark.asyncio
async def test_generate_html_shows_no_image_placeholder_when_embed_fails(workflow):
    html = await generate_html(
        workflow,
        [{"step_number": 2, "description": "Image"}],
        files={2: "missing.png"}, storage_path="/no/such/dir",
        embed_images=True,
    )
    assert "[Image not available: missing.png]" in html


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "step, snippet",
    [
        ({"step_number": 1, "description": "Type", "text_typed": "abc"}, "Text entered: <code>abc</code>"),
        ({"step_number": 1, "description": "Key", "key_pressed": "Tab"}, "Key pressed: <code>Tab</code>"),
    ],
)
async def test_generate_html_details(workflow, step, snippet):
    html = await generate_html(workflow, [step], files={}, storage_path="/tmp")
    assert snippet in html


# ── generate_confluence_storage (sync) ───────────────────────────────────

def test_generate_confluence_storage_core_elements(workflow, mixed_steps):
    c = generate_confluence_storage(workflow, mixed_steps, files={})
    assert "<h1>Deploy Workflow</h1>" in c
    assert "ac:structured-macro ac:name=\"panel\"" in c
    assert "<strong>Steps:</strong> 3" in c


@pytest.mark.parametrize(
    "step, snippet",
    [
        ({"step_number": 1, "step_type": "header", "content": "Sec"}, "<h2>Sec</h2>"),
        ({"step_number": 1, "step_type": "tip", "content": "Idea"}, "ac:name=\"tip\""),
        ({"step_number": 1, "step_type": "alert", "content": "Warn"}, "ac:name=\"warning\""),
    ],
)
def test_generate_confluence_special_nodes(workflow, step, snippet):
    c = generate_confluence_storage(workflow, [step], files={})
    assert snippet in c


def test_generate_confluence_image_url(workflow):
    c = generate_confluence_storage(
        workflow, [{"step_number": 3, "description": "Image"}],
        files={3: "x.png"}, image_base_url="https://img.example.com",
    )
    assert 'ri:value="https://img.example.com/session/wf-1/image/3"' in c


def test_generate_confluence_attachment_when_no_base_url(workflow):
    c = generate_confluence_storage(
        workflow, [{"step_number": 3, "description": "Image"}],
        files={3: "nested/x.png"},
    )
    assert 'ri:attachment ri:filename="x.png"' in c


@pytest.mark.parametrize(
    "step, snippet",
    [
        ({"step_number": 1, "description": "Type", "text_typed": "abc"}, "<strong>Text entered:</strong> <code>abc</code>"),
        ({"step_number": 1, "description": "Key", "key_pressed": "Esc"}, "<strong>Key pressed:</strong> <code>Esc</code>"),
    ],
)
def test_generate_confluence_details(workflow, step, snippet):
    c = generate_confluence_storage(workflow, [step], files={})
    assert snippet in c


# ── generate_notion_markdown (sync) ──────────────────────────────────────

def test_generate_notion_markdown_core(workflow, mixed_steps):
    md = generate_notion_markdown(workflow, mixed_steps, files={})
    assert "# Deploy Workflow" in md
    assert "> 📋 **Created:** 2026-01-05 13:30 • **Steps:** 3" in md


@pytest.mark.parametrize(
    "step, snippet",
    [
        ({"step_number": 1, "step_type": "header", "content": "Sec"}, "## Sec"),
        ({"step_number": 1, "step_type": "tip", "content": "Idea"}, "> 💡 **Tip:** Idea"),
        ({"step_number": 1, "step_type": "alert", "content": "Warn"}, "> ⚠️ **Alert:** Warn"),
    ],
)
def test_generate_notion_special_nodes(workflow, step, snippet):
    md = generate_notion_markdown(workflow, [step], files={})
    assert snippet in md


def test_generate_notion_details_block_for_visible_steps(workflow):
    md = generate_notion_markdown(
        workflow,
        [{"step_number": 9, "description": "Deploy", "text_typed": "kubectl apply", "key_pressed": "Enter"}],
        files={9: "step9.png"}, image_base_url="https://cdn.example.com",
    )
    assert "<details><summary><strong>Step 1:</strong> Deploy</summary>" in md
    assert "![Step 1](https://cdn.example.com/session/wf-1/image/9)" in md
    assert "**Text entered:** `kubectl apply`" in md
    assert "**Key pressed:** `Enter`" in md


@pytest.mark.parametrize("name", [None, "", "Workflow X"])
def test_generate_notion_title_fallback(name):
    wf = {"id": "wf-2", "name": name}
    md = generate_notion_markdown(wf, [], files={})
    expected = "Untitled Workflow" if not name else "Workflow X"
    assert f"# {expected}" in md
