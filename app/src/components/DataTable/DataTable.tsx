// components/DataTable/DataTable.tsx
'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type ColumnSizingInfoState,
  type ColumnSizingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { IconDotsVertical, IconSearch, IconX, IconLayoutColumns, IconFileSpreadsheet, IconUpload } from '@tabler/icons-react';
import { IconPlus, IconChevronDown } from '@tabler/icons-react'; // CHANGED: add chevron, keep plus





import { TableSearch } from '@/components/DataTable/TableSearch/TableSearch';
import { FilterPopover } from '@/components/DataTable/FilterPopover';
import { SortPopover } from '@/components/DataTable/SortPopover';
import { AddColumnPopover } from '@/components/DataTable/AddColumnPopover';
import { SelectionOverlay } from '@/components/DataTable/SpreadsheetMode/SelectionOverlay';
import { ImportExcelDialog } from '@/components/DataTable/ImportExcelDialog';
import { SpreadsheetProvider, useSpreadsheet } from '@/components/DataTable/SpreadsheetMode/SpreadsheetContext';
import { getDynamicColumns } from '@/components/DataTable/columns';
import { listRows, searchRows } from '@/api/fields';
import { useRowsVirtual } from '@/hooks/useRowsVirtual';
import { useColumnVisibility, useBulkUpdateVisibility } from '@/hooks/api/column_visibilities';
import { useColumns, useAddColumn, useReorderColumn } from '@/hooks/api/columns';
import { useInsertRow } from '@/hooks/api/fields';
import { useTable } from '@/hooks/api/tables';

const ROW_HEIGHT = 34;
// Increase overscan for snappier keyboard nav (more rows preloaded)
const VIRTUAL_OVERSCAN = 30;

// NEW: sticky bottom-left "New record" bar inside the scroll area
function NewRecordBar() {
  const { addRowAndFocus } = useSpreadsheet();
  return (
    <div className="sticky bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-background/95 to-transparent pointer-events-none">
      <div className="px-3 py-2">
        <button
          type="button"
          onClick={() => addRowAndFocus?.(1)}
          className="pointer-events-auto inline-flex items-center gap-2  border bg-background px-3 py-1.5 text-sm shadow-sm hover:bg-muted active:translate-y-[0.5px] transition"
          aria-label="New record"
          title="New record"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center bg-background">
            <IconPlus size={14} />
          </span>
          <span>New record</span>
          <IconChevronDown size={14} className="text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

export function DataTable({
  tableId,
  embedded = false,
}: {
  tableId: string;
  embedded?: boolean;
}) {
  // state
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pageSize, _setPageSize] = React.useState(100);
  const [applyFilters, _setApplyFilters] = React.useState(true);
  const [applySorts, _setApplySorts] = React.useState(true);
  const [spreadsheetMode] = React.useState(true);
  const [showSearch, setShowSearch] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchScope, setSearchScope] = React.useState<'global' | string>('global');
  const [showImportDialog, setShowImportDialog] = React.useState(false);
  const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null);

  // sizing
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [columnSizingInfo, setColumnSizingInfo] = React.useState<ColumnSizingInfoState>({} as ColumnSizingInfoState);

  // data + metadata
  const { data: cols, isLoading: colsLoading } = useColumns(tableId);
  const { data: savedVisibility } = useColumnVisibility(tableId);
  const { mutate: updateVisibility } = useBulkUpdateVisibility();
  const { data: tableData } = useTable(tableId);
  const { mutate: addColumn } = useAddColumn(tableId);
  const { mutate: insertRow } = useInsertRow();
  const { mutate: _reorderColumn } = useReorderColumn();
  const queryClient = useQueryClient();

  // Debounced visibility persist (browser-safe type)
  const saveVisibilityDebounced = React.useMemo(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    return (visibility: VisibilityState) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!cols) return;
        const map: Record<string, boolean> = {};
        Object.entries(visibility).forEach(([name, isVisible]) => {
          const c = cols.find((cc) => cc.name === name);
          if (c) map[c.id] = !!isVisible;
        });
        updateVisibility({
          table_id: tableId,
          updates: Object.entries(map).map(([column_id, is_visible]) => ({ column_id, is_visible })),
        });
      }, 400);
    };
  }, [cols, tableId, updateVisibility]);

  // Init visibility from server once cols + prefs arrive
  React.useEffect(() => {
    if (!savedVisibility || !cols) return;
    const vs: VisibilityState = {};
    cols.forEach((c) => (vs[c.name] = true));
    savedVisibility.forEach((pref) => {
      const c = cols.find((cc) => String(cc.id) === pref.column_id);
      if (c) vs[c.name] = pref.is_visible;
    });
    setColumnVisibility(vs);
  }, [savedVisibility, cols]);

  const onVisibilityChange = React.useCallback(
    (updater: React.SetStateAction<VisibilityState>) => {
      setColumnVisibility((prev) => {
        const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
        saveVisibilityDebounced(next);
        return next;
      });
    },
    [saveVisibilityDebounced]
  );

  // Query the virtual data window
  const dataWindow = useRowsVirtual({
    tableId,
    pageSize,
    searchQuery,
    searchScope,
    applyFilters,
    applySorts,
    listRows,
    searchRows,
  });

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: Math.max(0, dataWindow.total),
    getScrollElement: () => scrollEl,
    estimateSize: () => ROW_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
  });

  const vItems = rowVirtualizer.getVirtualItems();
  const paddingTop = vItems.length ? vItems[0].start : 0;
  const paddingBottom = vItems.length
    ? rowVirtualizer.getTotalSize() - vItems[vItems.length - 1].end
    : 0;

  // Prefetch when user nears end of loaded rows
  React.useEffect(() => {
    if (!vItems.length) return;
    const last = vItems[vItems.length - 1].index;
    dataWindow.ensureLoadedForIndex(last);
  }, [vItems, dataWindow.ensureLoadedForIndex]);

  const rowsForRender = React.useMemo(() => {
    // Build a sparse array of what we will render (placeholders for unloaded rows)
    return vItems.map((vi) => ({
      vi,
      row: dataWindow.getRow(vi.index) ?? { __placeholder: true, id: `ph-${vi.index}` },
    }));
  }, [vItems, dataWindow.getRow]);

  // Columns
  const columns = React.useMemo(
    () => getDynamicColumns(
      // the table only needs to know the shape; pass a small sample to avoid expensive recalcs
      rowsForRender.slice(0, 1).map((r) => r.row.__placeholder ? {} : r.row),
      cols,
      tableId,
      spreadsheetMode
    ),
    [rowsForRender, cols, tableId, spreadsheetMode]
  );

  // Add effect to invalidate data when query client invalidates fields
  React.useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event?.type === 'updated' &&
        event?.query?.queryKey?.[0] === 'selectOptions'
      ) {
        // When select options update, invalidate the data window
        dataWindow.invalidate();
      }
    });

    return unsubscribe;
  }, [queryClient, dataWindow.invalidate]);

  // Table
  const table = useReactTable({
    data: rowsForRender.map((r) => r.row),
    columns,
    state: { sorting, columnVisibility, rowSelection, columnFilters, columnSizing, columnSizingInfo },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: onVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    // IDs: use stable id or placeholder id
    getRowId: (row: any) => (row?.id != null ? String(row.id) : String(row?.__placeholder ? row.id : Math.random())),
    defaultColumn: React.useMemo(() => ({ size: 180, minSize: 50, maxSize: 800 }), []),
    columnResizeMode: 'onChange',
    onColumnSizingChange: setColumnSizing,
    onColumnSizingInfoChange: setColumnSizingInfo,
    manualPagination: true, // not using table pagination; we provide data manually
    pageCount: 1,
  });

  // Column offsets for the selection overlay (cumulative)
  const colOffsets = React.useMemo(() => {
    const sizes = table.getVisibleLeafColumns().map((c) => c.getSize());
    const off: number[] = [0];
    for (let i = 0; i < sizes.length; i++) off.push(off[i] + (sizes[i] ?? 0));
    return off;
  }, [table.getState().columnSizing, table.getVisibleLeafColumns().length]);

  // Toolbar helpers
  const handleAddRow = React.useCallback(() => {
    if (!cols) return;
    const realCols = cols.filter((c) => c.column_type !== 'virtual');
    const empty = realCols.reduce<Record<string, any>>((acc, c) => {
      acc[c.name] = null;
      return acc;
    }, {});
    insertRow(
      { table_id: tableId, data: empty },
      {
        onSuccess: () => {
          // Invalidate the virtual window query
          dataWindow.invalidate();
        }
      }
    );
  }, [cols, insertRow, tableId, dataWindow.invalidate]);

  const handleAddColumn = React.useCallback(
    (name: string, type: string, position?: 'left' | 'right', referenceColumnId?: string) => {
      addColumn({ table_id: tableId, name, ui_type: type, position, reference_column_id: referenceColumnId });
    },
    [addColumn, tableId]
  );

  const handleSearch = React.useCallback((q: string, scope: 'global' | string) => {
    setSearchQuery(q);
    setSearchScope(scope);
    rowVirtualizer.scrollToIndex(0, { align: 'start' }); // jump to top for new query
  }, [rowVirtualizer]);

  const handleClearSearch = React.useCallback(() => {
    setSearchQuery('');
    setSearchScope('global');
    rowVirtualizer.scrollToIndex(0, { align: 'start' });
  }, [rowVirtualizer]);

  const toolbarLabelClass = embedded ? 'hidden' : 'hidden lg:inline';
  const _isLoading = colsLoading || dataWindow.isLoading;

  return (
    <SpreadsheetProvider
      enabled={spreadsheetMode}
      totalRows={dataWindow.total}
      visibleCols={table.getVisibleLeafColumns().length}
      onAddRow={handleAddRow}
      scrollToIndex={(i, opts) => rowVirtualizer.scrollToIndex(i, opts)}
      renderBaseIndex={vItems.length ? vItems[0].index : 0}
      maxVisibleRowIndex={vItems.length ? vItems[vItems.length - 1].index : 0}
      invalidateData={dataWindow.invalidate} // NEW: pass invalidate function
    >
      <div className="w-full flex flex-col justify-start gap-2">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2">
            {searchQuery && (
              <Badge variant="secondary" className="gap-1">
                <IconSearch size={14} />
                {searchScope === 'global' ? 'Searching all' : `Searching ${searchScope}`}
                <button onClick={handleClearSearch} className="ml-1 hover:bg-muted rounded-sm p-0.5">
                  <IconX size={12} />
                </button>
              </Badge>
            )}
            {/* Filter: ensure trigger has stable test id */}
            <FilterPopover
              tableId={tableId}
              columns={cols}
            />
            <SortPopover tableId={tableId} columns={cols} embedded={embedded} />

            {/* Customize (visibility) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer"
                  data-testid="column-visibility-button"
                >
                  <IconLayoutColumns />
                  <span className={toolbarLabelClass}>Customize</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="start"
                className="w-56"
                role="menu"
                aria-label="Column Visibility"
              >
                <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                  Column Visibility
                </div>
                {table
                  .getAllColumns()
                  .filter((c) => typeof c.accessorFn !== 'undefined' && c.getCanHide())
                  .map((c) => {
                    const friendly =
                      cols?.find((cc) => cc.name === c.id)?.display_name || c.id;
                    return (
                      <DropdownMenuCheckboxItem
                        key={c.id}
                        className="capitalize cursor-pointer"
                        checked={c.getIsVisible()}
                        onCheckedChange={(v) => c.toggleVisibility(!!v)}
                      >
                        {friendly}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="cursor-pointer">
                  <IconDotsVertical />
                  <span className={toolbarLabelClass}>More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="start">
                <DropdownMenuItem onClick={() => setShowImportDialog(true)} className="cursor-pointer">
                  <IconFileSpreadsheet className="mr-2 h-4 w-4" />
                  Import Excel/CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer">
                  <IconUpload className="mr-2 h-4 w-4" />
                  Export to Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 relative">
            <div className="hidden md:flex">
              <TableSearch
                columns={cols}
                embedded={embedded}
                onSearch={handleSearch}
                value={searchQuery}
                scope={searchScope}
              />
            </div>
            <Button variant="ghost" size="sm" className="cursor-pointer md:hidden" onClick={() => setShowSearch(true)}>
              <IconSearch />
            </Button>
            {showSearch && (
              <div className="fixed inset-x-0 top-0 z-50 md:hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-background border-b shadow-md">
                  <TableSearch
                    columns={cols}
                    className="flex-1"
                    embedded={false}
                    onSearch={handleSearch}
                    value={searchQuery}
                    scope={searchScope}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer" onClick={() => setShowSearch(false)}>
                    <IconX size={16} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="relative flex flex-col gap-4 px-4 lg:px-6">
          <div className="relative max-h-[70vh] overflow-auto" ref={setScrollEl}>
            {spreadsheetMode && (
              <SelectionOverlay
                scrollEl={scrollEl}
                colOffsets={colOffsets}
                rowHeight={ROW_HEIGHT}
              />
            )}

            <table className="w-full table-fixed border-separate border-spacing-0">
              <thead className="sticky top-0 z-20 bg-muted">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => {
                      if (h.isPlaceholder) return <th key={h.id} className="border-b border-muted" />;
                      const col = h.column;
                      return (
                        <th
                          key={h.id}
                          colSpan={h.colSpan}
                          style={{ width: h.getSize(), minWidth: (col.columnDef as any)?.minSize ?? 50 }}
                          className="relative border border-gray-200 px-2 text-left text-sm font-medium sticky top-0 bg-muted"
                        >
                          <div className="flex w-full items-center gap-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                            {flexRender(col.columnDef.header, h.getContext())}
                          </div>
                          {col.getCanResize() && (
                            <div
                              onMouseDown={h.getResizeHandler()}
                              onTouchStart={h.getResizeHandler()}
                              className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none ${
                                col.getIsResizing() ? 'bg-primary' : 'bg-transparent'
                              }`}
                              aria-hidden="true"
                            />
                          )}
                        </th>
                      );
                    })}
                    <th className="border border-gray-200 w-16">
                      <AddColumnPopover tableId={tableId} columns={cols} onAdd={handleAddColumn} />
                    </th>
                  </tr>
                ))}
              </thead>

              <tbody className="**:data-[slot=table-cell]:first:w-8">
                {/* spacer before */}
                <tr>
                  <td colSpan={table.getVisibleLeafColumns().length + 1} style={{ height: paddingTop }} />
                </tr>

                {rowsForRender.map(({ vi, row }) => {
                  const isPlaceholder = !!row.__placeholder;
                  const tRow = isPlaceholder ? undefined : table.getRowModel().rows.find(r => r.id === String(row.id));
                  // When data is sparse, we render cells by columns directly for placeholders
                  return (
                    <tr key={vi.key} data-row-index={vi.index} style={{ height: vi.size }} className="group transition-colors hover:bg-gray-100">
                      {isPlaceholder
                        ? table.getVisibleLeafColumns().map((col) => (
                            <td key={`${col.id}-${vi.index}`} style={{ width: col.getSize() }} className="border border-muted px-0 text-sm align-middle">
                              <div className="p-2">
                                <div className="h-5 w-full animate-pulse bg-muted rounded" />
                              </div>
                            </td>
                          ))
                        : table
                            .getVisibleLeafColumns()
                            .map((col) => {
                              const cellCtx = {
                                table: table as any,
                                row: { ...tRow, original: row } as any,
                                column: col as any,
                                getValue: () => (row as any)[col.id],
                              } as any;
                              return (
                                <td key={`${col.id}-${row.id}`} style={{ width: col.getSize() }} className="border border-muted px-0 text-sm align-middle">
                                  {flexRender(col.columnDef.cell, cellCtx)}
                                </td>
                              );
                            })}
                    </tr>
                  );
                })}

                {/* Thin loader if we’re fetching into the visible range */}
                {(() => {
                  if (!vItems.length) return null;
                  const start = Math.max(0, vItems[0].index - pageSize);
                  const end = vItems[vItems.length - 1].index + pageSize;
                  if (!dataWindow.isLoadingRange(start, end)) return null;
                  return (
                    <tr>
                      <td colSpan={table.getVisibleLeafColumns().length + 1}>
                        <div className="h-1 bg-primary/40 w-24 mx-auto rounded-full" />
                      </td>
                    </tr>
                  );
                })()}

                {/* spacer after */}
                <tr>
                  <td colSpan={table.getVisibleLeafColumns().length + 1} style={{ height: paddingBottom }} />
                </tr>
              </tbody>
            </table>

            {/* NEW: bottom-left sticky "New record" button like in the screenshot */}
            <NewRecordBar />
          </div>
        </div>

        {/* Import Dialog */}
        {showImportDialog && (
          <ImportExcelDialog
            tableId={tableId}
            existingColumns={cols ?? []}
            projectId={tableData?.project_id != null ? String(tableData.project_id) : undefined}
            onClose={() => setShowImportDialog(false)}
            onImportComplete={() => {
              setShowImportDialog(false);
              window.location.reload();
            }}
          />
        )}
      </div>

     
    </SpreadsheetProvider>
  );
}
