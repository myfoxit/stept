import * as React from 'react';

// --- Icons ---
import { ChevronDownIcon } from '@/components/tiptap-icons/chevron-down-icon';

// --- Hooks ---
import { useTiptapEditor } from '@/hooks/use-tiptap-editor';

// --- Tiptap UI ---
import { HeadingButton } from '@/components/tiptap-ui/heading-button';
import type { UseHeadingDropdownMenuConfig } from '@/components/tiptap-ui/heading-dropdown-menu';
import { useHeadingDropdownMenu } from '@/components/tiptap-ui/heading-dropdown-menu';

// --- shadcn/ui Popover ---
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';

// --- shadcn/ui primitives ---
import { Button, type ButtonProps } from '@/components/ui/button';

export interface HeadingDropdownMenuProps
  extends Omit<ButtonProps, 'type'>,
    UseHeadingDropdownMenuConfig {
  /**
   * Whether to render the popover in a portal (ignored, popover is portalled by default)
   * @default false
   */
  portal?: boolean;
  /**
   * Callback for when the popover opens or closes
   */
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * Popover component for selecting heading levels in a Tiptap editor.
 *
 * For custom dropdown implementations, use the `useHeadingDropdownMenu` hook instead.
 */
export const HeadingDropdownMenu = React.forwardRef<
  HTMLButtonElement,
  HeadingDropdownMenuProps
>(
  (
    {
      editor: providedEditor,
      levels = [1, 2, 3, 4, 5, 6],
      hideWhenUnavailable = false,
      portal,
      onOpenChange,
      ...buttonProps
    },
    ref
  ) => {
    const { editor } = useTiptapEditor(providedEditor);
    const [isOpen, setIsOpen] = React.useState(false);
    const { isVisible, isActive, canToggle, Icon } = useHeadingDropdownMenu({
      editor,
      levels,
      hideWhenUnavailable,
    });

    const handleOpenChange = React.useCallback(
      (open: boolean) => {
        if (!editor || !canToggle) return;
        setIsOpen(open);
        onOpenChange?.(open);
      },
      [canToggle, editor, onOpenChange]
    );

    if (!isVisible) return null;

    return (
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={buttonProps.variant ?? 'ghost'}
            {...buttonProps}
            ref={ref}
            aria-label="Format text as heading"
            aria-pressed={isActive}
            disabled={!canToggle}
          >
            <Icon className="tiptap-button-icon" />
            <ChevronDownIcon className="tiptap-button-dropdown-small" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="p-2"
        >
          <div className="flex space-x-2 flex-col">
            {levels.map((level) => (
              <HeadingButton
                key={`heading-${level}`}
                editor={editor}
                level={level}
                text={`Heading ${level}`}
                showTooltip={false}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);

HeadingDropdownMenu.displayName = 'HeadingDropdownMenu';

export default HeadingDropdownMenu;
