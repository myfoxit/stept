import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { IconLink, IconUnlink, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useProject } from '@/providers/project-provider';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { TableSearch } from '@/components/DataTable/TableSearch/TableSearch';
import { cn } from '@/lib/utils';
import { getRowPreviewValues } from '@/lib/row-preview';
import { useColumns } from '@/hooks/api/columns';
import { useDocument, useLinkDocument, useUnlinkDocument } from '@/hooks/api/documents';
import { useSearchRows, useRows } from '@/hooks/api/fields';
import { useTables } from '@/hooks/api/tables';

interface DocumentLinkDialogProps {
  docId: string;
}

export function DocumentLinkDialog({ docId }: DocumentLinkDialogProps) {
  const [open, setOpen] = useState(false);
  const { selectedProjectId, selectedProject } = useProject();
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  
  // Pagination state
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 20;
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'global' | string>('global');

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

  // Initialize form with existing link when dialog opens
  useEffect(() => {
    if (open && document?.linked_table_id) {
      setSelectedTable(document.linked_table_id);
      setSelectedRow(document.linked_row_id || null);
    }
  }, [open, document]);

  // Reset pagination when table or search changes
  useEffect(() => {
    setPageIndex(0);
  }, [selectedTable, searchQuery]);

  const handleSearch = (query: string, scope: 'global' | string) => {
    setSearchQuery(query);
    setSearchScope(scope);
    setPageIndex(0);
  };

  const handleSelectRow = async (rowId: number) => {
    setSelectedRow(rowId);
    
    try {
      await linkMutation.mutateAsync({
        docId,
        tableId: selectedTable,
        rowId,
      });
      toast.success('Link updated');
      setOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update link');
    }
  };

  const handleUnlink = async () => {
    try {
      await unlinkMutation.mutateAsync({ docId });
      toast.success('Document unlinked');
      setSelectedTable('');
      setSelectedRow(null);
      setOpen(false);
    } catch (error) {
      toast.error('Failed to unlink document');
    }
  };

  const getRowDisplay = (row: any) => {
    const rowId = row?.row_id || row?.id;
    const displayValues = getRowPreviewValues(row, columns, 3);
    return { rowId, displayValues };
  };

  const hasExistingLink = document?.linked_table_id != null;

  if (!selectedProjectId) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <IconLink className="h-4 w-4 mr-2" />
        No Project Selected
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <IconLink className="h-4 w-4 mr-2" />
          {hasExistingLink ? 'Update Link' : 'Link to Table'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Link to Table</DialogTitle>
          <DialogDescription>
            Connect this document to a row in {selectedProject?.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Current Link Display */}
          {hasExistingLink && document && (
            <div className="rounded-lg border p-3 bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Current Link
                  </Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline">
                      {document.linked_table?.name || 'Table'}
                    </Badge>
                    <span className="text-sm">Row {document.linked_row_id}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUnlink}
                >
                  <IconUnlink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Table Selection */}
          <div className="grid gap-2">
            <Label htmlFor="table">Table</Label>
            <Select
              value={selectedTable}
              onValueChange={(value) => {
                setSelectedTable(value);
                setSelectedRow(null);
                setSearchQuery('');
              }}
            >
              <SelectTrigger id="table">
                <SelectValue placeholder="Select a table" />
              </SelectTrigger>
              <SelectContent>
                {tables?.map((table) => (
                  <SelectItem key={table.id} value={table.id}>
                    {table.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search and Row Selection */}
          {selectedTable && (
            <>
              {/* Search bar - fix overflow */}
              <div className="grid gap-2">
                <Label>Search Rows</Label>
                <div className="w-full overflow-hidden">
                  <TableSearch
                    columns={columns}
                    onSearch={handleSearch}
                    value={searchQuery}
                    scope={searchScope}
                    embedded={true}  // Use embedded mode for better fit
                    className="w-full max-w-full"
                  />
                </div>
              </div>

              {/* Row List */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Select Row</Label>
                  {total > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {searchQuery ? 'Found' : 'Showing'} {rows?.length} of {total} rows
                    </span>
                  )}
                </div>
                
                <div className="border rounded-md max-h-[300px] overflow-y-auto">
                  {rows && rows.length > 0 ? (
                    <div className="divide-y">
                      {rows.map((row: any) => {
                        const { rowId, displayValues } = getRowDisplay(row);
                        if (!rowId) return null;
                        
                        const isSelected = selectedRow === rowId;
                        
                        return (
                          <button
                            key={rowId}
                            onClick={() => handleSelectRow(rowId)}
                            className={cn(
                              "w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors group",
                              isSelected && "bg-primary/10 hover:bg-primary/20"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="shrink-0">
                                    Row {rowId}
                                  </Badge>
                                  {isSelected && (
                                    <Badge variant="default" className="shrink-0">
                                      Selected
                                    </Badge>
                                  )}
                                </div>
                                {displayValues.length > 0 && (
                                  <div className="mt-1 text-sm text-muted-foreground">
                                    <div className="flex flex-wrap gap-1">
                                      {displayValues.map((val, idx) => (
                                        <span key={idx} className="inline-flex items-center">
                                          {idx > 0 && <span className="mx-1 text-muted-foreground/50">•</span>}
                                          <span className="truncate max-w-[200px]">{val}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      }).filter(Boolean)}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      {searchQuery ? 'No matching rows found' : 'No rows in this table'}
                    </div>
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
                      disabled={pageIndex === 0}
                    >
                      <IconChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    
                    <span className="text-sm text-muted-foreground">
                      Page {pageIndex + 1} of {totalPages}
                    </span>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPageIndex(Math.min(totalPages - 1, pageIndex + 1))}
                      disabled={pageIndex >= totalPages - 1}
                    >
                      Next
                      <IconChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}