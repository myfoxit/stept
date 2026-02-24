import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentEditor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Bold, Italic, Underline, Strikethrough, Code,
  Link, AlignLeft, AlignCenter, AlignRight,
  Heading1, Heading2, Heading3,
  Highlighter, Palette,
} from 'lucide-react';
import { useEditorState } from '@/components/Editor/hooks/useEditorState';
import { isSelectionValid, getSelectionBoundingRect } from '@/components/Editor/utils/editor-helpers';
import { ColorPicker } from '@/components/Editor/ColorPicker';
import { LinkPopover } from '@/components/Editor/LinkPopover';

interface ToolbarButtonProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
  shortcut?: string;
}

function ToolbarButton({ icon: Icon, label, active, onClick, shortcut }: ToolbarButtonProps) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 w-7 p-0 ${active ? 'bg-accent text-accent-foreground' : ''}`}
          onClick={onClick}
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

export function FloatingToolbar() {
  const { editor } = useCurrentEditor();
  const state = useEditorState(editor);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!editor || !toolbarRef.current) return;

    const valid = isSelectionValid(editor);
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to && valid;

    if (!hasSelection) {
      setVisible(false);
      return;
    }

    const rect = getSelectionBoundingRect(editor);
    if (!rect) {
      setVisible(false);
      return;
    }

    const toolbar = toolbarRef.current;
    const toolbarWidth = toolbar.offsetWidth || 400;
    const toolbarHeight = toolbar.offsetHeight || 40;

    let top = rect.top - toolbarHeight - 8 + window.scrollY;
    let left = rect.left + rect.width / 2 - toolbarWidth / 2 + window.scrollX;

    // Keep in viewport
    left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8));
    if (top < 8) top = rect.bottom + 8 + window.scrollY;

    setPosition({ top, left });
    setVisible(true);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    const onSelectionUpdate = () => {
      requestAnimationFrame(updatePosition);
    };

    editor.on('selectionUpdate', onSelectionUpdate);
    editor.on('blur', () => setVisible(false));

    return () => {
      editor.off('selectionUpdate', onSelectionUpdate);
    };
  }, [editor, updatePosition]);

  if (!editor || !visible) return null;

  const chain = () => editor.chain().focus();

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolbarButton icon={Bold} label="Bold" shortcut="⌘B" active={state.isBold} onClick={() => chain().toggleBold().run()} />
      <ToolbarButton icon={Italic} label="Italic" shortcut="⌘I" active={state.isItalic} onClick={() => chain().toggleItalic().run()} />
      <ToolbarButton icon={Underline} label="Underline" shortcut="⌘U" active={state.isUnderline} onClick={() => chain().toggleUnderline().run()} />
      <ToolbarButton icon={Strikethrough} label="Strikethrough" active={state.isStrikethrough} onClick={() => chain().toggleStrike().run()} />
      <ToolbarButton icon={Code} label="Inline Code" active={state.isCode} onClick={() => chain().toggleCode().run()} />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <LinkPopover editor={editor} />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <ToolbarButton icon={AlignLeft} label="Align Left" active={state.textAlign === 'left'} onClick={() => chain().setTextAlign('left').run()} />
      <ToolbarButton icon={AlignCenter} label="Align Center" active={state.textAlign === 'center'} onClick={() => chain().setTextAlign('center').run()} />
      <ToolbarButton icon={AlignRight} label="Align Right" active={state.textAlign === 'right'} onClick={() => chain().setTextAlign('right').run()} />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <ToolbarButton icon={Heading1} label="Heading 1" active={state.headingLevel === 1} onClick={() => chain().toggleHeading({ level: 1 }).run()} />
      <ToolbarButton icon={Heading2} label="Heading 2" active={state.headingLevel === 2} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton icon={Heading3} label="Heading 3" active={state.headingLevel === 3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <ColorPicker type="text" editor={editor}>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
          <Palette className="h-4 w-4" />
        </Button>
      </ColorPicker>

      <ColorPicker type="highlight" editor={editor}>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
          <Highlighter className="h-4 w-4" />
        </Button>
      </ColorPicker>
    </div>
  );
}
