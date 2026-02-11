import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import { Placeholder } from '@tiptap/extensions';

import StarterKit from '@tiptap/starter-kit';
import { Pagination } from './PaginationBreaks';

import { Color, TextStyle } from '@tiptap/extension-text-style';

// shadcn‑ui
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup,
  CommandSeparator,
} from '@/components/ui/command';

// tabler‑icons
import { IconCards, IconPointer, IconTextCaption } from '@tabler/icons-react';
import ButtonNode from './Nodes/ButtonNode/ButtonNode';
import HeroNode from './Nodes/HeroNode/HeroNode';
import CardListNode from './Nodes/CardListNode/CardListNode';
import { VariableExtension } from './Extensions/VariableExtension';
import { VariableNode } from './Nodes/VariableNode/VariableNode';
import { useColumns } from '@/hooks/columns';
import { useDocument, useRows, useSaveDocument } from '@/hooks';
import { VariableStore } from './Extensions/VariableStore';
import { FormatBubbleMenu } from './FormatBubbleMenu';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const cmToPx = (cm: number) => (cm / 2.54) * 96;
const pageWidthPx = cmToPx(21);
const pageHeightPx = 1123.5;
const marginTopPx = cmToPx(2.5);
const marginBottomPx = cmToPx(2.5);
const marginHorizontalPx = cmToPx(2);

// -----------------------------------------------------------------------------
// React components used inside node‑views
// -----------------------------------------------------------------------------

type CommandDef = {
  title: string;
  icon: React.ElementType;
  action: (editor: Editor) => void;
};

const makeCommands = (): CommandDef[] => [
  {
    title: 'Card list',
    icon: IconCards,
    action: (editor) => {
      editor.commands.insertContent({ type: 'paragraph' });
      editor.commands.insertContent({ type: 'card-node' });
    },
  },
  {
    title: 'Button',
    icon: IconPointer,
    action: (editor) => {
      editor.commands.insertContent({ type: 'button-node' });
    },
  },
  {
    title: 'Hero',
    icon: IconTextCaption,
    action: (editor) => {
      editor.commands.insertContent({ type: 'hero-node' });
    },
  },

  {
    title: 'Variable',
    icon: IconTextCaption,
    action: (editor) => {
      editor.commands.insertContent({ type: 'variable-node' });
    },
  },
];

// -----------------------------------------------------------------------------
// TipTap extensions array
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export const SnapEditor: React.FC = ({
  tableId,
  rowId,
}: {
  tableId: string;
  rowId: string;
}) => {
  const { data: cols, isLoading: colsLoading } = useColumns(tableId);
  const { data: rows = [], isLoading: rowsLoading } = useRows(tableId);
  const { data: doc, isLoading: docLoading } = useDocument(tableId, rowId);
  const saveDocument = useSaveDocument(tableId);
  const isLoading = rowsLoading || colsLoading || docLoading;
  const [commandLevel, setCommandLevel] = useState<'root' | 'variable'>('root');

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const commands = useMemo<CommandDef[]>(() => {
    if (commandLevel === 'root') return makeCommands();

    // — variable level —
    return cols.map((c) => ({
      title: c.name,
      icon: IconTextCaption,
      action: (editor) => {
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'variable-node',
            attrs: { colId: c.id, rowId },
          })
          .run();
      },
    }));
  }, [commandLevel, cols, rowId]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Pagination.configure({
          pageHeight: 1123.5,
          pageWidth: (21 / 2.54) * 96,
          pageMargin: 0,
          label: 'Page',
          showPageNumber: true,
        }),
        Placeholder.configure({
          placeholder: "Write, type '/' for commands …",
        }),
        ButtonNode,
        HeroNode,
        CardListNode,
        VariableStore,
        VariableNode,
        TextStyle,
        Color,
        VariableExtension.configure({
          className: 'text-blue-600 font-semibold',
        }),
      ],
      content: doc?.content.content ?? '<p></p>',
    },
    []
  );

  useEffect(() => {
    if (!isLoading && editor) {
      editor.commands.setVariableData({ cols, rows, rowId });
    }
  }, [isLoading, cols, rows, rowId, editor]);

  useEffect(() => {
    if (!editor) return;

    // keep track of the pending timeout
    let timeoutId: ReturnType<typeof setTimeout>;

    const onUpdate = () => {
      // clear the previous save if we’re still typing
      clearTimeout(timeoutId);

      // schedule a new save 1 s after the last keystroke
      timeoutId = setTimeout(() => {
        const json = editor.getJSON();
        console.log(`Saving document for table ${tableId}`, json);
        saveDocument.mutate({ name: 'test', row_id: rowId, content: json });
      }, 1000);
    };

    // attach the debounced handler
    editor.on('update', onUpdate);

    return () => {
      // cleanup both listener and any pending timeout
      clearTimeout(timeoutId);
      editor.off('update', onUpdate);
    };
  }, [editor, saveDocument, tableId]);

  useEffect(() => {
    if (editor && doc) {
      editor.commands.setContent(doc.content, false); // false = do not add to undo‑stack
    }
  }, [editor, doc]);

  // -------------------------------------------------------------------------
  // Show slash‑command palette
  // -------------------------------------------------------------------------

  const openCommandMenu = useCallback(() => {
    if (!editor) return;
    setCommandLevel('root');
    const { from } = editor.state.selection;
    const coords = editor.view.coordsAtPos(from);
    setMenuCoords({ x: coords.left, y: coords.bottom });
    setMenuOpen(true);
  }, [editor]);

  // Listen for "/" key inside the editor
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/') {
        requestAnimationFrame(openCommandMenu);
      }
    };

    dom.addEventListener('keydown', onKey);
    return () => dom.removeEventListener('keydown', onKey);
  }, [editor, openCommandMenu]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSelect = (cmd: CommandDef) => {
    if (!editor) return;

    // Step 1 → switch to column list
    if (commandLevel === 'root' && cmd.title === 'Variable') {
      setCommandLevel('variable');
      return; // keep palette open
    }

    // Delete the “/” that triggered the palette (if still present)
    const { from } = editor.state.selection;
    const charBefore = editor.state.doc.textBetween(from - 1, from, '\0', '\0');
    if (charBefore === '/') {
      editor.commands.deleteRange({ from: from - 1, to: from });
    }

    // Run the chosen action (insert node, etc.)
    cmd.action(editor);

    // Reset & close
    setCommandLevel('root');
    setMenuOpen(false);
  };

  return (
    <div className="relative">
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50">
          <span className="text-gray-500">Loading...</span>
        </div>
      ) : (
        <>
          {editor && <FormatBubbleMenu editor={editor} />}

          <EditorContent editor={editor} />

          {/* Slash‑command popover */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              {/* Invisible anchor element to position the popover */}
              <span
                style={{
                  position: 'fixed',
                  left: menuCoords.x,
                  top: menuCoords.y,
                  width: 0,
                  height: 0,
                }}
              />
            </PopoverTrigger>
            <PopoverContent
              className="w-72 p-0"
              collisionPadding={8}
              alignOffset={4}
            >
              <Command loop>
                <CommandInput placeholder="Search components…" />
                <CommandList>
                  <CommandEmpty>No command found.</CommandEmpty>

                  <CommandGroup heading="Components">
                    {commands.map((cmd) => (
                      <CommandItem
                        key={cmd.title}
                        value={cmd.title}
                        onSelect={() => handleSelect(cmd)}
                      >
                        <cmd.icon className="mr-2 h-4 w-4" />
                        <span>{cmd.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>

                  <CommandSeparator />
                  <CommandItem
                    value="close"
                    className="text-muted-foreground"
                    onSelect={() => setMenuOpen(false)}
                  >
                    Close
                  </CommandItem>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );
};
