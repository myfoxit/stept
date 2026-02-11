import React, { useState, useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { DataTable } from '@/components/DataTable/DataTable';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { IconSettings, IconTable } from '@tabler/icons-react';

import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { useTables } from '@/hooks/api/tables';

export function DataTableNodeView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const { tableId, tableName } = node.attrs;
  const [isConfigOpen, setIsConfigOpen] = useState(!tableId);
  const {
    selectedProjectId,
    selectedProject,
    setSelectedProjectId,
    projects,
    createProject,
    isLoading: projectsLoading,
    updateProject,
    deleteProject,
  } = useProject();
  const { data: tables = [] } = useTables(selectedProjectId);

  const handleTableSelect = (newTableId: string) => {
    const selectedTable = tables.find((t) => t.id === newTableId);
    updateAttributes({
      tableId: newTableId,
      tableName: selectedTable?.name || '',
    });
    setIsConfigOpen(false);
  };

  useEffect(() => {
    if (!tableId && tables.length > 0) {
      setIsConfigOpen(true);
    }
  }, [tableId, tables]);

  return (
    <NodeViewWrapper
      className={cn(
        'data-table-node relative my-4',
        selected && 'ring-2 ring-primary'
      )}
    >
      {!tableId ? (
        <div className="flex flex-col items-center justify-center min-h-[200px] border-2 border-dashed rounded-lg bg-muted/20">
          <IconTable className="h-12 w-12 text-muted-foreground mb-4" />
          <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <IconSettings className="mr-2 h-4 w-4" />
                Configure DataTable
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Select a Table</DialogTitle>
                <DialogDescription>
                  Choose which table to display in this DataTable component.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Select onValueChange={handleTableSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a table" />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map((table) => (
                      <SelectItem key={table.id} value={table.id}>
                        {table.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <>
          {selected && (
            <div className="absolute top-2 right-2 z-10">
              <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="secondary" className="h-8 w-8">
                    <IconSettings className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>DataTable Settings</DialogTitle>
                    <DialogDescription>
                      Configure the table displayed in this component.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <Select value={tableId} onValueChange={handleTableSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a table" />
                      </SelectTrigger>
                      <SelectContent>
                        {tables.map((table) => (
                          <SelectItem key={table.id} value={table.id}>
                            {table.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="data-table-wrapper flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <DataTable tableId={tableId} embedded={true}/>
            </div>
          </div>
        </>
      )}
    </NodeViewWrapper>
  );
}
