import React from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Table } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * DataTableNodeView — table embedding functionality was removed.
 * Displays a placeholder for any existing DataTable nodes in documents.
 */
export function DataTableNodeView({
  node,
  selected,
}: NodeViewProps) {
  return (
    <NodeViewWrapper
      className={cn(
        'data-table-node relative my-4',
        selected && 'ring-2 ring-primary'
      )}
    >
      <div className="flex flex-col items-center justify-center min-h-[100px] border-2 border-dashed rounded-lg bg-muted/20 p-4">
        <Table className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          Table embedding is no longer available.
        </p>
      </div>
    </NodeViewWrapper>
  );
}
