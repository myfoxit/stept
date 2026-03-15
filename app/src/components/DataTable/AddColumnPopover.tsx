'use client';

import { useState } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { AddColumnForm } from './AddColumnForm'; // NEW: Import the reusable form
import type { ColumnRead } from '@/types/openapi';

interface AddColumnPopoverProps {
  tableId: string;
  columns: ColumnRead[];
  position?: 'left' | 'right';
  referenceColumnId?: string;
  trigger?: React.ReactNode;
  open?: boolean; // Controlled open state
  onOpenChange?: (open: boolean) => void; // Controlled state handler
}

export function AddColumnPopover({
  tableId,
  columns,
  position,
  referenceColumnId,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: AddColumnPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  // Determine if we're in controlled mode
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  
  const setOpen = (value: boolean) => {
    if (isControlled && onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };

  // Logic for the invisible trigger in controlled mode
  if (isControlled && !trigger) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* Invisible trigger, positioned by parent */}
          <button style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
        </PopoverTrigger>
        <PopoverContent className="w-84 p-4" align="start" side="bottom">
          <AddColumnForm
            tableId={tableId}
            columns={columns}
            position={position}
            referenceColumnId={referenceColumnId}
            onClose={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
    );
  }

  // Regular mode with a visible trigger
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="cursor-pointer">
            <IconPlus />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-84 p-4 mr-8">
        <AddColumnForm
          tableId={tableId}
          columns={columns}
          position={position}
          referenceColumnId={referenceColumnId}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}