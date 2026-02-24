import * as React from 'react';
import { useCurrentEditor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Bold, Italic, Underline, Strikethrough, Code,
  Heading1, Heading2, List, ListOrdered, ListTodo,
  TextQuote, Link, ImagePlus, Undo2, Redo2,
} from 'lucide-react';
import { useEditorState } from '@/components/Editor/hooks/useEditorState';
import { useIsMobile } from '@/hooks/use-mobile';

export function MobileToolbar() {
  const { editor } = useCurrentEditor();
  const state = useEditorState(editor);
  const isMobile = useIsMobile();

  if (!editor || !isMobile) return null;

  const chain = () => editor.chain().focus();

  const btn = (Icon: React.ElementType, active: boolean, onClick: () => void) => (
    <Button
      variant="ghost"
      size="sm"
      className={`h-8 w-8 p-0 shrink-0 ${active ? 'bg-accent' : ''}`}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-0.5 overflow-x-auto border-t bg-background px-2 py-1.5 safe-area-pb">
      {btn(Undo2, false, () => chain().undo().run())}
      {btn(Redo2, false, () => chain().redo().run())}
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      {btn(Bold, state.isBold, () => chain().toggleBold().run())}
      {btn(Italic, state.isItalic, () => chain().toggleItalic().run())}
      {btn(Underline, state.isUnderline, () => chain().toggleUnderline().run())}
      {btn(Strikethrough, state.isStrikethrough, () => chain().toggleStrike().run())}
      {btn(Code, state.isCode, () => chain().toggleCode().run())}
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      {btn(Heading1, state.headingLevel === 1, () => chain().toggleHeading({ level: 1 }).run())}
      {btn(Heading2, state.headingLevel === 2, () => chain().toggleHeading({ level: 2 }).run())}
      {btn(List, state.isBulletList, () => chain().toggleBulletList().run())}
      {btn(ListOrdered, state.isOrderedList, () => chain().toggleOrderedList().run())}
      {btn(ListTodo, state.isTaskList, () => chain().toggleTaskList().run())}
      {btn(TextQuote, state.isBlockquote, () => chain().toggleBlockquote().run())}
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      {btn(Link, state.isLink, () => {
        if (state.isLink) chain().unsetLink().run();
        else {
          const url = prompt('URL:');
          if (url) chain().setLink({ href: url }).run();
        }
      })}
      {btn(ImagePlus, false, () => chain().setImageUpload().run())}
    </div>
  );
}
