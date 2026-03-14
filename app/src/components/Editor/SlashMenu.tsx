import * as React from 'react';
import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
  Type, Heading1, Heading2, Heading3,
  List, ListOrdered, ListTodo,
  TextQuote, FileCode, Minus,
  ImagePlus, Sparkles, Repeat2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlashMenuItem {
  title: string;
  description?: string;
  icon: React.ElementType;
  command: (props: { editor: any; range: any }) => void;
  group?: string;
}

interface SlashMenuListProps {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
}

interface SlashMenuListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export interface SlashMenuConfig {
  customItems?: {
    title: string;
    subtext?: string;
    badge?: React.ElementType;
    group?: string;
    onSelect: () => void;
  }[];
}

// ---------------------------------------------------------------------------
// Default slash items
// ---------------------------------------------------------------------------

const DEFAULT_ITEMS: SlashMenuItem[] = [
  {
    title: 'Text',
    description: 'Plain text paragraph',
    icon: Type,
    group: 'Basic',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'Heading 1',
    description: 'Large heading',
    icon: Heading1,
    group: 'Basic',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Medium heading',
    icon: Heading2,
    group: 'Basic',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Small heading',
    icon: Heading3,
    group: 'Basic',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'Bullet List',
    description: 'Unordered list',
    icon: List,
    group: 'Lists',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Ordered List',
    description: 'Numbered list',
    icon: ListOrdered,
    group: 'Lists',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Task List',
    description: 'Checklist',
    icon: ListTodo,
    group: 'Lists',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'Blockquote',
    description: 'Quote block',
    icon: TextQuote,
    group: 'Blocks',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Code Block',
    description: 'Code snippet',
    icon: FileCode,
    group: 'Blocks',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Horizontal Rule',
    description: 'Divider line',
    icon: Minus,
    group: 'Blocks',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'Image',
    description: 'Upload an image',
    icon: ImagePlus,
    group: 'Media',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      // Trigger image upload via the ImageUploadNode if available
      editor.chain().focus().setImageUploadNode().run();
    },
  },
  {
    title: 'AI Write',
    description: 'Generate text with AI',
    icon: Sparkles,
    group: 'AI',
    command: ({ editor, range }) => {
      const { from } = range;
      editor.chain().focus().deleteRange(range).run();
      const coords = editor.view.coordsAtPos(from);
      window.dispatchEvent(new CustomEvent('stept:ai-inline-write', { detail: { x: coords.left, y: coords.top } }));
    },
  },
  {
    title: 'Insert Workflow',
    description: 'Insert a saved workflow',
    icon: Repeat2,
    group: 'Other',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(new CustomEvent('stept:insert-workflow'));
    },
  },
];

// ---------------------------------------------------------------------------
// Slash Menu List Component (rendered by ReactRenderer)
// ---------------------------------------------------------------------------

const SlashMenuList = forwardRef<SlashMenuListRef, SlashMenuListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => setSelectedIndex(0), [items]);

    // Scroll selected item into view
    useEffect(() => {
      const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          const item = items[selectedIndex];
          if (item) command(item);
          return true;
        }
        if (event.key === 'Escape') {
          return true;
        }
        return false;
      },
    }));

    if (!items.length) {
      return (
        <div className="rounded-lg border bg-popover p-3 shadow-md text-sm text-muted-foreground">
          No results
        </div>
      );
    }

    return (
      <div
        ref={listRef}
        className="rounded-lg border bg-popover shadow-md overflow-y-auto max-h-80 w-64 p-1"
      >
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              data-index={index}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors
                ${index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
              onClick={() => command(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium">{item.title}</span>
                {item.description && (
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  },
);

SlashMenuList.displayName = 'SlashMenuList';

// ---------------------------------------------------------------------------
// Suggestion Extension
// ---------------------------------------------------------------------------

export function createSlashMenuExtension(config?: SlashMenuConfig) {
  // Merge custom items
  const customSlashItems: SlashMenuItem[] = (config?.customItems || []).map((ci) => ({
    title: ci.title,
    description: ci.subtext,
    icon: ci.badge || Type,
    group: ci.group || 'Custom',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      ci.onSelect();
    },
  }));

  const allItems = [...DEFAULT_ITEMS, ...customSlashItems];

  return Extension.create({
    name: 'slashMenu',

    addOptions() {
      return {
        suggestion: {
          char: '/',
          command: ({ editor, range, props }: { editor: any; range: any; props: SlashMenuItem }) => {
            props.command({ editor, range });
          },
          items: ({ query }: { query: string }) => {
            return allItems.filter((item) =>
              item.title.toLowerCase().includes(query.toLowerCase()),
            );
          },
          render: () => {
            let component: ReactRenderer | null = null;
            let popup: TippyInstance[] | null = null;

            return {
              onStart: (props: SuggestionProps) => {
                component = new ReactRenderer(SlashMenuList, {
                  props: { items: props.items, command: props.command },
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                });
              },
              onUpdate: (props: SuggestionProps) => {
                component?.updateProps({ items: props.items, command: props.command });
                if (popup?.[0] && props.clientRect) {
                  popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
                }
              },
              onKeyDown: (props: SuggestionKeyDownProps) => {
                if (props.event.key === 'Escape') {
                  popup?.[0]?.hide();
                  return true;
                }
                return (component?.ref as SlashMenuListRef)?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                popup?.[0]?.destroy();
                component?.destroy();
              },
            };
          },
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}

// Convenience component for use in Editor context
export function SlashMenu({ config }: { config?: SlashMenuConfig }) {
  // The actual extension is added in useSteptEditor
  // This component is a no-op placeholder for future UI overlays
  return null;
}
