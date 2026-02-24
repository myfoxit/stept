# Ondoki: TipTap → Lexical Migration Plan

**Date:** 2026-02-24  
**Status:** PLANNING — no code changes until plan is approved  
**Branch:** `master` at `86584da` (Design Changesv2)

---

## Table of Contents

1. [Why Lexical](#1-why-lexical)
2. [Architecture Comparison](#2-architecture-comparison)
3. [The Pagination Problem](#3-the-pagination-problem--solution)
4. [Migration Strategy](#4-migration-strategy)
5. [Phase 1: Foundation](#5-phase-1-foundation)
6. [Phase 2: Core Editor](#6-phase-2-core-editor)
7. [Phase 3: Custom Nodes](#7-phase-3-custom-nodes)
8. [Phase 4: UI Components](#8-phase-4-ui-components)
9. [Phase 5: Backend Migration](#9-phase-5-backend-migration)
10. [Phase 6: Pagination](#10-phase-6-pagination)
11. [Phase 7: AI & Advanced Features](#11-phase-7-ai--advanced-features)
12. [Phase 8: Testing & Cleanup](#12-phase-8-testing--cleanup)
13. [Risk Assessment](#13-risk-assessment)
14. [File Inventory](#14-file-inventory)

---

## 1. Why Lexical

- **License:** TipTap notion template is proprietary; the current editor structure makes the origin obvious
- **Lexical is MIT**, maintained by Meta, zero licensing concerns
- **Performance:** Lexical is built for speed — virtual DOM reconciliation, no ProseMirror overhead
- **Extensibility:** DecoratorNodes let you render any React component inline in the editor

**What we lose:**
- ProseMirror's `Decoration.widget()` — the foundation of TipTap's pagination trick
- All existing TipTap extensions (must be reimplemented or replaced)
- ~250 files of TipTap UI code

---

## 2. Architecture Comparison

### TipTap (ProseMirror)

```
Document JSON: { type: "doc", content: [...] }
├── Nodes have: type, attrs, content[], marks[]
├── Text formatting: marks array [{type: "bold"}, {type: "italic"}]
├── Headings: { type: "heading", attrs: { level: 1 }, content: [...] }
├── Lists: { type: "bulletList", content: [{ type: "listItem", content: [...] }] }
├── Images: { type: "image", attrs: { src, alt, title } }
└── Links: marks on text nodes: { type: "link", attrs: { href } }
```

### Lexical

```
Document JSON: { root: { type: "root", children: [...] } }
├── Nodes have: type, children[], format (bitmask), direction, indent, version
├── Text formatting: format bitmask (1=bold, 2=italic, 4=strikethrough, 8=underline, 16=code, 32=subscript, 64=superscript, 128=highlight)
├── Headings: { type: "heading", tag: "h1", children: [...] }
├── Lists: { type: "list", listType: "bullet"|"number"|"check", children: [{ type: "listitem", ... }] }
├── Images: custom DecoratorNode (renders React component)
├── Links: wrapper node { type: "link", url: "...", children: [text nodes] }
└── Every node has: direction, format, indent, version fields
```

### Key Differences

| Feature | TipTap | Lexical |
|---------|--------|---------|
| Root node | `{ type: "doc" }` | `{ root: { type: "root" } }` |
| Children key | `content` | `children` |
| Text formatting | `marks` array | `format` bitmask |
| Links | Mark on text | Wrapper element node |
| Heading level | `attrs.level` | `tag: "h1"` |
| List type | Node type (`bulletList`) | `listType` property |
| Custom nodes | ProseMirror NodeSpec | Class extending `DecoratorNode` |
| DOM control | ProseMirror owns DOM, allows decorations | Lexical owns DOM completely, no foreign elements |
| Plugins | ProseMirror Plugin with state/props | React hooks + `editor.registerCommand()` |

---

## 3. The Pagination Problem & Solution

### Why Previous Attempts Failed

TipTap pagination uses `Decoration.widget(0, ...)` which injects DOM at position 0 in the editor. The injected container uses CSS `float: left; clear: both` with calculated `marginTop` to create page break spacers that push content down.

**This cannot work in Lexical because:**
1. Lexical reconciles its DOM exclusively — any foreign DOM inside `contentEditable` gets removed
2. Lexical has no equivalent to ProseMirror's `Decoration.widget()`
3. MutationObserver to re-insert DOM causes infinite loops

### The Correct Approach: Multi-Page Layout

Instead of one tall contentEditable with injected break markers, use **multiple fixed-height page containers**, each containing a portion of the editor content. This is conceptually how Google Docs works.

**Option A: Single Lexical Editor + CSS Visual Pages (Recommended)**

Use a single Lexical editor instance but wrap it in a layout system that:
1. Applies page dimensions (width, padding) to the editor root via CSS
2. Uses a **read-only overlay layer** (outside the editor DOM) to render page break indicators
3. For print/PDF export, uses `@page` CSS rules and `break-before`/`break-after` properties
4. The overlay measures actual rendered content height and positions break indicators accordingly

```
<div class="page-layout-container">
  <!-- Visual overlay for page breaks (pointer-events: none, absolute positioned) -->
  <div class="page-break-overlay">
    <PageBreakIndicator y={contentHeight * 1} />
    <PageBreakIndicator y={contentHeight * 2} />
    ...
  </div>
  
  <!-- Single Lexical editor, styled with page width/margins -->
  <div class="lexical-editor" style="width: 794px; padding: ...">
    <ContentEditable />
  </div>
</div>
```

**The visual overlay does NOT push content down.** Content flows naturally. The overlay just shows WHERE page breaks will occur in print. This is sufficient for a document editor — the exact print output comes from `@page` CSS rules.

**However**, if content must be visually separated between pages (like Google Docs with visible gaps), we need...

**Option B: Page-Splitting Layout Engine**

A more complex approach that actually splits content across page-height containers:

1. A `PaginationPlugin` React component wraps the editor
2. After each editor update, it measures block-level elements via `editor.getElementByKey()`
3. It determines which blocks fit on each page based on accumulated height
4. It renders a visual "page stack" — each page is a CSS div with fixed height, shadow, and gap
5. The actual content remains in the single Lexical editor; the page dividers are positioned as CSS pseudo-elements or absolute overlays using `clip-path` or `overflow: hidden` segments

**Challenges with Option B:**
- Splitting across a paragraph (text wraps to next page) requires measuring individual line heights
- Images/tables that don't fit on a page need to be pushed to the next
- Performance: measuring hundreds of elements on every keystroke

**Option C: Hybrid — Float-Based Pagination Outside Editor Root**

This was attempted but failed because the float container needs to be INSIDE the editor root's flow context to push content. Lexical removes it.

**However:** If we use a `<div>` wrapper AROUND the Lexical `<ContentEditable>` and make the ContentEditable `display: inline` or `display: contents`, then float elements in the wrapper CAN affect the flow. This needs investigation.

### Recommended: Option A (Visual Overlay) + PDF @page Rules

**Why:**
- Zero DOM conflict with Lexical — overlay is a sibling, not inside the editor
- Simple to implement — just measure content height, draw lines
- PDF export uses CSS `@page` rules which handle actual page breaks perfectly
- No performance issues — overlay recalculates on `requestAnimationFrame` after updates
- Good enough for 99% of use cases — users see where breaks will occur, PDF matches

**What it looks like:**
- Editor is styled with A4/Letter width, white background, border, page margins as padding
- Overlay draws horizontal lines + gap backgrounds at every `contentHeight` interval
- Footer/header text rendered in the overlay at each break
- Min-height on editor ensures at least one page is visible
- Mobile: CSS `transform: scale()` for viewport fitting

**What it doesn't do:**
- Content doesn't "jump" to the next page like Google Docs — it flows continuously
- No visual gap between pages in the editor (but there is in print/PDF)
- This is the same approach as many web editors: Notion, Confluence, etc.

**If you MUST have visible gaps between pages**, Option B is needed. It's significantly more complex (~2000+ lines) but achievable. Decision needed.

---

## 4. Migration Strategy

### Approach: Clean-Room Build

Do NOT convert TipTap code to Lexical. Build fresh:
1. New `components/editor/` directory (lowercase, clean namespace)
2. Use `@lexical/react` components + shadcn/ui for toolbar
3. Use `lucide-react` for icons
4. Build each feature as a self-contained Lexical plugin
5. Delete all `tiptap-*` directories only after Lexical editor is fully working

### Branch Strategy

```
master (86584da) ─── feature/lexical ─── [all work here] ─── merge when ready
```

One branch, incremental commits. Each phase ends with a working build.

---

## 5. Phase 1: Foundation

**Goal:** Empty Lexical editor that renders, saves, loads.

### 5.1 Install Dependencies

```
@lexical/react
lexical
@lexical/rich-text
@lexical/list
@lexical/link
@lexical/code
@lexical/markdown
@lexical/table
@lexical/history
@lexical/selection
@lexical/utils
@lexical/clipboard
```

### 5.2 Create Editor Shell

```
components/editor/
├── Editor.tsx              # Main editor component (replaces notion-editor.tsx)
├── EditorHeader.tsx        # Title bar, save status, layout selector
├── EditorToolbar.tsx       # Formatting toolbar (shadcn buttons)
├── EditorToolbarFloating.tsx # Selection-based floating toolbar
├── editor.css              # All editor styles
├── theme.ts                # Lexical theme (CSS class mappings)
├── plugins/                # Lexical plugins
│   ├── ToolbarPlugin.tsx
│   ├── AutoSavePlugin.tsx
│   ├── PlaceholderPlugin.tsx
│   ├── DragDropPlugin.tsx
│   ├── SlashCommandPlugin.tsx
│   ├── MentionPlugin.tsx
│   ├── EmojiPlugin.tsx
│   ├── PaginationPlugin.tsx
│   ├── AICommandPlugin.tsx
│   ├── PiiHighlightPlugin.tsx
│   └── HistoryPlugin.tsx
├── nodes/                  # Custom Lexical nodes
│   ├── ImageNode.tsx
│   ├── ImageUploadNode.tsx
│   ├── MentionNode.tsx
│   ├── EmojiNode.tsx
│   ├── HorizontalRuleNode.tsx
│   ├── MathNode.tsx
│   ├── ProcessRecordingNode.tsx
│   ├── PageBreakNode.tsx
│   ├── ButtonNode.tsx
│   ├── CardListNode.tsx
│   ├── DataTableNode.tsx
│   ├── HeroNode.tsx
│   └── VariableNode.tsx
└── utils/
    ├── editorUtils.ts
    └── formatUtils.ts
```

### 5.3 Basic Editor Component

```tsx
// components/editor/Editor.tsx
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { editorTheme } from './theme';
import { editorNodes } from './nodes';

function Editor({ docId }) {
  const initialConfig = {
    namespace: 'OndokiEditor',
    theme: editorTheme,
    nodes: editorNodes,
    onError: (error) => console.error(error),
  };
  
  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-container">
        <ToolbarPlugin />
        <div className="editor-content-area">
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            placeholder={<div className="editor-placeholder">Start writing...</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <AutoSavePlugin docId={docId} />
      </div>
    </LexicalComposer>
  );
}
```

### 5.4 Deliverables
- [ ] Lexical packages installed
- [ ] Empty editor renders in browser
- [ ] Can type text, undo/redo works
- [ ] Save/load round-trips to API (with new JSON format)
- [ ] Build passes

---

## 6. Phase 2: Core Editor

**Goal:** Rich text editing with all standard formatting.

### 6.1 Rich Text Features

| Feature | Lexical Implementation |
|---------|----------------------|
| Bold/Italic/Underline/Strikethrough | Built-in `FORMAT_TEXT_COMMAND` with format bitmask |
| Headings (H1-H6) | `@lexical/rich-text` HeadingNode |
| Bullet/Ordered/Task Lists | `@lexical/list` ListNode + ListItemNode + CheckListPlugin |
| Blockquote | `@lexical/rich-text` QuoteNode |
| Code blocks | `@lexical/code` CodeNode + CodeHighlightNode |
| Inline code | Text format bitmask bit 16 |
| Horizontal rule | Custom DecoratorNode (see Lexical playground) |
| Links | `@lexical/link` LinkNode + AutoLinkPlugin |
| Text alignment | Paragraph/Heading format property |
| Subscript/Superscript | Text format bitmask bits 32/64 |
| Text color | Custom TextNode extension or marks |
| Highlight | Text format bitmask bit 128 OR custom mark |
| Typography (smart quotes) | Custom plugin listening to text input |

### 6.2 Toolbar

Build with **shadcn/ui components** and **lucide-react icons**:

```tsx
// components/editor/plugins/ToolbarPlugin.tsx
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { Bold, Italic, Underline, Strikethrough, ... } from 'lucide-react';

// Use editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold') etc.
```

### 6.3 Floating Toolbar

Selection-based toolbar using `@lexical/react`'s DOM range utilities:
- Get selection rect via `$getSelection()` → `editor.getElementByKey()` → `getBoundingClientRect()`
- Position a Radix Popover at the selection
- Show formatting buttons for the selection context

### 6.4 Deliverables
- [ ] All standard formatting works (bold, italic, etc.)
- [ ] Headings H1-H6 with toolbar dropdown
- [ ] Lists (bullet, ordered, task)
- [ ] Code blocks with syntax highlighting
- [ ] Links (create, edit, remove)
- [ ] Text alignment
- [ ] Toolbar with shadcn buttons and lucide icons
- [ ] Floating selection toolbar
- [ ] Keyboard shortcuts (Cmd+B, etc.)
- [ ] Build passes

---

## 7. Phase 3: Custom Nodes

**Goal:** Implement all custom nodes from the TipTap editor.

### 7.1 Image Node (DecoratorNode)

```tsx
class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __alt: string;
  __width: number | 'inherit';
  __height: number | 'inherit';
  
  decorate(): JSX.Element {
    return <ImageComponent src={this.__src} alt={this.__alt} ... />;
  }
}
```

### 7.2 Image Upload Node (DecoratorNode)

Dropzone → upload → replace with ImageNode. Same pattern as TipTap version but using Lexical's node replacement API.

### 7.3 Mention Node

Lexical has no built-in mention. Use `@lexical/react`'s `LexicalTypeaheadMenuPlugin` for the suggestion popup, and a custom `MentionNode extends TextNode` for the rendered mention.

### 7.4 Emoji Node

Use Lexical's TextNode with custom rendering, or a DecoratorNode for emoji images.

### 7.5 Math Node

DecoratorNode that renders KaTeX. Requires input mode (editing formula) and display mode (rendered).

### 7.6 Table

`@lexical/table` provides TableNode, TableRowNode, TableCellNode. Has built-in table selection, resize, etc.

### 7.7 Custom Business Nodes

These are all DecoratorNodes that render React components:
- **ProcessRecordingNode** — renders a workflow recording
- **ButtonNode** — renders a clickable button
- **CardListNode** — renders a card layout
- **DataTableNode** — renders a data table from API
- **HeroNode** — renders a hero section
- **VariableNode** — renders an insertable variable

### 7.8 Deliverables
- [ ] Image display and upload
- [ ] Mentions with suggestion popup
- [ ] Emoji picker
- [ ] Math/LaTeX rendering
- [ ] Tables with resize
- [ ] All custom business nodes
- [ ] Build passes

---

## 8. Phase 4: UI Components

**Goal:** Replace all TipTap UI with shadcn + custom components.

### 8.1 Slash Command Menu

Lexical has `LexicalTypeaheadMenuPlugin` which provides the same "/" trigger behavior. Build the dropdown UI with shadcn `Command` component.

### 8.2 Drag Handle / Context Menu

Use Lexical's `LexicalDraggableBlockPlugin` (built-in) for drag handles. Context menu uses shadcn `DropdownMenu`.

### 8.3 Color Pickers

Radix Popover + color grid. Same UI as current but built with shadcn primitives.

### 8.4 Mobile Toolbar

Bottom-pinned toolbar with shadcn buttons. Same concept, different components.

### 8.5 Deliverables
- [ ] Slash command menu with all items
- [ ] Drag handles + context menu
- [ ] Color text/highlight pickers
- [ ] Mobile toolbar
- [ ] Theme toggle
- [ ] All keyboard shortcuts
- [ ] Build passes

---

## 9. Phase 5: Backend Migration

**Goal:** Backend accepts and processes Lexical JSON.

### 9.1 Validation (document.py:254)

```python
# OLD (TipTap)
if not isinstance(payload.content, dict) or payload.content.get("type") != "doc":
    raise HTTPException(422, "Invalid document content")

# NEW (Lexical)  
root = payload.content.get("root", {})
if not isinstance(root, dict) or root.get("type") != "root":
    raise HTTPException(422, "Invalid document content: must have root.type='root'")
```

### 9.2 Text Extraction

All three text extraction functions need updating:
- `api/app/routers/chat.py:_extract_tiptap_text()` → `_extract_lexical_text()`
- `api/app/routers/search.py:_extract_tiptap_text()` → `_extract_lexical_text()`
- `api/app/services/search_indexer.py:extract_tiptap_text()` → `extract_lexical_text()`

```python
def extract_lexical_text(content) -> str:
    """Extract text from Lexical JSON."""
    if isinstance(content, str):
        return content
    if not isinstance(content, dict):
        return ""
    
    texts = []
    # Handle root wrapper
    if content.get("type") == "root" or "root" in content:
        node = content.get("root", content)
    else:
        node = content
    
    if node.get("type") == "text":
        return node.get("text", "")
    
    for child in node.get("children", []):
        texts.append(extract_lexical_text(child))
    
    return " ".join(t for t in texts if t)
```

### 9.3 Export Functions (document_export.py — 1047 lines)

This is the largest backend change. The export system assumes TipTap JSON structure throughout.

**Strategy: Normalize at entry points.**

Write a `lexical_to_tiptap(content)` converter that transforms Lexical JSON to TipTap-like tree structure. This lets us keep all existing export code (markdown, HTML, PDF, DOCX, Confluence) unchanged.

```python
def lexical_to_tiptap(content: dict) -> dict:
    """Convert Lexical JSON to TipTap-compatible structure for export."""
    root = content.get("root", content)
    return {
        "type": "doc",
        "content": [convert_lexical_node(child) for child in root.get("children", [])]
    }

def convert_lexical_node(node: dict) -> dict:
    node_type = node.get("type", "")
    
    if node_type == "text":
        marks = []
        fmt = node.get("format", 0)
        if fmt & 1: marks.append({"type": "bold"})
        if fmt & 2: marks.append({"type": "italic"})
        if fmt & 4: marks.append({"type": "strike"})
        if fmt & 8: marks.append({"type": "underline"})
        if fmt & 16: marks.append({"type": "code"})
        # ... etc
        result = {"type": "text", "text": node.get("text", "")}
        if marks: result["marks"] = marks
        return result
    
    if node_type == "heading":
        tag = node.get("tag", "h1")
        level = int(tag[1]) if len(tag) == 2 else 1
        return {
            "type": "heading",
            "attrs": {"level": level},
            "content": [convert_lexical_node(c) for c in node.get("children", [])]
        }
    
    # ... handle all node types
```

### 9.4 AI Tools

- `api/app/services/ai_tools/create_page.py:_text_to_tiptap()` → `_text_to_lexical()`
- `api/app/services/ai_tools/rag_search.py` — uses `tiptap_to_markdown` (keep via normalizer)
- `api/app/services/ai_tools/read_document.py` — same

### 9.5 Deliverables
- [ ] Document validation accepts Lexical JSON
- [ ] Text extraction works for search/chat/indexing
- [ ] All exports (markdown, HTML, PDF, DOCX) work via normalizer
- [ ] AI tools generate valid Lexical JSON
- [ ] Existing documents continue to work (backward compat or migration)

---

## 10. Phase 6: Pagination

**Goal:** Visual page breaks matching PDF export.

### 10.1 Implementation (Option A: Visual Overlay)

```tsx
// components/editor/plugins/PaginationPlugin.tsx

function PaginationPlugin({ pageFormat, enabled }: Props) {
  const [editor] = useLexicalComposerContext();
  const overlayRef = useRef<HTMLDivElement>(null);
  
  // Style editor root with page dimensions
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root || !enabled) return;
    root.style.width = `${format.width}px`;
    root.style.margin = '0 auto';
    root.style.backgroundColor = '#fff';
    root.style.border = '1px solid #e5e5e5';
    root.style.padding = `${format.margins.top}px ${format.margins.right}px ${format.margins.bottom}px ${format.margins.left}px`;
  }, [editor, enabled, format]);
  
  // Calculate page breaks based on content height
  const updateOverlay = useCallback(() => {
    const root = editor.getRootElement();
    if (!root || !overlayRef.current) return;
    
    const contentHeight = format.height - format.margins.top - format.margins.bottom;
    const scrollHeight = root.scrollHeight;
    const pageCount = Math.ceil(scrollHeight / contentHeight);
    
    // Render break indicators in overlay
    // Position them at contentHeight intervals
  }, [editor, format]);
  
  // Listen for updates
  useEffect(() => {
    return editor.registerUpdateListener(() => {
      requestAnimationFrame(updateOverlay);
    });
  }, [editor, updateOverlay]);
  
  // Render overlay as sibling of editor
  return (
    <div ref={overlayRef} className="pagination-overlay" style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      pointerEvents: 'none', zIndex: 5,
    }}>
      {/* Page break indicators rendered here */}
    </div>
  );
}
```

### 10.2 CSS @page Rules for Print/PDF

```css
@media print {
  .editor-input {
    width: auto !important;
    border: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  
  @page {
    size: A4;
    margin: 2.5cm 2cm;
  }
}
```

### 10.3 PDF Export

The backend already handles PDF generation. The HTML export function generates page-aware HTML. With `@page` CSS rules in the HTML template, the PDF engine (WeasyPrint/wkhtmltopdf) handles actual page breaks.

### 10.4 Deliverables
- [ ] Editor shows page dimensions (width, background, border)
- [ ] Visual indicators show where page breaks occur
- [ ] A4 and Letter formats work
- [ ] Mobile scaling works
- [ ] PDF export has correct page breaks
- [ ] Page format switching works

---

## 11. Phase 7: AI & Advanced Features

**Goal:** All AI and advanced features working.

### 11.1 AI Inline Write

Plugin that listens for a custom command, shows an AI writing panel at cursor position, streams text from `/chat/inline` SSE endpoint, and inserts result into the editor.

### 11.2 PII Highlight

Plugin that sends content to `/api/v1/privacy/analyze`, receives PII spans, and applies highlight formatting to matching text ranges.

### 11.3 Mention Suggestion

`LexicalTypeaheadMenuPlugin` + API call for suggestions.

### 11.4 Auto-Save

Plugin that debounces editor changes and calls the save API. Same logic as current `useDocumentAutoSave.ts`, just using Lexical's `registerUpdateListener`.

### 11.5 Text Container Insert

Same as current — fetch container content, convert to Lexical JSON, insert via `editor.update()`.

### 11.6 Deliverables
- [ ] AI inline write works with SSE streaming
- [ ] PII detection and highlighting
- [ ] Mentions with API suggestions
- [ ] Auto-save with conflict detection
- [ ] Text container insertion
- [ ] Build passes

---

## 12. Phase 8: Testing & Cleanup

### 12.1 Testing Checklist

- [ ] Create new document → type → save → reload → content preserved
- [ ] All formatting: bold, italic, underline, strikethrough, code, subscript, superscript
- [ ] Headings H1-H6
- [ ] Bullet, ordered, task lists (nested)
- [ ] Code blocks
- [ ] Links (create, edit, click)
- [ ] Images (upload, display, resize)
- [ ] Tables (create, edit, add/remove rows/cols)
- [ ] Horizontal rule
- [ ] Mentions
- [ ] Emoji
- [ ] Math/LaTeX
- [ ] Slash command menu
- [ ] Drag handle + context menu
- [ ] Undo/redo
- [ ] Keyboard shortcuts
- [ ] Large document (paste 10+ pages of text)
- [ ] Export: Markdown, HTML, PDF, DOCX
- [ ] AI inline write
- [ ] Auto-save + conflict detection
- [ ] Mobile toolbar + responsive scaling
- [ ] A4/Letter pagination visual
- [ ] Theme toggle (dark/light)
- [ ] Read-only mode
- [ ] Public shared documents

### 12.2 Cleanup

- [ ] Delete all `tiptap-*` directories
- [ ] Delete `tiptap-renderer.tsx`
- [ ] Remove all `@tiptap/*` packages from package.json
- [ ] Delete `hooks/use-tiptap-editor.ts`
- [ ] Delete `lib/tiptap-utils.ts`, `lib/tiptap-advanced-utils.ts`, `lib/tiptap-collab-utils.ts`
- [ ] Update Docker to install new deps
- [ ] Final build + test

---

## 13. Risk Assessment

### High Risk
- **Pagination visual quality** — overlay approach won't match TipTap's float trick visually. Content won't have gaps between pages. Acceptable trade-off?
- **Export compatibility** — The `lexical_to_tiptap()` normalizer must handle ALL node types. Missing a node type breaks exports silently.
- **Large documents** — Lexical handles large docs well, but our custom plugins (pagination measurement, PII highlight) could cause performance issues.

### Medium Risk
- **Custom nodes** — Each custom node (ButtonNode, CardListNode, etc.) needs individual porting. Some may have TipTap-specific behavior that doesn't translate directly.
- **Table editing** — Lexical's table is less mature than ProseMirror's. Column resize, cell merging may need custom work.
- **Math rendering** — Need to verify KaTeX integration with Lexical DecoratorNode.

### Low Risk
- **Standard formatting** — Lexical handles this natively, well-tested.
- **Save/load** — JSON format change is straightforward.
- **Toolbar** — UI-only, no editor coupling.

---

## 14. File Inventory

### Files to CREATE (new Lexical editor)

```
components/editor/Editor.tsx
components/editor/EditorHeader.tsx
components/editor/EditorToolbar.tsx
components/editor/EditorToolbarFloating.tsx
components/editor/MobileToolbar.tsx
components/editor/TextContainerEditor.tsx
components/editor/editor.css
components/editor/theme.ts
components/editor/plugins/AutoSavePlugin.tsx
components/editor/plugins/DragDropPlugin.tsx
components/editor/plugins/SlashCommandPlugin.tsx
components/editor/plugins/MentionPlugin.tsx
components/editor/plugins/EmojiPlugin.tsx
components/editor/plugins/PaginationPlugin.tsx
components/editor/plugins/AICommandPlugin.tsx
components/editor/plugins/PiiHighlightPlugin.tsx
components/editor/plugins/FloatingToolbarPlugin.tsx
components/editor/plugins/ColorPlugin.tsx
components/editor/plugins/MathPlugin.tsx
components/editor/nodes/ImageNode.tsx
components/editor/nodes/ImageUploadNode.tsx
components/editor/nodes/MentionNode.tsx
components/editor/nodes/EmojiNode.tsx
components/editor/nodes/HorizontalRuleNode.tsx
components/editor/nodes/MathNode.tsx
components/editor/nodes/ProcessRecordingNode.tsx
components/editor/nodes/PageBreakNode.tsx
components/editor/nodes/ButtonNode.tsx
components/editor/nodes/CardListNode.tsx
components/editor/nodes/DataTableNode.tsx
components/editor/nodes/HeroNode.tsx
components/editor/nodes/VariableNode.tsx
components/editor/utils/editorUtils.ts
components/editor/utils/formatUtils.ts
components/editor/hooks/useEditor.ts
components/editor/hooks/useAutoSave.ts
```

### Files to MODIFY (backend)

```
api/app/routers/document.py        # Validation (line 254)
api/app/routers/chat.py            # Text extraction
api/app/routers/search.py          # Text extraction
api/app/services/search_indexer.py  # Text extraction
api/app/services/indexer.py         # Uses tiptap_to_markdown
api/app/document_export.py          # Add normalize_content() at entry points
api/app/services/ai_tools/create_page.py  # Generate Lexical JSON
```

### Files to DELETE (after migration complete)

```
components/tiptap-extensions/      # 9 files
components/tiptap-icons/           # 73 files
components/tiptap-node/            # ~30 files
components/tiptap-templates/       # 16 files
components/tiptap-ui/              # ~80 files
components/tiptap-ui-primitive/    # ~30 files
components/tiptap-ui-utils/        # 3 files
components/tiptap-renderer.tsx     # 1 file
hooks/use-tiptap-editor.ts         # 1 file
lib/tiptap-utils.ts                # 1 file
lib/tiptap-advanced-utils.ts       # 1 file
lib/tiptap-collab-utils.ts         # 1 file
```

Total: ~250 files deleted, ~40 files created, ~7 files modified.

### Consumer Files to UPDATE

```
main.tsx                           # Editor imports
pages/EditorPage.tsx               # Editor component
pages/TextContainerPage.tsx        # Text container editor
pages/public-document.tsx          # Public read-only editor
components/site-header.tsx         # Theme toggle
contexts/ai-context.tsx            # Collab utils
contexts/user-context.tsx          # Collab utils
```

---

## Decision Required

**Before proceeding, choose:**

1. **Pagination approach:**
   - **A) Visual overlay** (recommended) — indicators show where breaks occur, no content gaps. PDF uses `@page` CSS.
   - **B) Page-splitting engine** — actual visual gaps between pages. Complex (~2000+ lines). Google Docs style.

2. **Backward compatibility:**
   - **A) No backward compat** — new documents use Lexical JSON. Old TipTap docs won't load.
   - **B) Read-time conversion** — backend converts old TipTap docs to Lexical JSON on read.
   - **C) One-time migration** — script converts all existing documents in DB.

3. **Timeline:**
   - Phases 1-4 (working editor): ~3-5 days intensive work
   - Phase 5 (backend): ~1 day
   - Phase 6 (pagination): ~1-2 days
   - Phase 7 (AI/advanced): ~2-3 days
   - Phase 8 (testing/cleanup): ~1-2 days
   - **Total: ~8-13 days**

---

*This document will be updated as decisions are made and work progresses.*
