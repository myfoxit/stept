import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, ExternalLink, Unlink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface LinkPopoverProps {
  editor: Editor;
}

export function LinkPopover({ editor }: LinkPopoverProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');

  const isActive = editor.isActive('link');

  useEffect(() => {
    if (open) {
      const attrs = editor.getAttributes('link');
      setUrl(attrs.href || '');
    }
  }, [open, editor]);

  const applyLink = useCallback(() => {
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
    setOpen(false);
  }, [editor, url]);

  const removeLink = useCallback(() => {
    editor.chain().focus().unsetLink().run();
    setOpen(false);
  }, [editor]);

  const openExternal = useCallback(() => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 w-7 p-0 ${isActive ? 'bg-accent text-accent-foreground' : ''}`}
            >
              <Link className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Link</TooltipContent>
        </Tooltip>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start" side="top">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">URL</span>
          <div className="flex gap-1.5">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                }
              }}
              autoFocus
            />
            <Button size="sm" className="h-8 px-2" onClick={applyLink}>
              Apply
            </Button>
          </div>
          <div className="flex gap-1">
            {url && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={openExternal}>
                <ExternalLink className="mr-1 h-3 w-3" /> Open
              </Button>
            )}
            {isActive && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={removeLink}>
                <Unlink className="mr-1 h-3 w-3" /> Remove
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
