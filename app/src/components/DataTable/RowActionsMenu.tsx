import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  IconTrash, 
  IconRowInsertTop, 
  IconRowInsertBottom,
  IconGripVertical 
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { useColumns } from '@/hooks/api/columns';
import { useInsertRowAtPosition, useDeleteRow } from '@/hooks/api/fields';

interface RowActionsMenuProps {
  rowId: number;
  tableId: string;
  onActionComplete?: () => void;
}

export function RowActionsMenu({ rowId, tableId, onActionComplete }: RowActionsMenuProps) {
  const { mutate: insertRowAtPosition } = useInsertRowAtPosition();
  const { mutate: deleteRow } = useDeleteRow();
  const { data: columns } = useColumns(tableId);

  const handleAddRowAbove = () => {
    if (!columns) return;
    
    const realCols = columns.filter((col) => col.column_type !== 'virtual');
    const emptyFields = realCols.reduce<Record<string, any>>((acc, col) => {
      acc[col.name] = null;
      return acc;
    }, {});

    insertRowAtPosition(
      {
        table_id: tableId,
        data: emptyFields,
        position: 'above',
        reference_row_id: rowId,
      },
      {
        onSuccess: () => {
          toast.success('Row added above');
          onActionComplete?.();
        },
        onError: () => {
          toast.error('Failed to add row');
        },
      }
    );
  };

  const handleAddRowBelow = () => {
    if (!columns) return;
    
    const realCols = columns.filter((col) => col.column_type !== 'virtual');
    const emptyFields = realCols.reduce<Record<string, any>>((acc, col) => {
      acc[col.name] = null;
      return acc;
    }, {});

    insertRowAtPosition(
      {
        table_id: tableId,
        data: emptyFields,
        position: 'below',
        reference_row_id: rowId,
      },
      {
        onSuccess: () => {
          toast.success('Row added below');
          onActionComplete?.();
        },
        onError: () => {
          toast.error('Failed to add row');
        },
      }
    );
  };

  const handleDeleteRow = () => {
    if (window.confirm('Are you sure you want to delete this row?')) {
      deleteRow(
        { tableId, rowId },  // Use tableId directly as a string
        {
          onSuccess: () => {
            toast.success('Row deleted');
            onActionComplete?.();
          },
          onError: (error) => {
            console.error('Delete error:', error);
            toast.error('Failed to delete row');
          },
        }
      );
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Row actions"
        >
          <IconGripVertical size={16} className="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={handleAddRowAbove} className="cursor-pointer">
          <IconRowInsertTop className="mr-2 h-4 w-4" />
          Add row above
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleAddRowBelow} className="cursor-pointer">
          <IconRowInsertBottom className="mr-2 h-4 w-4" />
          Add row below
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={handleDeleteRow} 
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <IconTrash className="mr-2 h-4 w-4" />
          Delete row
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
  