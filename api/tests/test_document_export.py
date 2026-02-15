"""Tests for document_export.py — TipTap JSON to various formats."""
import json
import os
import zipfile
import io
import pytest
from types import SimpleNamespace

# Import the module under test
from app.document_export import (
    tiptap_to_markdown,
    tiptap_nodes_to_html,
    tiptap_to_html,
    generate_document_confluence,
    generate_document_notion_markdown,
    generate_document_docx,
    generate_document_html,
)

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


@pytest.fixture
def full_doc():
    with open(os.path.join(FIXTURES_DIR, "tiptap_full.json")) as f:
        return json.load(f)


@pytest.fixture
def doc_obj(full_doc):
    """Simulate a document object with .content and .name attributes."""
    return SimpleNamespace(content=full_doc, name="Test Document")


# ── Markdown ──────────────────────────────────────────────────────


class TestTipTapToMarkdown:
    def test_headings(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "# Heading 1" in md
        assert "## Heading 2" in md
        assert "### Heading 3" in md

    def test_bold_italic_strike_code(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "**bold**" in md
        assert "*italic*" in md
        assert "~~strike~~" in md
        assert "`inline code`" in md

    def test_link(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "[a link](https://example.com)" in md

    def test_bullet_list(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "- Bullet 1" in md
        assert "- Bullet 2" in md

    def test_nested_list(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "Nested 2.1" in md
        assert "Deep 2.1.1" in md

    def test_ordered_list(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "1. First" in md
        assert "2. Second" in md

    def test_task_list(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "[x] Done task" in md
        assert "[ ] Open task" in md

    def test_code_block(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "```python" in md
        assert "print('hello')" in md

    def test_blockquote(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "> A wise quote" in md

    def test_horizontal_rule(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "---" in md

    def test_image(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "![Test image](https://example.com/img.png)" in md

    def test_table(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "| Col A | Col B |" in md
        assert "| --- | --- |" in md
        assert "| A1 | B1 |" in md

    def test_custom_nodes_not_dropped(self, full_doc):
        md = tiptap_to_markdown(full_doc)
        assert "[Embedded Workflow Recording: sess-123]" in md
        assert "[Embedded Data Table: My Data Table]" in md

    def test_empty_doc(self):
        assert tiptap_to_markdown(None) == ""
        assert tiptap_to_markdown("") == ""
        assert tiptap_to_markdown({"type": "doc", "content": []}) == ""

    def test_string_passthrough(self):
        assert tiptap_to_markdown("hello world") == "hello world"


# ── HTML ──────────────────────────────────────────────────────────


class TestTipTapToHTML:
    def test_headings(self, full_doc):
        html = tiptap_to_html(full_doc)
        assert "<h1>Heading 1</h1>" in html
        assert "<h2>Heading 2</h2>" in html
        assert "<h3>Heading 3</h3>" in html

    def test_marks(self, full_doc):
        html = tiptap_to_html(full_doc)
        assert "<strong>bold</strong>" in html
        assert "<em>italic</em>" in html
        assert "<s>strike</s>" in html
        assert "<code>inline code</code>" in html
        assert "<u>underlined</u>" in html

    def test_link(self, full_doc):
        html = tiptap_to_html(full_doc)
        assert 'href="https://example.com"' in html
        assert ">a link</a>" in html

    def test_lists(self, full_doc):
        html = tiptap_to_html(full_doc)
        assert "<ul>" in html
        assert "<ol" in html
        assert "<li>" in html

    def test_code_block(self, full_doc):
        html = tiptap_to_html(full_doc)
        assert "<pre>" in html
        assert "print(&#x27;hello&#x27;)" in html or "print('hello')" in html

    def test_blockquote(self, full_doc):
        html = tiptap_to_html(full_doc)
        assert "<blockquote>" in html

    def test_hr(self, full_doc):
        html = tiptap_to_html(full_doc)
        assert "<hr>" in html

    def test_image(self, full_doc):
        html = tiptap_to_html(full_doc)
        assert 'src="https://example.com/img.png"' in html

    def test_table(self, full_doc):
        html = tiptap_to_html(full_doc)
        assert "<table>" in html
        assert "<th>" in html
        assert "<td>" in html

    def test_task_list(self, full_doc):
        html = tiptap_to_html(full_doc)
        assert "☑" in html
        assert "☐" in html

    def test_custom_nodes(self, full_doc):
        html = tiptap_to_html(full_doc)
        assert "Embedded Workflow Recording: sess-123" in html
        assert "Embedded Data Table: My Data Table" in html

    def test_empty_doc(self):
        assert tiptap_to_html(None) == ""
        assert tiptap_to_html("") == ""

    def test_empty_paragraph(self):
        doc = {"type": "doc", "content": [{"type": "paragraph", "content": []}]}
        html = tiptap_to_html(doc)
        assert "<p><br></p>" in html


# ── Confluence ────────────────────────────────────────────────────


class TestConfluenceExport:
    def test_headings(self, doc_obj):
        cf = generate_document_confluence(doc_obj)
        assert "<h1>Heading 1</h1>" in cf
        assert "<h2>Heading 2</h2>" in cf

    def test_code_block(self, doc_obj):
        cf = generate_document_confluence(doc_obj)
        assert "ac:structured-macro" in cf
        assert "python" in cf
        assert "print(" in cf

    def test_image(self, doc_obj):
        cf = generate_document_confluence(doc_obj)
        assert "ac:image" in cf

    def test_table(self, doc_obj):
        cf = generate_document_confluence(doc_obj)
        assert "<table>" in cf
        assert "<th>" in cf

    def test_custom_nodes(self, doc_obj):
        cf = generate_document_confluence(doc_obj)
        assert "Embedded Workflow Recording: sess-123" in cf
        assert "Embedded Data Table: My Data Table" in cf

    def test_empty_doc(self):
        doc = SimpleNamespace(content=None, name="Empty")
        assert generate_document_confluence(doc) == ""


# ── Notion Markdown ───────────────────────────────────────────────


class TestNotionMarkdown:
    def test_headings(self, doc_obj):
        md = generate_document_notion_markdown(doc_obj)
        assert "# Heading 1" in md
        assert "## Heading 2" in md

    def test_blockquote_notion_style(self, doc_obj):
        md = generate_document_notion_markdown(doc_obj)
        # Notion blockquote has 💡 prefix
        assert "💡" in md
        assert "A wise quote" in md

    def test_custom_nodes(self, doc_obj):
        md = generate_document_notion_markdown(doc_obj)
        assert "Embedded Workflow Recording: sess-123" in md
        assert "Embedded Data Table: My Data Table" in md

    def test_empty_doc(self):
        doc = SimpleNamespace(content=None, name="Empty")
        assert generate_document_notion_markdown(doc) == ""


# ── DOCX ──────────────────────────────────────────────────────────


class TestDocxExport:
    def test_produces_valid_docx(self, doc_obj):
        data = generate_document_docx(doc_obj)
        assert isinstance(data, bytes)
        assert len(data) > 0
        # A DOCX is a ZIP file
        buf = io.BytesIO(data)
        assert zipfile.is_zipfile(buf)
        with zipfile.ZipFile(buf) as zf:
            names = zf.namelist()
            assert "word/document.xml" in names

    def test_empty_doc(self):
        doc = SimpleNamespace(content=None, name="Empty")
        data = generate_document_docx(doc)
        assert zipfile.is_zipfile(io.BytesIO(data))

    def test_contains_text(self, doc_obj):
        data = generate_document_docx(doc_obj)
        buf = io.BytesIO(data)
        with zipfile.ZipFile(buf) as zf:
            doc_xml = zf.read("word/document.xml").decode("utf-8")
        assert "Heading 1" in doc_xml
        assert "bold" in doc_xml
        assert "Embedded Workflow Recording" in doc_xml
        assert "Embedded Data Table" in doc_xml


# ── Edge Cases ────────────────────────────────────────────────────


class TestEdgeCases:
    def test_deeply_nested_lists(self):
        """3-level nested bullet list."""
        doc = {
            "type": "doc",
            "content": [{
                "type": "bulletList",
                "content": [{
                    "type": "listItem",
                    "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "L1"}]},
                        {"type": "bulletList", "content": [{
                            "type": "listItem",
                            "content": [
                                {"type": "paragraph", "content": [{"type": "text", "text": "L2"}]},
                                {"type": "bulletList", "content": [{
                                    "type": "listItem",
                                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "L3"}]}]
                                }]}
                            ]
                        }]}
                    ]
                }]
            }]
        }
        md = tiptap_to_markdown(doc)
        assert "L1" in md
        assert "L2" in md
        assert "L3" in md

    def test_empty_table_cells(self):
        """Table with empty cells should not crash."""
        doc = {
            "type": "doc",
            "content": [{
                "type": "table",
                "content": [{
                    "type": "tableRow",
                    "content": [
                        {"type": "tableCell", "content": [{"type": "paragraph", "content": []}]},
                        {"type": "tableCell", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "val"}]}]}
                    ]
                }]
            }]
        }
        md = tiptap_to_markdown(doc)
        assert "val" in md
        html = tiptap_to_html(doc)
        assert "<td>" in html

    def test_custom_node_with_missing_attrs(self):
        """Custom nodes with no attrs should use fallback."""
        doc = {
            "type": "doc",
            "content": [
                {"type": "process-recording-node"},
                {"type": "dataTable"}
            ]
        }
        md = tiptap_to_markdown(doc)
        assert "[Embedded Workflow Recording:" in md
        assert "[Embedded Data Table:" in md
