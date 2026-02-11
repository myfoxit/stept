import * as React from 'react';
import type { Editor } from '@tiptap/react';

// --- Hooks ---
import { useTiptapEditor } from '@/hooks/use-tiptap-editor';

// --- Icons ---
import { ChevronDownIcon } from '@/components/tiptap-icons/chevron-down-icon';

// --- shadcn/ui Popover ---
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';

// --- shadcn/ui Primitives ---
import { Button, type ButtonProps } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

// --- Tiptap UI ---
import { ListButton, type ListType } from '@/components/tiptap-ui/list-button';
import { useListDropdownMenu } from './use-list-dropdown-menu';

export interface ListDropdownMenuProps extends Omit<ButtonProps, 'type'> {
  /**
   * The Tiptap editor instance.
   */
  editor?: Editor;
  /**
   * The list types to display in the dropdown.
   */
  types?: ListType[];
  /**
   * Whether the dropdown should be hidden when no list types are available
   * @default false
   */
  hideWhenUnavailable?: boolean;
  /**
   * Callback for when the popover opens or closes
   */
  onOpenChange?: (isOpen: boolean) => void;
  /**
   * Whether to render the popover in a portal (ignored, popover is portalled by default)
   * @default false
   */
  portal?: boolean;
}

/**
 * Popover component for selecting list types in a Tiptap editor.
 */
export const ListDropdownMenu = React.forwardRef<
  HTMLButtonElement,
  ListDropdownMenuProps
>(
  (
    {
      editor: providedEditor,
      types = ['bulletList', 'orderedList', 'taskList'],
      hideWhenUnavailable = false,
      onOpenChange,
      portal,
      ...buttonProps
    },
    ref
  ) => {
    const { editor } = useTiptapEditor(providedEditor);
    const [isOpen, setIsOpen] = React.useState(false);
    const { filteredLists, canToggle, isActive, isVisible, Icon } =
      useListDropdownMenu({
        editor,
        types,
        hideWhenUnavailable,
      });

    const handleOpenChange = React.useCallback(
      (open: boolean) => {
        if (!editor) return;
        setIsOpen(open);
        onOpenChange?.(open);
      },
      [editor, onOpenChange]
    );

    if (!isVisible || !editor || !editor.isEditable) return null;

    return (
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={buttonProps.variant ?? 'ghost'}
            {...buttonProps}
            ref={ref}
            disabled={!canToggle}
            aria-label="List options"
            aria-pressed={isActive}
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
            {filteredLists.map((option) => (
              <ListButton
                key={option.type}
                editor={editor}
                type={option.type}
                text={option.label}
                showTooltip={false}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);

ListDropdownMenu.displayName = 'ListDropdownMenu';

export default ListDropdownMenu;
