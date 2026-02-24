import * as React from 'react';
import { useCallback } from 'react';
import { useCurrentEditor } from '@tiptap/react';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  GripVertical, Type, Heading1, Heading2, Heading3,
  List, ListOrdered, ListTodo, TextQuote, FileCode,
  Copy, CopyPlus, Trash2,
} from 'lucide-react';

export function DragMenu() {
  const { editor } = useCurrentEditor();

  const turnInto = useCallback(
    (type: string, attrs?: Record<string, any>) => {
      if (!editor) return;
      const chain = editor.chain().focus();

      switch (type) {
        case 'paragraph':
          chain.setParagraph().run();
          break;
        case 'heading':
          chain.toggleHeading({ level: attrs?.level || 1 }).run();
          break;
        case 'bulletList':
          chain.toggleBulletList().run();
          break;
        case 'orderedList':
          chain.toggleOrderedList().run();
          break;
        case 'taskList':
          chain.toggleTaskList().run();
          break;
        case 'blockquote':
          chain.toggleBlockquote().run();
          break;
        case 'codeBlock':
          chain.toggleCodeBlock().run();
          break;
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
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const slice = editor.state.doc.slice(from, to);
    editor.chain().focus().insertContentAt(to, slice.content.toJSON()).run();
  }, [editor]);

  const deleteNode = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().deleteSelection().run();
  }, [editor]);

  if (!editor) return null;

  return (
    <DragHandle editor={editor}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-6 w-6 cursor-grab items-center justify-center rounded hover:bg-accent active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Type className="mr-2 h-4 w-4" /> Turn into
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
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

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={copyToClipboard}>
            <Copy className="mr-2 h-4 w-4" /> Copy
          </DropdownMenuItem>
          <DropdownMenuItem onClick={duplicateNode}>
            <CopyPlus className="mr-2 h-4 w-4" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={deleteNode} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </DragHandle>
  );
}
