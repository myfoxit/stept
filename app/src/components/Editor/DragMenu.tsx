import * as React from 'react';
import { useCallback, useState } from 'react';
import { useCurrentEditor } from '@tiptap/react';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { offset } from '@floating-ui/react';
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
import { cn } from '@/lib/utils';

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
function getNodeDisplayName(editor: any): string {
  const { selection } = editor.state;
  const node = selection.$from.parent;
  const names: Record<string, string> = {
    paragraph: 'Paragraph',
    heading: `Heading ${node.attrs?.level || ''}`,
    bulletList: 'Bullet List',
    orderedList: 'Ordered List',
    taskList: 'Task List',
    blockquote: 'Blockquote',
    codeBlock: 'Code Block',
    image: 'Image',
    imageUpload: 'Image',
    horizontalRule: 'Divider',
    table: 'Table',
  };
  return names[node.type.name] || node.type.name;
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
  }, []);

  // Lock drag handle when menu is open
  React.useEffect(() => {
    if (!editor) return;
    try {
      editor.commands.setLockDragHandle(open);
    } catch {
      // Extension might not support this command
    }
  }, [editor, open]);

  const turnInto = useCallback(
    (type: string, attrs?: Record<string, any>) => {
      if (!editor) return;
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
    },
    [editor],
  );

  const copyToClipboard = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n');
    navigator.clipboard.writeText(text);
  }, [editor]);

  const duplicateNode = useCallback(() => {
    if (!editor || nodePos < 0 || !node) return;
    // Get the full node at the tracked position and insert a copy after it
    const resolvedPos = editor.state.doc.resolve(nodePos);
    const endOfNode = nodePos + (resolvedPos.nodeAfter?.nodeSize || 0);
    const nodeJSON = resolvedPos.nodeAfter?.toJSON();
    if (nodeJSON) {
      editor.chain().focus().insertContentAt(endOfNode, nodeJSON).run();
    }
  }, [editor, nodePos, node]);

  const deleteNode = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().deleteSelection().run();
  }, [editor]);

  const resetFormatting = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().clearNodes().unsetAllMarks().run();
  }, [editor]);

  const handleSlashInsert = useCallback(() => {
    if (!editor || nodePos < 0) return;
    // Insert a slash at the end of the current node to trigger slash menu
    const pos = nodePos + (node?.nodeSize || 1);
    editor.chain().focus().insertContentAt(pos, { type: 'paragraph' }).run();
    // After inserting paragraph, type /
    setTimeout(() => {
      editor.chain().focus().insertContent('/').run();
    }, 50);
  }, [editor, nodePos, node]);

  const downloadImage = useCallback(() => {
    if (!editor || !node) return;
    const src = node.attrs?.src;
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = 'image';
    a.click();
  }, [editor, node]);

  const isImageNode = node?.type.name === 'image' || node?.type.name === 'imageUpload';

  // Dynamic positioning like original
  const computePositionConfig = React.useMemo(() => ({
    middleware: [
      offset(({ rects }: any) => {
        const nodeHeight = rects.reference.height;
        const handleHeight = 32;
        const crossAxis = nodeHeight / 2 - handleHeight / 2;
        return {
          mainAxis: 16,
          crossAxis: nodeHeight > 40 ? 0 : crossAxis,
        };
      }),
    ],
  }), []);

  if (!editor) return null;

  const { from, to, empty } = editor.state.selection;
  const hasTextSelection = from !== to && !empty;

  return (
    <DragHandle
      editor={editor}
      onNodeChange={handleNodeChange}
      computePositionConfig={computePositionConfig}
    >
      <div
        className="flex items-center gap-0.5"
        style={hasTextSelection ? { opacity: 0, pointerEvents: 'none' } : {}}
      >
        {/* + Button (slash command trigger) */}
        <button
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          onClick={handleSlashInsert}
          title="Add block below"
        >
          <Plus className="h-4 w-4" />
        </button>

        {/* Drag handle + context menu */}
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing transition-colors"
              onMouseDown={() => {
                if (editor && nodePos >= 0) {
                  editor.commands.setNodeSelection(nodePos);
                }
              }}
              title="Drag to move · Click for options"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {/* Node label */}
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              {getNodeDisplayName(editor)}
            </DropdownMenuLabel>

            {/* Color submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette className="mr-2 h-4 w-4" /> Color
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56 p-2">
                {/* Text colors */}
                <p className="px-2 py-1 text-xs text-muted-foreground font-medium">Text color</p>
                <div className="grid grid-cols-5 gap-1.5 px-2 pb-2">
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={`text-${c.value || 'default'}`}
                      title={c.label}
                      className="h-6 w-6 rounded-full border-2 border-transparent hover:border-ring transition-all hover:scale-110"
                      style={{ backgroundColor: c.value || 'currentColor' }}
                      onClick={() => {
                        // Select entire node content before applying color
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
                {/* Highlight colors */}
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
                        // Select entire node content before applying highlight
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

            {/* Turn into */}
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

            {/* Reset formatting */}
            <DropdownMenuItem onClick={resetFormatting}>
              <RemoveFormatting className="mr-2 h-4 w-4" /> Clear formatting
            </DropdownMenuItem>

            {/* Image download (conditional) */}
            {isImageNode && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={downloadImage}>
                  <ImageDown className="mr-2 h-4 w-4" /> Download image
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />

            {/* Core actions */}
            <DropdownMenuItem onClick={copyToClipboard}>
              <Copy className="mr-2 h-4 w-4" /> Copy
              <span className="ml-auto text-xs text-muted-foreground">⌘C</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={duplicateNode}>
              <CopyPlus className="mr-2 h-4 w-4" /> Duplicate
              <span className="ml-auto text-xs text-muted-foreground">⌘D</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={deleteNode} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
              <span className="ml-auto text-xs text-muted-foreground">Del</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </DragHandle>
  );
}
