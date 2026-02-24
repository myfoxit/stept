import * as React from 'react';
import { useState, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff',
  '#9900ff', '#ff00ff', '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3',
  '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc', '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599',
  '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
];

const STORAGE_KEY = 'ondokiRecentColors';
const MAX_RECENT = 8;

function getRecentColors(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentColor(color: string) {
  const recent = getRecentColors().filter((c) => c !== color);
  recent.unshift(color);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

interface ColorPickerProps {
  type: 'text' | 'highlight';
  editor: Editor;
  children: React.ReactNode;
}

export function ColorPicker({ type, editor, children }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (open) setRecent(getRecentColors());
  }, [open]);

  const applyColor = (color: string) => {
    addRecentColor(color);
    if (type === 'text') {
      editor.chain().focus().setColor(color).run();
    } else {
      editor.chain().focus().toggleHighlight({ color }).run();
    }
    setOpen(false);
  };

  const removeColor = () => {
    if (type === 'text') {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().unsetHighlight().run();
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start" side="top">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {type === 'text' ? 'Text Color' : 'Highlight'}
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={removeColor}>
              <X className="mr-1 h-3 w-3" /> Remove
            </Button>
          </div>

          <div className="grid grid-cols-8 gap-1">
            {COLORS.map((color) => (
              <button
                key={color}
                className="h-5 w-5 rounded-sm border border-border hover:scale-110 transition-transform cursor-pointer"
                style={{ backgroundColor: color }}
                onClick={() => applyColor(color)}
                title={color}
              />
            ))}
          </div>

          {recent.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">Recent</span>
              <div className="flex gap-1">
                {recent.map((color) => (
                  <button
                    key={color}
                    className="h-5 w-5 rounded-sm border border-border hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: color }}
                    onClick={() => applyColor(color)}
                    title={color}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
