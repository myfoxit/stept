import { useState, useRef } from 'react';
import { isRelationUiType } from '@/utils/relationUtils.ts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  IconChevronDown,
  IconEdit,
  IconColumnInsertLeft,
  IconColumnInsertRight,
} from '@tabler/icons-react';
import { EditFieldDialog } from './EditFieldDialog';
import { AddColumnForm } from '../AddColumnForm'; 
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'; 
import type { ColumnRead } from '@/types/openapi';
import { useDeleteColumn } from '@/hooks/api/columns';
import { useDeleteFormula } from '@/hooks/api/formulas';
import { useDeleteRelation } from '@/hooks/api/relations';
import { useDeleteSelectColumn } from '@/hooks/api/select_options';

export function HeaderWithMenu({
  title,
  columnId,
  uiType,
  relationId,
  tableId,
  columns,
}: {
  title: string;
  columnId: string;
  uiType?: string;
  relationId?: string;
  tableId: string;
  columns?: ColumnRead[];
}) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  

  const [addColumnDialogOpen, setAddColumnDialogOpen] = useState(false);
  const [addColumnPosition, setAddColumnPosition] = useState<'left' | 'right' | null>(null);


  const deleteColumnMutation = useDeleteColumn();
  const deleteRelationMutation = useDeleteRelation();
  const deleteSelectOptionMutation = useDeleteSelectColumn();
  const deleteFormulaMutation = useDeleteFormula();
  const handleDelete = () => {
    if (uiType === 'formula') {
      deleteFormulaMutation.mutate(columnId, {
        onError: (error) => console.error('Delete formula failed', error),
      });
      return;
    }
    if (isRelationUiType(uiType) && relationId) {
      deleteRelationMutation.mutate(relationId, {
        onError: (error) => console.error('Delete relation failed', error),
      });
    }
    if (uiType == 'single_select' || uiType == 'multi_select') {
      deleteSelectOptionMutation.mutate(
        { columnId, tableId }, // ← pass both IDs
        {
          onError: (error) =>
            console.error('Delete select column failed', error),
        }
      );
      return;
    } else {
      deleteColumnMutation.mutate(
        { tableId: tableId, colId: columnId },
        { onError: (error) => console.error('Delete column failed', error) }
      );
    }
  };

  // NEW: Handle column insertion by opening the dialog
  const handleInsertColumn = (position: 'left' | 'right') => {
    setAddColumnPosition(position);
    setAddColumnDialogOpen(true);
  };

  // NEW: Handler to reset state when dialog closes
  const onAddColumnOpenChange = (open: boolean) => {
    setAddColumnDialogOpen(open);
    if (!open) {
      setAddColumnPosition(null);
    }
  };

  return (
    <>
      <div className="flex w-full items-center min-w-0">
        <span className="font-medium truncate flex-1">{title}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 data-[state=open]:bg-muted cursor-pointer size-8"
            >
              <IconChevronDown />
              <span className="sr-only">Column menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* CHANGED: onSelect just calls the handler. No hacks needed. */}
            <DropdownMenuItem
              onSelect={() => handleInsertColumn('left')}
              className="gap-2"
            >
              <IconColumnInsertLeft className="h-4 w-4" />
              Insert column left
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => handleInsertColumn('right')}
              className="gap-2"
            >
              <IconColumnInsertRight className="h-4 w-4" />
              Insert column right
            </DropdownMenuItem>
            
            {/* ... (Other menu items: Edit, Sort, Delete, etc.) ... */}
            <DropdownMenuSeparator />
            <DropdownMenuItem
 onSelect={() => setEditDialogOpen(true)}
              className="gap-2"
            >
              <IconEdit className="h-4 w-4" />
              Edit field
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                /* sort ascending */
              }}
            >
              Sort ascending
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                /* sort descending */
              }}
            >
              Sort descending
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                /* hide column */
              }}
            >
              Hide column
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <EditFieldDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        columnId={columnId}
        tableId={tableId}
        uiType={uiType}
        currentName={title}
      />

      {/* NEW: Render the AddColumnForm inside a Dialog */}
      <Dialog open={addColumnDialogOpen} onOpenChange={onAddColumnOpenChange}>
        <DialogContent className="w-84">
          <DialogHeader>
            <DialogTitle>
              {`Insert column ${addColumnPosition || ''}`}
            </DialogTitle>
          </DialogHeader>
          {/* Only render the form when position is set.
            This ensures the form's internal useEffect runs and resets its state
            every time the dialog opens.
          */}
          {addColumnPosition && (
            <AddColumnForm
              tableId={tableId}
              columns={columns || []}
              position={addColumnPosition}
              referenceColumnId={columnId}
              onClose={() => onAddColumnOpenChange(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}