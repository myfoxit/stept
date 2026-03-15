import type React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { IconArrowsDiagonal } from '@tabler/icons-react';
import type { ColumnRead } from '@/types/openapi';
import type { Table as TanstackTable, Row, Column } from '@tanstack/react-table';
import { RowDialog } from '@/components/DataTable/RowDialog.tsx';
import { SingleRelationField } from '@/components/DataTable/Fields/SingleRelationField.tsx';
import { MultiRelationField } from '@/components/DataTable/Fields/MultiRelationField.tsx';
import { HeaderWithMenu } from '@/components/DataTable/Fields/HeaderWithMenu.tsx';
import TagSelectField from './Fields/TagSelectField';
import { LookUpColumnField } from './Fields/LookUpField';
import FormulaField from './Fields/FormulaField';
import RollupField from './Fields/RollupField';
import { EditableCell } from '@/components/DataTable/SpreadsheetMode/EditableCell';
import { HighlightableCell } from '@/components/DataTable/SpreadsheetMode/HighlightableCell';
import MultiSelectField from './Fields/MultiSelectField';
import { DecimalField } from './Fields/DecimalField';
import { LongTextField } from './Fields/LongTextField';
import { RowActionsMenu } from './RowActionsMenu';

import { useSpreadsheet } from '@/components/DataTable/SpreadsheetMode/SpreadsheetContext'; 


const safeJsonParse = (raw: unknown): Record<string, any> | null => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
};

// NEW: fluent/global row number component
function RowNumber({ index }: { index: number }) {
  const { renderBaseIndex } = useSpreadsheet();
  return <div className="px-2 group-hover:hidden">{renderBaseIndex + index + 1}</div>;
}

export function getDynamicColumns<T extends Record<string, any>>(
  data: T[],
  meta?: ColumnRead[],
  tableId = '',
  spreadsheetMode = false,
  _onReorderColumn?: (draggedId: string, targetId: string, position: 'before' | 'after') => void
) {
  const allKeys = meta
    ? meta.map((c) => c.name)
    : [...new Set(data.flatMap((obj) => Object.keys(obj)))];

  // Exclude 'id' from dynamic columns, since it's shown in the first static column
  const keys = allKeys.filter((k) => k !== 'id');
  console.log(keys);

  return [
    {
      id: 'select',
      enableResizing: false,
      size: 96, // ~ w-24
      minSize: 50,
      header: ({ table }: { table: TanstackTable<T> }) => (
        <div className=" w-24 flex items-center justify-start">
          <div className="pl-2 pr-5">#</div>
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }: { row: Row<T> }) => (
        <div className=" w-24 flex items-center justify-around">
          <RowActionsMenu 
            rowId={row.original.id} 
            tableId={tableId}
          />
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="cursor-pointer"
          />
          {/* CHANGED: use global index */}
          <RowNumber index={row.index} />
          <RowDialog
            columns={meta}
            field={'id' as keyof typeof row.original}
            item={row.original}
            tableId={tableId}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="hidden group-hover:inline-flex cursor-pointer"
                aria-label="Open details"
              >
                <IconArrowsDiagonal />
              </Button>
            }
          />
        </div>
      ),
      enableSorting: true,
      enableHiding: false,
    },
    // NEW: Row number column (computed client-side)
    
    // Dynamically generated columns
    ...keys.map((key, index) => {
      const columnMeta = meta?.find((c) => c.name === key);
      const rawTitle = columnMeta?.display_name ?? String(key);
      const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
      const columnId = columnMeta?.id.toString() ?? key;

      const renderCell = (
        value: unknown,
        row: any,
        rowIndex: number,
        visibleColIndex: number // use the visible leaf index (0 = select)
      ) => {
        const uiType = columnMeta?.ui_type;
        if (!meta) {
          return <div></div>;
        }

        const cellContent = (() => {
          switch (uiType) {
            case 'oo_relation': {
              return (
                <SingleRelationField
                  column={columnMeta!}
                  value={safeJsonParse(value) as { id: string; name?: string } | null}
                  leftItemId={row.original.id}
                  onChange={(_row) => console.log('updated')}
                />
              );
            }
            case 'rollup':
              return <RollupField value={value} />;
            case 'single_select':
              return (
                <TagSelectField
                  column={columnMeta!}
                  value={value as string}
                  rowId={row.original.id}
                  commitMode="immediate"
                  onChange={(opt) => console.log('new value', opt)}
                />
              );

            case 'formula':
              return (
                <FormulaField
                  column={columnMeta!}
                  rowData={row.original}
                  columnsMeta={meta}
                />
              );

            case 'decimal':
              return <DecimalField value={value} />;

            case 'multi_select':
              return (
                <MultiSelectField
                  column={columnMeta!}
                  value={value as string}
                  rowId={row.original.id}
                  commitMode="immediate"
                  onChange={(opt) => console.log('new value', opt)}
                />
              );
            case 'lookup':
              return <LookUpColumnField value={value as { id: string; name?: string } | { id: string; name?: string }[] | null} />;

            case 'om_relation':
            case 'mm_relation_left':
            case 'mm_relation_right': {
              return (
                <MultiRelationField
                  column={columnMeta!}
                  value={safeJsonParse(value) as { id: string; name?: string }[] ?? []}
                  leftItemId={row.original.id}
                  onChange={(_row) => console.log('updated')}
                />
              );
            }
            // `single_line_text` (or no ui_type) falls through to default:
            case 'long_text':
              return (
                <LongTextField
                  value={value}
                  rowId={row.original.id}
                  columnId={key}
                  tableId={tableId}
                />
              );
            default:
              return (
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                  {(value as React.ReactNode) ?? '-'}
                </span>
              );
          }
        })();

        // Check if this is an excluded field type
        const excludedTypes = [
          'oo_relation',
          'om_relation',
          'mm_relation_left',
          'mm_relation_right',
          'single_select',
          'lookup',
          'formula',
          'rollup',
          'long_text', // Add to excluded types for spreadsheet mode
        ];
        const isExcluded = excludedTypes.includes(uiType || '');

        // In spreadsheet mode, visibleColIndex already accounts for the select column (0)
        if (spreadsheetMode) {
          if (isExcluded) {
            return (
              <HighlightableCell rowIndex={rowIndex} colIndex={visibleColIndex}>
                {cellContent}
              </HighlightableCell>
            );
          } else {
            return (
              <EditableCell
                rowIndex={rowIndex}
                colIndex={visibleColIndex}
                rowId={row.original.id}
                columnId={key}
                value={value}
                tableId={tableId}
                uiType={uiType}
              >
                {cellContent}
              </EditableCell>
            );
          }
        }

        return cellContent;
      };

      return {
        accessorKey: key as string,
        header: ({ table: _table }: { table: TanstackTable<T> }) => {
          const uiType = columnMeta?.ui_type;
          const relId = columnMeta?.relation_id?.toString();
          
          return (
            <HeaderWithMenu
              title={title}
              columnId={columnId}
              uiType={uiType}
              relationId={relId}
              tableId={tableId}
              columns={meta} // NEW: Pass columns
            />
          );
        },
        // FIX: use ctx.table and ctx.column instead of cell.getContext()
        cell: (ctx: { row: Row<T>; table: TanstackTable<T>; column: Column<T> }) => {
          const { row, table, column } = ctx;
          // Use TableCellViewer for the first dynamic column
          if (index === 0 && !spreadsheetMode) {
            return (
              <RowDialog
                columns={meta}
                field={key}
                item={row.original}
                tableId={tableId}
              />
            );
          }
          const value = row.original[key];
          const rowIndex = row.index;

          // Compute visible leaf column index without relying on cell.getContext()
          const visibleIdx = table
            .getVisibleLeafColumns()
            .findIndex((c: Column<T>) => c.id === column.id);

          return renderCell(value, row, rowIndex, visibleIdx);
        },
        // columns are resizable by default; keep default behavior
      };
    }),
    // Actions menu column
    /*  {
      id: 'actions',
      cell: () => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="data-[state=open]:bg-muted text-muted-foreground flex size-8 cursor-pointer"
              size="icon"
            >
              <IconDotsVertical />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Make a copy</DropdownMenuItem>
            <DropdownMenuItem>Favorite</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    }, */
  ];
}
