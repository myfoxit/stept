import React, { useState, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/react/menus';
import { ExternalLink, Pencil, Unlink, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  editor: Editor;
}

export const LinkBubbleMenu: React.FC<Props> = ({ editor }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editUrl, setEditUrl] = useState('');

  const handleEdit = useCallback(() => {
    const href = editor.getAttributes('link')?.href || '';
    setEditUrl(href);
    setIsEditing(true);
  }, [editor]);

  const handleSave = useCallback(() => {
    if (editUrl) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: editUrl }).run();
    }
    setIsEditing(false);
  }, [editor, editUrl]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleUnlink = useCallback(() => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setIsEditing(false);
  }, [editor]);

  const handleOpen = useCallback(() => {
    const href = editor.getAttributes('link')?.href;
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  }, [editor]);

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'bottom', offset: 4 }}
      shouldShow={({ editor: ed, state }) => {
        // Show only when cursor is inside a link (including empty selection)
        if (!ed.isActive('link')) return false;
        // Don't show when text is selected (the format toolbar handles that)
        const { from, to } = state.selection;
        return from === to;
      }}
    >
      <div
        className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-lg"
        onMouseDown={(e) => e.preventDefault()}
      >
        {isEditing ? (
          <>
            <Input
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
              className="h-7 w-56 text-xs"
              placeholder="https://..."
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <span className="max-w-48 truncate px-2 text-xs text-muted-foreground">
              {editor.getAttributes('link')?.href || 'No URL'}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpen} title="Open link">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleEdit} title="Edit link">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleUnlink} title="Remove link">
              <Unlink className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </BubbleMenu>
  );
};
