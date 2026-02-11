import React, { useState } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';

// shadcn‑ui
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';

// tabler‑icons
import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconPalette,
  IconX,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';

type Props = { editor: Editor };

const DEFAULT_COLORS = [
  '#000000',
  '#e11d48', // rose‑600
  '#0ea5e9', // sky‑500
  '#22c55e', // emerald‑500
  '#facc15', // yellow‑400
  '#ffffff',
];

export const FormatBubbleMenu: React.FC<Props> = ({ editor }) => {
  const [pickerOpen, setPickerOpen] = useState(false);

  /** Apply selected color through the Color extension  */
  const setColor = (hex: string) => {
    editor.chain().focus().setColor(hex).run();
    setPickerOpen(false);
  };

  /** Reset the mark created by Color extension */
  const clearColor = () => {
    editor.chain().focus().unsetColor().run();
  };

  return (
    <BubbleMenu editor={editor} options={{ placement: 'bottom', offset: 8 }}>
      <div className="flex items-center gap-1 rounded-xl border bg-background p-2 shadow-lg">
        {/* ——— Marks ——— */}
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'h-8 w-8',
            editor.isActive('bold') && 'bg-primary text-primary-foreground'
          )}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <IconBold size={18} />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'h-8 w-8',
            editor.isActive('italic') && 'bg-primary text-primary-foreground'
          )}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <IconItalic size={18} />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'h-8 w-8',
            editor.isActive('strike') && 'bg-primary text-primary-foreground'
          )}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <IconStrikethrough size={18} />
        </Button>

        {/* ——— Alignment ——— */}
        <span className="mx-1 h-4 w-px bg-border" />

        {(['left', 'center', 'right'] as const).map((align) => {
          const Icon =
            align === 'left'
              ? IconAlignLeft
              : align === 'center'
              ? IconAlignCenter
              : IconAlignRight;

          return (
            <Button
              key={align}
              size="icon"
              variant="ghost"
              className={cn(
                'h-8 w-8',
                editor.isActive({ textAlign: align }) &&
                  'bg-primary text-primary-foreground'
              )}
              onClick={() => editor.chain().focus().setTextAlign(align).run()}
            >
              <Icon size={18} />
            </Button>
          );
        })}

        {/* ——— Color picker ——— */}
        <span className="mx-1 h-4 w-px bg-border" />

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                'h-8 w-8',
                editor.isActive('textStyle') &&
                  'outline outline-2 outline-primary'
              )}
            >
              <IconPalette size={18} />
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-fit p-2" align="center">
            <div className="mb-2 flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={clearColor}
                title="Clear color"
              >
                <IconX size={16} />
              </Button>

              {/* full html picker for custom colors */}
              <input
                type="color"
                onChange={(e) => setColor(e.target.value)}
                value={editor.getAttributes('textStyle')?.color || '#000000'}
                className="h-8 w-8 cursor-pointer rounded border"
              />
            </div>

            {/* palette of defaults */}
            <div className="grid grid-cols-6 gap-2">
              {DEFAULT_COLORS.map((hex) => (
                <button
                  key={hex}
                  onClick={() => setColor(hex)}
                  aria-label={hex}
                  className={cn(
                    'h-6 w-6 rounded',
                    hex === '#ffffff' ? 'border' : ''
                  )}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </BubbleMenu>
  );
};
