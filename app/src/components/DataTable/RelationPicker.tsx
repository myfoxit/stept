import { useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  IconPlus,
  IconCheck,
  IconSearch,
  IconLoader2,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';

import { getRowPreview } from '@/lib/row-preview';
import { cn } from '@/lib/utils';
import { useColumns } from '@/hooks/api/columns';
import { useSearchRows, useRows } from '@/hooks/api/fields';
import { useAssignRelation, useUnAssignRelation } from '@/hooks/api/relations';

export interface RelationPickerProps<
  Row extends { id: string; name?: string }
> {
  /** ID of the relation as stored in the backend */
  relationId: string;
  /** Table whose rows should appear on the right–hand side */
  relationTableId: string | undefined;

  tableId: string | undefined;
  /** ID of the row on the left‑hand side (usually the row you are editing) */
  leftItemId: number;
  /** Currently linked row(s).  */
  value: Row | Row[] | null;
  /** Allow selecting more than one row */
  multiple?: boolean;
  /** Notified every time the selection changes (optimistic update) */
  onChange?: (rows: Row | Row[] | null) => void;
}

/**
 * A lightweight picker that immediately **assigns / un‑assigns** relations when
 * you click the _plus_ (➕) or _check_ (✔️) button.  No more "Save" / "Cancel"
 * footer — what you click is what you get.
 */
export function RelationPicker<Row extends { id: string; name?: string }>({
  relationId,
  relationTableId,
  tableId,
  leftItemId,
  value,
  multiple = false,
  onChange,
}: RelationPickerProps<Row>) {
  /* ──────────────────────────────────────────
   * State
   * ────────────────────────────────────────── */
  const [query, setQuery] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 20;

  /** Set of row IDs currently performing an API request */
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  /* ──────────────────────────────────────────
   * Data & mutations
   * ────────────────────────────────────────── */
  const { data: columns } = useColumns(relationTableId);

  // Use search when query exists, otherwise use regular rows
  const { data: searchResults } = useSearchRows(
    relationTableId || '',
    query,
    'global',
    pageSize,
    pageIndex * pageSize,
    { enabled: !!relationTableId && !!query }
  );

  const { data: rowsResponse } = useRows(
    relationTableId || '',
    true, // applyFilters
    true, // applySorts
    pageSize,
    pageIndex * pageSize,
  );

  const activeResults = query ? searchResults : rowsResponse;
  const rows = activeResults?.items ?? [];
  const total = activeResults?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const assignRelation = useAssignRelation();
  const unAssignRelation = useUnAssignRelation();

  /* ──────────────────────────────────────────
   * Handlers
   * ────────────────────────────────────────── */
  const handleSearch = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
    setPageIndex(0); // Reset to first page on new search
  }, []);

  const isSelected = (row: Row) => {
    if (!value) return false;
    if (multiple && Array.isArray(value)) {
      return value.some((r) => r.id === row.id);
    }
    return (value as Row).id === row.id;
  };

  /** Assign or un‑assign the given row and keep UI responsive. */
  const toggleRow = (row: Row) => {
    const currentlySelected = isSelected(row);

    // Prevent duplicate clicks while an action is already running.
    if (loadingIds.has(row.id)) return;

    setLoadingIds((prev) => new Set(prev).add(row.id));

    const mutation = currentlySelected ? unAssignRelation : assignRelation;
    const payload = {
      relationId,

      // IDs of the individual records
      left_item_id: leftItemId,
      right_item_id: Number(row.id), // convert Row.id → number

      // IDs of the tables (needed for cache invalidation)
      left_table_id: tableId,
      right_table_id: relationTableId, // may be undefined
    } as const;

    mutation.mutate(payload as any, {
      onSuccess: () => {
        if (!onChange) return;
        if (multiple) {
          if (Array.isArray(value)) {
            // Optimistically add/remove the row from the array
            const next = currentlySelected
              ? value.filter((r) => r.id !== row.id)
              : [...value, row];
            onChange(next as Row[]);
          } else {
            // Edge‑case: value was null but multiple=true
            onChange([row] as Row[]);
          }
        } else {
          onChange(currentlySelected ? null : row);
        }
      },
      onSettled: () => {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      },
    });
  };

  // Filter rows on the current page that match the search
  const filteredRows = useMemo(() => {
    // Server-side search handles filtering, so no need for client-side filtering
    return rows;
  }, [rows]);

  /* ──────────────────────────────────────────
   * Render
   * ────────────────────────────────────────── */
  return (
    <div className="flex w-full max-w-lg flex-col h-[500px]">
      {/* Header / search */}
      <div className="border-b p-4">
        <p className="font-semibold">Select record{multiple ? 's' : ''}</p>
        <div className="relative mt-2">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search records to link…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Results count */}
        {total > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            {query ? 'Found' : 'Showing'} {filteredRows.length} of {total} records
          </div>
        )}
      </div>

      {/* List */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <ul className="divide-y">
          {filteredRows.map((rawRow) => {
            const row = rawRow as unknown as Row;
            const selected = isSelected(row);
            const loading = loadingIds.has(row.id);
            const rowPreview = getRowPreview(rawRow, columns, ' • ');

            return (
              <li
                key={row.id}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 hover:bg-muted/50 transition-colors',
                  selected && 'bg-primary/5'
                )}
              >
                <div className="size-10 shrink-0 rounded-md bg-muted flex items-center justify-center text-xs font-medium">
                  #{row.id}
                </div>
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden max-w-[calc(100%-6rem)]">
                  <span className="truncate font-medium text-primary">
                    {row.name ?? `Row ${row.id}`}
                  </span>
                  {rowPreview && (
                    <span className="text-xs text-muted-foreground truncate">
                      {rowPreview}
                    </span>
                  )}
                </div>
                <Button
                  size="icon"
                  variant={selected ? 'secondary' : 'ghost'}
                  disabled={loading}
                  onClick={() => toggleRow(row)}
                  className="shrink-0"
                >
                  {loading ? (
                    <IconLoader2 className="size-4 animate-spin" />
                  ) : selected ? (
                    <IconCheck className="size-4" />
                  ) : (
                    <IconPlus className="size-4" />
                  )}
                </Button>
              </li>
            );
          })}

          {filteredRows.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {query ? 'No matching records found.' : 'No records found.'}
            </p>
          )}
        </ul>
      </ScrollArea>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
            disabled={pageIndex === 0}
          >
            <IconChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <div className="text-sm text-muted-foreground">
            Page {pageIndex + 1} of {totalPages}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex(Math.min(totalPages - 1, pageIndex + 1))}
            disabled={pageIndex >= totalPages - 1}
          >
            Next
            <IconChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
