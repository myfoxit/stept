import * as React from 'react';
import { IconFilter, IconPlus, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import type { ColumnRead, FilterRead } from '@/types/openapi';
import { useFilters, useCreateFilter, useUpdateFilter, useDeleteFilter } from '@/hooks/api/filters';

interface FilterBarProps {
  tableId: string;
  columns?: ColumnRead[];
  activeFilterCount: number;
}

const OPERATION_LABELS: Record<string, string> = {
  equals: 'is equal',
  not_equals: 'is not equal',
  contains: 'contains',
  not_contains: 'does not contain',
  gt: 'greater than',
  lt: 'less than',
  gte: 'greater than or equal',
  lte: 'less than or equal',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  starts_with: 'starts with',
  ends_with: 'ends with',
  between: 'between',
  in: 'in',
  not_in: 'not in',
};

export function FilterBar({
  tableId,
  columns,
  activeFilterCount,
}: FilterBarProps) {
  const { data: filters = [] } = useFilters(tableId);
  const { mutate: createFilter } = useCreateFilter();
  const { mutate: updateFilter } = useUpdateFilter();
  const { mutate: deleteFilter } = useDeleteFilter();

  const [showFilters, setShowFilters] = React.useState(false);
  const [newFilter, setNewFilter] = React.useState<{
    columnId?: string;
    operation?: string;
    value?: any;
  }>({});

  const selectedColumn = columns?.find(
    (c) => c.id.toString() === newFilter.columnId
  );
  const allowedOperations = selectedColumn?.allowed_operations || [];

  const handleAddFilter = () => {
    if (!newFilter.columnId || !newFilter.operation) return;

    const column = columns?.find((c) => c.id.toString() === newFilter.columnId);
    if (!column) return;

    createFilter({
      name: `${column.display_name} ${OPERATION_LABELS[newFilter.operation]} ${
        newFilter.value || ''
      }`,
      table_id: tableId,
      column_id: newFilter.columnId,
      operation: newFilter.operation,
      value: newFilter.value,
    });

    setNewFilter({});
  };

  const handleRemoveFilter = (filterId: string) => {
    deleteFilter({ filterId, tableId });
  };

  const needsValue = (operation: string) => {
    return !['is_empty', 'is_not_empty'].includes(operation);
  };

  if (!showFilters) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowFilters(true)}
        className="gap-2"
      >
        <IconFilter className="h-4 w-4" />
        Filter
        {activeFilterCount > 0 && (
          <Badge variant="secondary" className="ml-1">
            {activeFilterCount}
          </Badge>
        )}
      </Button>
    );
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Filters</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowFilters(false)}>
          <IconX className="h-4 w-4" />
        </Button>
      </div>

      {/* Active Filters */}
      {filters.length > 0 && (
        <div className="space-y-2">
          {filters.map((filter) => (
            <div
              key={filter.id}
              className="flex items-center gap-2 p-2 bg-muted rounded"
            >
              <span className="text-sm flex-1">{filter.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveFilter(filter.id)}
              >
                <IconX className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add New Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Where</span>

        <Select
          value={newFilter.columnId}
          onValueChange={(value) =>
            setNewFilter({
              ...newFilter,
              columnId: value,
              operation: undefined,
            })
          }
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Column" />
          </SelectTrigger>
          <SelectContent>
            {columns?.map((col) => (
              <SelectItem key={col.id} value={col.id.toString()}>
                {col.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={newFilter.operation}
          onValueChange={(value) =>
            setNewFilter({ ...newFilter, operation: value })
          }
          disabled={!newFilter.columnId}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Operation" />
          </SelectTrigger>
          <SelectContent>
            {allowedOperations.map((op) => (
              <SelectItem key={op} value={op}>
                {OPERATION_LABELS[op] || op}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {newFilter.operation && needsValue(newFilter.operation) && (
          <Input
            className="w-[150px]"
            placeholder="Value"
            value={newFilter.value || ''}
            onChange={(e) =>
              setNewFilter({ ...newFilter, value: e.target.value })
            }
          />
        )}

        <Button
          size="sm"
          onClick={handleAddFilter}
          disabled={!newFilter.columnId || !newFilter.operation}
        >
          <IconPlus className="h-4 w-4" />
          Add filter
        </Button>
      </div>

      {filters.length > 0 && (
        <div className="text-xs text-muted-foreground">
          And conditions are applied between filters
        </div>
      )}
    </div>
  );
}
