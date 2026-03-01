import * as React from 'react';
import { useCallback, useState, useMemo } from 'react';
import { useCurrentEditor } from '@tiptap/react';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  GripVertical, Plus,
  Type, Heading1, Heading2, Heading3,
  List, ListOrdered, ListTodo, TextQuote, FileCode,
  Copy, CopyPlus, Trash2, RemoveFormatting,
  Palette, Highlighter, ImageDown, Repeat2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Menu item types — use these to build per-node-type menus
// ---------------------------------------------------------------------------

/** A simple clickable menu item. */
export type DragMenuItem = {
  kind: 'item';
  key: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  destructive?: boolean;
  action: (ctx: DragMenuContext) => void;
};

/** A visual separator. */
export type DragMenuSeparator = { kind: 'separator'; key: string };

/** A custom render slot (for color pickers, sub-menus, etc.). */
export type DragMenuCustom = {
  kind: 'custom';
  key: string;
  render: (ctx: DragMenuContext) => React.ReactNode;
};

export type DragMenuEntry = DragMenuItem | DragMenuSeparator | DragMenuCustom;

/** Context passed to every menu item action / render function. */
export type DragMenuContext = {
  editor: Editor;
  node: PMNode | null;
  nodePos: number;
};

// ---------------------------------------------------------------------------
// Colors (same as FloatingToolbar)
// ---------------------------------------------------------------------------
const TEXT_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Red', value: '#e11d48' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Yellow', value: '#ca8a04' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Purple', value: '#9333ea' },
  { label: 'Pink', value: '#db2777' },
  { label: 'Gray', value: '#6b7280' },
];

const HIGHLIGHT_COLORS = [
  { label: 'None', value: '' },
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Blue', value: '#bfdbfe' },
  { label: 'Purple', value: '#e9d5ff' },
  { label: 'Pink', value: '#fce7f3' },
  { label: 'Red', value: '#fecaca' },
  { label: 'Orange', value: '#fed7aa' },
  { label: 'Gray', value: '#e5e7eb' },
];

// ---------------------------------------------------------------------------
// Node name helper
// ---------------------------------------------------------------------------
const NODE_DISPLAY_NAMES: Record<string, string | ((node: PMNode) => string)> = {
  paragraph: 'Paragraph',
  heading: (n) => `Heading ${n.attrs?.level || ''}`,
  bulletList: 'Bullet List',
  orderedList: 'Ordered List',
  taskList: 'Task List',
  blockquote: 'Blockquote',
  codeBlock: 'Code Block',
  image: 'Image',
  imageUpload: 'Image',
  resizableImage: 'Image',
  horizontalRule: 'Divider',
  table: 'Table',
};

function getNodeLabel(node: PMNode | null): string {
  if (!node) return 'Block';
  const entry = NODE_DISPLAY_NAMES[node.type.name];
  if (typeof entry === 'function') return entry(node);
  return entry || node.type.name;
}

// ---------------------------------------------------------------------------
// Reusable menu actions
// ---------------------------------------------------------------------------

function copyAction(ctx: DragMenuContext) {
  const { editor } = ctx;
  const { from, to } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, '\n');
  navigator.clipboard.writeText(text);
}

function duplicateAction({ editor, nodePos }: DragMenuContext) {
  if (nodePos < 0) return;
  const resolvedPos = editor.state.doc.resolve(nodePos);
  const nodeAfter = resolvedPos.nodeAfter;
  if (!nodeAfter) return;
  const endOfNode = nodePos + nodeAfter.nodeSize;
  const nodeJSON = nodeAfter.toJSON();
  if (nodeJSON) {
    editor.chain().focus().insertContentAt(endOfNode, nodeJSON).run();
  }
}

function deleteAction({ editor, nodePos }: DragMenuContext) {
  if (nodePos < 0) return;
  const resolvedPos = editor.state.doc.resolve(nodePos);
  const nodeAfter = resolvedPos.nodeAfter;
  if (nodeAfter) {
    editor.chain().focus().deleteRange({ from: nodePos, to: nodePos + nodeAfter.nodeSize }).run();
  }
}

function clearFormattingAction({ editor, nodePos }: DragMenuContext) {
  if (nodePos < 0) return;
  const resolvedPos = editor.state.doc.resolve(nodePos);
  const nodeAfter = resolvedPos.nodeAfter;
  if (nodeAfter && nodeAfter.isTextblock) {
    editor.chain().focus()
      .setTextSelection({ from: nodePos + 1, to: nodePos + nodeAfter.nodeSize - 1 })
      .unsetAllMarks()
      .clearNodes()
      .run();
  } else {
    editor.chain().focus().clearNodes().unsetAllMarks().run();
  }
}

function downloadImageAction({ node }: DragMenuContext) {
  const src = node?.attrs?.src;
  if (!src) return;
  const a = document.createElement('a');
  a.href = src;
  a.download = 'image';
  a.click();
}

// ---------------------------------------------------------------------------
// Pre-built entry constants
// ---------------------------------------------------------------------------

const COPY_ENTRY: DragMenuItem = {
  kind: 'item', key: 'copy', label: 'Copy', icon: Copy, shortcut: '⌘C',
  action: copyAction,
};

const DUPLICATE_ENTRY: DragMenuItem = {
  kind: 'item', key: 'duplicate', label: 'Duplicate', icon: CopyPlus, shortcut: '⌘D',
  action: duplicateAction,
};

const DELETE_ENTRY: DragMenuItem = {
  kind: 'item', key: 'delete', label: 'Delete', icon: Trash2, shortcut: 'Del',
  destructive: true, action: deleteAction,
};

const CLEAR_FORMATTING_ENTRY: DragMenuItem = {
  kind: 'item', key: 'clearFormatting', label: 'Clear formatting', icon: RemoveFormatting,
  action: clearFormattingAction,
};

const DOWNLOAD_IMAGE_ENTRY: DragMenuItem = {
  kind: 'item', key: 'downloadImage', label: 'Download image', icon: ImageDown,
  action: downloadImageAction,
};

const SEP = (id: string): DragMenuSeparator => ({ kind: 'separator', key: id });

const COLOR_ENTRY: DragMenuCustom = {
  kind: 'custom',
  key: 'color',
  render: (ctx) => <ColorSubMenu ctx={ctx} />,
};

const TURN_INTO_ENTRY: DragMenuCustom = {
  kind: 'custom',
  key: 'turnInto',
  render: (ctx) => <TurnIntoSubMenu ctx={ctx} />,
};

// ---------------------------------------------------------------------------
// Per-node-type menu configurations
//
// To customise the drag-handle menu for a node type:
//   1. Add a new key matching the TipTap node name
//   2. Compose entries from the constants above or create new ones
//
// The 'default' key is the fallback for any unregistered node type.
// ---------------------------------------------------------------------------

const NODE_MENU_CONFIG: Record<string, DragMenuEntry[]> = {
  // Text-like nodes get the full menu
  default: [
    COLOR_ENTRY,
    TURN_INTO_ENTRY,
    CLEAR_FORMATTING_ENTRY,
    SEP('s1'),
    COPY_ENTRY,
    DUPLICATE_ENTRY,
    SEP('s2'),
    DELETE_ENTRY,
  ],

  // Images — no color/turn-into/clear-formatting; add download
  // Future image-specific actions (alt text, resize, replace, etc.) go here
  image: [
    DOWNLOAD_IMAGE_ENTRY,
    SEP('s1'),
    COPY_ENTRY,
    DUPLICATE_ENTRY,
    SEP('s2'),
    DELETE_ENTRY,
  ],

  imageUpload: [
    DOWNLOAD_IMAGE_ENTRY,
    SEP('s1'),
    COPY_ENTRY,
    DUPLICATE_ENTRY,
    SEP('s2'),
    DELETE_ENTRY,
  ],

  resizableImage: [
    DOWNLOAD_IMAGE_ENTRY,
    SEP('s1'),
    COPY_ENTRY,
    DUPLICATE_ENTRY,
    SEP('s2'),
    DELETE_ENTRY,
  ],

  // Horizontal rule — just duplicate/delete
  horizontalRule: [
    COPY_ENTRY,
    DUPLICATE_ENTRY,
    SEP('s1'),
    DELETE_ENTRY,
  ],
};

/** Get the menu entries for a given node type. */
function getMenuEntries(node: PMNode | null): DragMenuEntry[] {
  const typeName = node?.type.name || 'default';
  return NODE_MENU_CONFIG[typeName] || NODE_MENU_CONFIG.default;
}

// ---------------------------------------------------------------------------
// Sub-menu components
// ---------------------------------------------------------------------------

function ColorSubMenu({ ctx }: { ctx: DragMenuContext }) {
  const { editor, nodePos } = ctx;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette className="mr-2 h-4 w-4" /> Color
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56 p-2">
        <p className="px-2 py-1 text-xs text-muted-foreground font-medium">Text color</p>
        <div className="grid grid-cols-5 gap-1.5 px-2 pb-2">
          {TEXT_COLORS.map((c) => (
            <button
              key={`text-${c.value || 'default'}`}
              title={c.label}
              className="h-6 w-6 rounded-full border-2 border-transparent hover:border-ring transition-all hover:scale-110"
              style={{ backgroundColor: c.value || 'currentColor' }}
              onClick={() => {
                if (nodePos >= 0) {
                  const resolvedPos = editor.state.doc.resolve(nodePos);
                  const nodeAfter = resolvedPos.nodeAfter;
                  if (nodeAfter) {
                    editor.chain().focus()
                      .setTextSelection({ from: nodePos + 1, to: nodePos + nodeAfter.nodeSize - 1 })
                      .run();
                  }
                }
                if (c.value) editor.chain().focus().setColor(c.value).run();
                else editor.chain().focus().unsetColor().run();
              }}
            />
          ))}
        </div>
        <DropdownMenuSeparator />
        <p className="px-2 py-1 text-xs text-muted-foreground font-medium">Highlight</p>
        <div className="grid grid-cols-5 gap-1.5 px-2 pb-1">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={`hl-${c.value || 'none'}`}
              title={c.label}
              className={cn(
                'h-6 w-6 rounded-full border-2 border-transparent hover:border-ring transition-all hover:scale-110',
                c.value === '' && 'flex items-center justify-center',
              )}
              style={{ backgroundColor: c.value || '#f3f4f6' }}
              onClick={() => {
                if (nodePos >= 0) {
                  const resolvedPos = editor.state.doc.resolve(nodePos);
                  const nodeAfter = resolvedPos.nodeAfter;
                  if (nodeAfter) {
                    editor.chain().focus()
                      .setTextSelection({ from: nodePos + 1, to: nodePos + nodeAfter.nodeSize - 1 })
                      .run();
                  }
                }
                if (c.value) editor.chain().focus().toggleHighlight({ color: c.value }).run();
                else editor.chain().focus().unsetHighlight().run();
              }}
            >
              {c.value === '' && <X className="h-3 w-3 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function TurnIntoSubMenu({ ctx }: { ctx: DragMenuContext }) {
  const { editor } = ctx;
  const turnInto = (type: string, attrs?: Record<string, any>) => {
    const chain = editor.chain().focus();
    switch (type) {
      case 'paragraph': chain.setParagraph().run(); break;
      case 'heading': chain.toggleHeading({ level: attrs?.level || 1 }).run(); break;
      case 'bulletList': chain.toggleBulletList().run(); break;
      case 'orderedList': chain.toggleOrderedList().run(); break;
      case 'taskList': chain.toggleTaskList().run(); break;
      case 'blockquote': chain.toggleBlockquote().run(); break;
      case 'codeBlock': chain.toggleCodeBlock().run(); break;
    }
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Repeat2 className="mr-2 h-4 w-4" /> Turn into
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44">
        <DropdownMenuItem onClick={() => turnInto('paragraph')}>
          <Type className="mr-2 h-4 w-4" /> Text
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => turnInto('heading', { level: 1 })}>
          <Heading1 className="mr-2 h-4 w-4" /> Heading 1
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => turnInto('heading', { level: 2 })}>
          <Heading2 className="mr-2 h-4 w-4" /> Heading 2
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => turnInto('heading', { level: 3 })}>
          <Heading3 className="mr-2 h-4 w-4" /> Heading 3
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => turnInto('bulletList')}>
          <List className="mr-2 h-4 w-4" /> Bullet List
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => turnInto('orderedList')}>
          <ListOrdered className="mr-2 h-4 w-4" /> Ordered List
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => turnInto('taskList')}>
          <ListTodo className="mr-2 h-4 w-4" /> Task List
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => turnInto('blockquote')}>
          <TextQuote className="mr-2 h-4 w-4" /> Blockquote
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => turnInto('codeBlock')}>
          <FileCode className="mr-2 h-4 w-4" /> Code Block
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

// ---------------------------------------------------------------------------
// Menu entry renderer
// ---------------------------------------------------------------------------

function renderEntry(entry: DragMenuEntry, ctx: DragMenuContext) {
  switch (entry.kind) {
    case 'separator':
      return <DropdownMenuSeparator key={entry.key} />;
    case 'custom':
      return <React.Fragment key={entry.key}>{entry.render(ctx)}</React.Fragment>;
    case 'item':
      return (
        <DropdownMenuItem
          key={entry.key}
          onClick={() => entry.action(ctx)}
          className={entry.destructive ? 'text-destructive focus:text-destructive' : undefined}
        >
          <entry.icon className="mr-2 h-4 w-4" /> {entry.label}
          {entry.shortcut && (
            <span className="ml-auto text-xs text-muted-foreground">{entry.shortcut}</span>
          )}
        </DropdownMenuItem>
      );
  }
}

// ---------------------------------------------------------------------------
// DragMenu
// ---------------------------------------------------------------------------

export function DragMenu() {
  const { editor } = useCurrentEditor();
  const [open, setOpen] = useState(false);
  const [node, setNode] = useState<PMNode | null>(null);
  const [nodePos, setNodePos] = useState(-1);

  const handleNodeChange = useCallback((data: { node: PMNode | null; pos: number }) => {
    if (data.node) setNode(data.node);
    setNodePos(data.pos);

    // Align the drag handle with the first line of the hovered block.
    if (data.pos >= 0 && editor) {
      requestAnimationFrame(() => {
        try {
          const dom = editor.view.nodeDOM(data.pos) as HTMLElement | null;
          if (!dom) return;

          const handleEl = editor.view.dom.parentElement?.querySelector('.drag-handle') as HTMLElement | null;
          if (!handleEl) return;

          const firstContent = dom.querySelector('li, p, code, h1, h2, h3, h4, h5, h6') || dom;
          const domRect = dom.getBoundingClientRect();
          const contentRect = firstContent.getBoundingClientRect();
          const topDelta = contentRect.top - domRect.top;

          const style = window.getComputedStyle(firstContent);
          const lh = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 || 24;

          const handleH = 24;
          const shift = topDelta + (lh / 2) - (handleH / 2);

          handleEl.style.paddingTop = `${Math.round(Math.max(0, shift))}px`;
        } catch {
          // ignore
        }
      });
    }
  }, [editor]);

  // Lock drag handle when menu is open
  React.useEffect(() => {
    if (!editor) return;
    try {
      editor.commands.setLockDragHandle(open);
    } catch {
      // Extension might not support this command
    }
  }, [editor, open]);

  const handleSlashInsert = useCallback(() => {
    if (!editor || nodePos < 0) return;
    const pos = nodePos + (node?.nodeSize || 1);
    editor.chain().focus().insertContentAt(pos, { type: 'paragraph' }).run();
    setTimeout(() => {
      editor.chain().focus().insertContent('/').run();
    }, 50);
  }, [editor, nodePos, node]);

  const menuEntries = useMemo(() => getMenuEntries(node), [node]);

  if (!editor) return null;

  const { from, to, empty } = editor.state.selection;
  const hasTextSelection = from !== to && !empty;

  const ctx: DragMenuContext = { editor, node, nodePos };

  return (
    <DragHandle
      editor={editor}
      onNodeChange={handleNodeChange}
    >
      <div
        className="flex items-center gap-0.5"
        style={hasTextSelection ? { opacity: 0, pointerEvents: 'none' } : {}}
      >
        {/* + Button (slash command trigger) */}
        <button
          className="flex h-6 w-6 items-center justify-center rounded-sm border border-transparent text-muted-foreground/60 hover:border-border hover:bg-accent hover:text-foreground transition-all"
          onClick={handleSlashInsert}
          title="Add block below"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        {/* Drag handle + context menu */}
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-6 w-6 cursor-grab items-center justify-center rounded-sm border border-transparent text-muted-foreground/60 hover:border-border hover:bg-accent hover:text-foreground active:cursor-grabbing transition-all"
              onMouseDown={() => {
                if (editor && nodePos >= 0) {
                  editor.commands.setNodeSelection(nodePos);
                }
              }}
              title="Drag to move · Click for options"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {/* Node label */}
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              {getNodeLabel(node)}
            </DropdownMenuLabel>

            {menuEntries.map((entry) => renderEntry(entry, ctx))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </DragHandle>
  );
}
