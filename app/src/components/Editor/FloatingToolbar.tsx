import * as React from 'react';
import { useState } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import { isNodeSelection } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Bold, Italic, Strikethrough, Code,
  Link2, Link2Off,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Heading1, Heading2, Heading3,
  Highlighter, Palette, Type, X,
  List, ListOrdered, ListTodo, TextQuote, FileCode,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ToolbarButtonProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  shortcut?: string;
}

function ToolbarButton({ icon: Icon, label, active, disabled, onClick, shortcut }: ToolbarButtonProps) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn('h-8 w-8 p-0', active && 'bg-accent text-accent-foreground')}
          onClick={onClick}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}{shortcut && <span className="ml-1 text-muted-foreground">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Color Picker (inline)
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
// Turn-into dropdown
// ---------------------------------------------------------------------------

function TurnIntoDropdown({ editor }: { editor: any }) {
  const getCurrentType = () => {
    if (editor.isActive('heading', { level: 1 })) return 'Heading 1';
    if (editor.isActive('heading', { level: 2 })) return 'Heading 2';
    if (editor.isActive('heading', { level: 3 })) return 'Heading 3';
    if (editor.isActive('bulletList')) return 'Bullet List';
    if (editor.isActive('orderedList')) return 'Ordered List';
    if (editor.isActive('taskList')) return 'Task List';
    if (editor.isActive('blockquote')) return 'Quote';
    if (editor.isActive('codeBlock')) return 'Code';
    return 'Text';
  };

  const items = [
    { label: 'Text', icon: Type, action: () => editor.chain().focus().setParagraph().run() },
    { label: 'Heading 1', icon: Heading1, action: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: 'Heading 2', icon: Heading2, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: 'Heading 3', icon: Heading3, action: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { label: 'Bullet List', icon: List, action: () => editor.chain().focus().toggleBulletList().run() },
    { label: 'Ordered List', icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run() },
    { label: 'Task List', icon: ListTodo, action: () => editor.chain().focus().toggleTaskList().run() },
    { label: 'Quote', icon: TextQuote, action: () => editor.chain().focus().toggleBlockquote().run() },
    { label: 'Code', icon: FileCode, action: () => editor.chain().focus().toggleCodeBlock().run() },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs font-medium" onMouseDown={(e) => e.preventDefault()}>
          {getCurrentType()}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {items.map(({ label, icon: Icon, action }) => (
          <DropdownMenuItem key={label} onClick={action}>
            <Icon className="mr-2 h-4 w-4" /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Link Popover
// ---------------------------------------------------------------------------

function LinkButton({ editor }: { editor: any }) {
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState(false);
  const isActive = editor.isActive('link');

  const handleSetLink = () => {
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
    setOpen(false);
    setUrl('');
  };

  const handleUnlink = () => {
    editor.chain().focus().unsetLink().run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v && isActive) setUrl(editor.getAttributes('link')?.href || ''); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', isActive && 'bg-accent text-accent-foreground')}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" side="top" align="center" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetLink()}
            className="flex-1 rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <Button size="sm" className="h-8" onClick={handleSetLink}>Set</Button>
          {isActive && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleUnlink}>
              <Link2Off className="h-4 w-4" />
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Main Floating Toolbar
// ---------------------------------------------------------------------------

export function FloatingToolbar() {
  return null; // Rendered via BubbleMenu in OndokiEditor
}

export function FloatingToolbarContent({ editor }: { editor: any }) {
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);

  const chain = () => editor.chain().focus();

  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: 'top',
        offset: 8,
      }}
      shouldShow={({ editor: ed, state }) => {
        const { selection } = state;
        const { from, to, empty } = selection;
        if (empty) return false;
        if (isNodeSelection(selection) && selection.node.type.name !== 'image') return false;
        // Don't show on code blocks
        if (ed.isActive('codeBlock')) return false;
        return from !== to;
      }}
    >
      <div className="flex items-center gap-0.5 rounded-xl border bg-popover p-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
        {/* Turn Into */}
        <TurnIntoDropdown editor={editor} />

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Marks */}
        <ToolbarButton icon={Bold} label="Bold" shortcut="⌘B" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
        <ToolbarButton icon={Italic} label="Italic" shortcut="⌘I" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
        <ToolbarButton icon={Strikethrough} label="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()} />
        <ToolbarButton icon={Code} label="Code" active={editor.isActive('code')} onClick={() => chain().toggleCode().run()} />

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Link */}
        <LinkButton editor={editor} />

        {/* Text Color */}
        <Popover open={textColorOpen} onOpenChange={setTextColorOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onMouseDown={(e) => e.preventDefault()}>
              <Palette className="h-4 w-4" style={{ color: editor.getAttributes('textStyle')?.color || undefined }} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-fit p-2" side="top" align="center">
            <div className="grid grid-cols-5 gap-1.5">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.value || 'default'}
                  title={c.label}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                    editor.getAttributes('textStyle')?.color === c.value ? 'border-ring' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c.value || 'currentColor' }}
                  onClick={() => {
                    if (c.value) editor.chain().focus().setColor(c.value).run();
                    else editor.chain().focus().unsetColor().run();
                    setTextColorOpen(false);
                  }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Highlight */}
        <Popover open={highlightOpen} onOpenChange={setHighlightOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn('h-8 w-8 p-0', editor.isActive('highlight') && 'bg-accent')} onMouseDown={(e) => e.preventDefault()}>
              <Highlighter className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-fit p-2" side="top" align="center">
            <div className="grid grid-cols-5 gap-1.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.value || 'none'}
                  title={c.label}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                    c.value === '' ? 'flex items-center justify-center' : '',
                    editor.isActive('highlight', { color: c.value }) ? 'border-ring' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c.value || '#f3f4f6' }}
                  onClick={() => {
                    if (c.value) editor.chain().focus().toggleHighlight({ color: c.value }).run();
                    else editor.chain().focus().unsetHighlight().run();
                    setHighlightOpen(false);
                  }}
                >
                  {c.value === '' && <X className="h-3 w-3 text-muted-foreground" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Alignment */}
        <ToolbarButton icon={AlignLeft} label="Align Left" active={editor.isActive({ textAlign: 'left' })} onClick={() => chain().setTextAlign('left').run()} />
        <ToolbarButton icon={AlignCenter} label="Align Center" active={editor.isActive({ textAlign: 'center' })} onClick={() => chain().setTextAlign('center').run()} />
        <ToolbarButton icon={AlignRight} label="Align Right" active={editor.isActive({ textAlign: 'right' })} onClick={() => chain().setTextAlign('right').run()} />
        <ToolbarButton icon={AlignJustify} label="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => chain().setTextAlign('justify').run()} />
      </div>
    </BubbleMenu>
  );
}
