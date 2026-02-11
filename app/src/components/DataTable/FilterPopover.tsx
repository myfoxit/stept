import * as React from 'react';
import { IconFilter, IconPlus, IconX, IconTrash } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

import { useQuery } from '@tanstack/react-query';
import { getColumnOperations } from '@/api/filters';
import type { ColumnRead } from '@/types/openapi';
import { useFilters, useCreateFilter, useUpdateFilter, useDeleteFilter } from '@/hooks/api/filters';

interface FilterPopoverProps {
  tableId: string;
  columns?: ColumnRead[];
}

// Minimal runtime shape for a filter
interface Filter {
  id: string;
  column_id: string; // UI uses string IDs consistently
  operation: string;
  value?: string | null;
  is_active: boolean;
  name?: string;
}

type Draft = {
  id: string;
  column_id: string;
  operation: string;
  value: string;
  name?: string;
};

const OPERATION_LABELS: Record<string, string> = {
  equals: 'equals',
  not_equals: 'not equals',
  contains: 'contains',
  not_contains: 'does not contain',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  starts_with: 'starts with',
  ends_with: 'ends with',
  between: 'between',
  in: 'in',
  not_in: 'not in',
};

// DRY helper for loading column operations
function useColumnOperations(columnId?: string, enabled = true) {
  return useQuery<string[]>({
    queryKey: ['filterOperations', columnId],
    queryFn: async () => {
      const result = await getColumnOperations(columnId as string);
      const operations = (result as any)?.data ?? result;
      return Array.isArray(operations) ? operations : [];
    },
    enabled: Boolean(columnId) && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

const needsValue = (operation: string) =>
  !['is_empty', 'is_not_empty'].includes(operation);

const buildAutoName = (
  columns: ColumnRead[] | undefined,
  colId: string,
  op: string,
  val?: string
) => {
  const column = columns?.find((c) => c.id.toString() === colId);
  if (!column) return '';
  const opLabel = OPERATION_LABELS[op] || op;
  const parts = [column.display_name, opLabel, val?.trim()].filter(Boolean);
  return parts.join(' ').trim();
};

/**
 * Separate row components OUTSIDE the parent component so their types are stable
 * across renders. This prevents unmount/remount cycles that were causing the
 * input to lose focus on each keystroke.
 */

interface WorkingFilterRowProps {
  filter: Filter;
  index: number;
  columns?: ColumnRead[];
  onDelete: (filterId: string) => void;
}

// Replaced the previous editable/toggleable WorkingFilterRow with a
// simplified, read-only row that visually matches DraftRow and only allows delete.
const WorkingFilterRow: React.FC<WorkingFilterRowProps> = React.memo(
  ({ filter, index, columns, onDelete }) => {
    const column = columns?.find((c) => c.id.toString() === filter.column_id);

    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {/* Hide on mobile, show on sm and up */}
        <div className="hidden sm:flex w-12 shrink-0 text-xs text-muted-foreground h-8 items-center justify-center">
          {index === 0 ? 'Where' : 'And'}
        </div>

        {/* Show only on mobile as a small label */}
        <div className="sm:hidden text-xs text-muted-foreground">
          {index === 0 ? 'Where' : 'And'}
        </div>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <div className="h-8 flex items-center px-2 rounded border bg-input/10 w-full">
              <span className="text-sm truncate">
                {column?.display_name || ''}
              </span>
            </div>
          </div>

          <div>
            <div className="h-8 flex items-center px-2 rounded border bg-input/10 w-full">
              <span className="text-sm truncate">
                {OPERATION_LABELS[filter.operation] || filter.operation}
              </span>
            </div>
          </div>

          <div>
            <div className="h-8 flex items-center px-2 rounded border bg-input/10 w-full">
              <span className="text-sm truncate">{filter.value ?? ''}</span>
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 self-start sm:self-center ml-auto sm:ml-0"
          onClick={() => onDelete(filter.id)}
        >
          <IconTrash className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }
);

interface DraftRowProps {
  row: Draft;
  index: number;
  columns?: ColumnRead[];
  onChange: (next: Draft) => void;
  needsValue: (op: string) => boolean;
  onRemove: () => void;
}

const DraftRow: React.FC<DraftRowProps> = React.memo(
  ({ row, index, columns, onChange, needsValue, onRemove }) => {
    const { data: ops = [], isLoading } = useColumnOperations(
      row.column_id,
      true
    );

    // Prefill first operation when available
    React.useEffect(() => {
      if (ops.length && !row.operation) {
        onChange({ ...row, operation: ops[0] });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ops, row.operation]);

    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {/* Hide on mobile, show on sm and up */}
        <div className="hidden sm:flex w-12 shrink-0 text-xs text-muted-foreground h-8 items-center justify-center">
          {index === 0 ? 'Where' : 'And'}
        </div>

        {/* Show only on mobile as a small label */}
        <div className="sm:hidden text-xs text-muted-foreground">
          {index === 0 ? 'Where' : 'And'}
        </div>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Column */}
          <div>
            <Select
              value={row.column_id}
              onValueChange={(value) =>
                onChange({
                  ...row,
                  column_id: value,
                  operation: '',
                  value: '',
                  name: '',
                })
              }
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {columns?.map((col) => (
                  <SelectItem key={col.id} value={col.id.toString()}>
                    {col.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Condition */}
          <div>
            <Select
              value={row.operation}
              onValueChange={(value) => onChange({ ...row, operation: value })}
              disabled={isLoading || !row.column_id}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue
                  placeholder={isLoading ? 'Loading...' : 'Select...'}
                />
              </SelectTrigger>
              <SelectContent>
                {ops.length > 0 ? (
                  ops.map((op) => (
                    <SelectItem key={op} value={op}>
                      {OPERATION_LABELS[op] || op}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {isLoading ? 'Loading...' : 'No operations'}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Value */}
          <div>
            {row.operation && needsValue(row.operation) ? (
              <Input
                className="h-8 w-full"
                placeholder="Enter value..."
                value={row.value}
                onChange={(e) => onChange({ ...row, value: e.target.value })}
              />
            ) : (
              <div className="h-8 w-full" />
            )}
          </div>
        </div>

        {/* Delete button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 self-start sm:self-center ml-auto sm:ml-0"
          onClick={onRemove}
        >
          <IconTrash className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }
);

export function FilterPopover({ tableId, columns, embedded }: FilterPopoverProps) {
  const { data: filters = [] } = useFilters(tableId);
  const { mutate: createFilter } = useCreateFilter();
  const { mutate: updateFilter } = useUpdateFilter();
  const { mutate: deleteFilter } = useDeleteFilter();

  const [open, setOpen] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Draft[]>([]);

  // Initialize with one draft when popover opens
  React.useEffect(() => {
    if (open && drafts.length === 0 && columns?.length) {
      setDrafts([
        {
          id: crypto.randomUUID(),
          column_id: columns[0].id.toString(),
          operation: '',
          value: '',
        },
      ]);
    }
  }, [open, drafts.length, columns]);

  // Active-only filters
  const activeFilters = React.useMemo<Filter[]>(() => {
    if (!Array.isArray(filters)) return [];
    return (filters as Filter[]).filter((f) => f.is_active);
  }, [filters]);

  const hasActiveFilters = activeFilters.length > 0;

  // Draft helpers
  const addDraft = () => {
    const firstCol = columns?.[0]?.id?.toString() ?? '';
    setDrafts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        column_id: firstCol,
        operation: '',
        value: '',
      },
    ]);
  };
  const updateDraft = (id: string, next: Draft) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? next : d)));
  const removeDraft = (id: string) =>
    setDrafts((prev) => prev.filter((d) => d.id !== id));

  const handleApplyDrafts = () => {
    if (!drafts.length) return;
    drafts.forEach((d) => {
      if (!d.column_id || !d.operation) return;
      if (needsValue(d.operation) && !d.value) return;

      const name =
        d.name || buildAutoName(columns, d.column_id, d.operation, d.value);
      createFilter({
        name,
        table_id: tableId,
        column_id: d.column_id,
        operation: d.operation,
        value: needsValue(d.operation) ? d.value : null,
        is_active: true,
      } as any);
    });
    setDrafts([]);
  };

  const handleDeleteFilter = (filterId: string) => {
    deleteFilter({ filterId, tableId });
  };
    const toolbarLabelClass = embedded ? 'hidden' : 'hidden lg:inline';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <IconFilter className="h-4 w-4" />
          <span className={toolbarLabelClass}>Filter</span>
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
              {activeFilters.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[calc(100vw-2rem)] sm:w-[640px] md:w-[720px] max-w-[90vw] p-0"
        side="bottom"
        align="start"
        sideOffset={5}
        alignOffset={-16}
      >
        <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b">
          <h3 className="font-semibold text-sm sm:text-base">Filters</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setOpen(false)}
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="max-h-[60vh] sm:max-h-[70vh]">
          <div className="p-3 sm:p-4 space-y-4">
            {/* Active Filters (working) */}
            {hasActiveFilters && (
              <div className="space-y-2">
                {/* Replace <Label> with <div> for section heading */}
                <div className="text-xs text-muted-foreground uppercase">
                  Applied Filters
                </div>
                <div className="space-y-3 sm:space-y-2">
                  {activeFilters.map((filter, i) => (
                    <WorkingFilterRow
                      key={filter.id}
                      filter={filter}
                      index={i}
                      columns={columns}
                      onDelete={handleDeleteFilter}
                    />
                  ))}
                </div>
                <Separator className="my-4" />
              </div>
            )}

            {/* Draft Filters */}
            <div className="space-y-3">
              {/* Replace <Label> with <div> for section heading */}
              <div className="text-xs text-muted-foreground uppercase">
                Add Filters
              </div>

              <div className="space-y-3 sm:space-y-2">
                {drafts.map((row, idx) => (
                  <DraftRow
                    key={row.id}
                    row={row}
                    index={idx}
                    columns={columns}
                    onChange={(next) => updateDraft(row.id, next)}
                    needsValue={needsValue}
                    onRemove={() => removeDraft(row.id)}
                  />
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                <div className="flex items-center gap-3">
                  <Button
                    variant="link"
                    size="sm"
                    onClick={addDraft}
                    className="px-0 h-auto text-xs sm:text-sm"
                  >
                    <IconPlus className="h-3.5 w-3.5 mr-1" />
                    Add filter
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="px-0 h-auto opacity-50 text-xs sm:text-sm"
                    disabled
                  >
                    <IconPlus className="h-3.5 w-3.5 mr-1" />
                    <span className="hidden sm:inline">Add filter group</span>
                    <span className="sm:hidden">Group</span>
                  </Button>
                </div>

                <Button
                  size="sm"
                  onClick={handleApplyDrafts}
                  disabled={!drafts.length}
                  className="w-full sm:w-auto"
                >
                  Apply filters
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        {hasActiveFilters && (
          <div className="px-3 sm:px-4 py-2 border-t bg-muted/50">
            <p className="text-xs text-muted-foreground">
              {activeFilters.length} filter{activeFilters.length > 1 ? 's' : ''}{' '}
              applied
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
