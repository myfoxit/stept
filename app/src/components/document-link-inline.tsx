import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconLink, IconUnlink, IconCheck, IconX } from '@tabler/icons-react';

import { useProject } from '@/providers/project-provider';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TableSearch } from '@/components/DataTable/TableSearch/TableSearch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { IconChevronLeft, IconChevronRight, IconSearch } from '@tabler/icons-react';
import { getRowPreviewValues } from '@/lib/row-preview';
import { useColumns } from '@/hooks/api/columns';
import { useDocument, useLinkDocument, useUnlinkDocument } from '@/hooks/api/documents';
import { useSearchRows, useRows } from '@/hooks/api/fields';
import { useTables } from '@/hooks/api/tables';

interface DocumentLinkInlineProps {
  docId: string;
  className?: string;
}

export function DocumentLinkInline({
  docId,
  className,
}: DocumentLinkInlineProps) {
  const { selectedProjectId } = useProject();
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Pagination state
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 10;
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'global' | string>('global');
  const [showRowPicker, setShowRowPicker] = useState(false);

  const { data: document } = useDocument(docId);
  const { data: tables } = useTables(selectedProjectId || '');
  const { data: columns } = useColumns(selectedTable);
  
  // Use search when query exists, otherwise use regular rows
  const { data: searchResults } = useSearchRows(
    selectedTable,
    searchQuery,
    searchScope,
    pageSize,
    pageIndex * pageSize,
    { enabled: !!selectedTable && !!searchQuery }
  );
  
  const { data: rowsPage } = useRows(
    selectedTable,
    true, // applyFilters
    true, // applySorts
    pageSize,
    pageIndex * pageSize,
    { enabled: !!selectedTable && !searchQuery }
  );
  
  const activeResults = searchQuery ? searchResults : rowsPage;
  const rows = activeResults?.items;
  const total = activeResults?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const linkMutation = useLinkDocument();
  const unlinkMutation = useUnlinkDocument();

  // Initialize with existing link
  useEffect(() => {
    if (document?.linked_table_id) {
      setSelectedTable(document.linked_table_id);
      setSelectedRow(document.linked_row_id || null);
    }
  }, [document]);

  // Track if values have changed from original
  useEffect(() => {
    if (!isEditing) {
      setHasChanges(false);
      return;
    }

    const hasTableChanged = document?.linked_table_id !== selectedTable;
    const hasRowChanged = document?.linked_row_id !== selectedRow;
    setHasChanges(hasTableChanged || hasRowChanged);
  }, [selectedTable, selectedRow, document, isEditing]);

  const handleSave = async () => {
    if (!selectedTable || selectedRow === null) {
      toast.error('Please select both table and row');
      return;
    }

    try {
      await linkMutation.mutateAsync({
        docId,
        tableId: selectedTable,
        rowId: selectedRow,
      });
      toast.success('Link saved');
      setIsEditing(false);
      setHasChanges(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save link');
    }
  };

  const handleUnlink = async () => {
    try {
      await unlinkMutation.mutateAsync({ docId });
      toast.success('Document unlinked');
      setSelectedTable('');
      setSelectedRow(null);
      setIsEditing(false);
    } catch (error) {
      toast.error('Failed to unlink document');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setHasChanges(false);
    // Reset to document values
    if (document?.linked_table_id) {
      setSelectedTable(document.linked_table_id);
      setSelectedRow(document.linked_row_id || null);
    } else {
      setSelectedTable('');
      setSelectedRow(null);
    }
  };

  const getRowDisplay = (row: any) => {
    const rowId = row?.row_id || row?.id;
    const displayValues = getRowPreviewValues(row, columns, 2); // Less space in inline
    return { rowId, displayValues };
  };

  const hasLink = document?.linked_table_id != null;

  if (!selectedProjectId) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        No project selected
      </div>
    );
  }

  // View mode - show current link or add button
  if (!isEditing && !hasLink) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsEditing(true)}
        className={className}
      >
        <IconLink className="h-4 w-4 mr-2" />
       <span className="hidden sm:inline">Link to Table</span>
      </Button>
    );
  }

  // View mode - show existing link
  if (!isEditing && hasLink) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Badge
          variant="secondary"
          className="cursor-pointer"
          onClick={() => setIsEditing(true)}
        >
          <IconLink className="h-3 w-3 mr-1" />
          {document.linked_table?.name || 'Table'}
          <span className="ml-1 opacity-70">Row {document.linked_row_id}</span>
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleUnlink}
        >
          <IconUnlink className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Edit mode - inline selectors with save/cancel
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Select
        value={selectedTable}
        onValueChange={(value) => {
          setSelectedTable(value);
          setSelectedRow(null);
          setSearchQuery('');
          setPageIndex(0);
        }}
      >
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue placeholder="Select table" />
        </SelectTrigger>
        <SelectContent>
          {tables?.map((table) => (
            <SelectItem key={table.id} value={table.id}>
              {table.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedTable && (
        <Popover open={showRowPicker} onOpenChange={setShowRowPicker}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-8 w-[180px] justify-start"
            >
              {selectedRow ? (
                (() => {
                  const selectedRowData = rows?.find((r: any) => (r.row_id || r.id) === selectedRow);
                  const { displayValues } = selectedRowData ? getRowDisplay(selectedRowData) : { displayValues: [] };
                  return (
                    <span className="truncate">
                      Row {selectedRow}
                      {displayValues.length > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          ({displayValues[0]})
                        </span>
                      )}
                    </span>
                  );
                })()
              ) : (
                <>
                  <IconSearch className="h-3 w-3 mr-1" />
                  Select row...
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <div className="p-3 space-y-3">
              <div className="w-full overflow-hidden">
                <TableSearch
                  columns={columns}
                  onSearch={(q, s) => {
                    setSearchQuery(q);
                    setSearchScope(s);
                    setPageIndex(0);
                  }}
                  value={searchQuery}
                  scope={searchScope}
                  className="w-full max-w-full"
                  embedded={true}
                />
              </div>
              
              <div className="border rounded-md max-h-[250px] overflow-y-auto">
                {rows && rows.length > 0 ? (
                  <div className="divide-y">
                    {rows.map((row: any) => {
                      const { rowId, displayValues } = getRowDisplay(row);
                      if (!rowId) return null;
                      
                      return (
                        <button
                          key={rowId}
                          onClick={() => {
                            setSelectedRow(rowId);
                            setShowRowPicker(false);
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-left hover:bg-muted/50 text-sm",
                            selectedRow === rowId && "bg-primary/10"
                          )}
                        >
                          <div className="font-medium">Row {rowId}</div>
                          {displayValues.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {displayValues.join(' • ')}
                            </div>
                          )}
                        </button>
                      );
                    }).filter(Boolean)}
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {searchQuery ? 'No matching rows' : 'No rows'}
                  </div>
                )}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
                    disabled={pageIndex === 0}
                  >
                    <IconChevronLeft className="h-3 w-3" />
                  </Button>
                  
                  <span className="text-xs text-muted-foreground">
                    Page {pageIndex + 1} of {totalPages}
                  </span>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPageIndex(Math.min(totalPages - 1, pageIndex + 1))}
                    disabled={pageIndex >= totalPages - 1}
                  >
                    <IconChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Save button - only show when there are changes */}
      {hasChanges && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
          onClick={handleSave}
          disabled={
            !selectedTable || selectedRow === null || linkMutation.isPending
          }
        >
          <IconCheck className="h-4 w-4" />
        </Button>
      )}

      {/* Cancel button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleCancel}
      >
        <IconX className="h-4 w-4" />
      </Button>
    </div>
  );
}
                     