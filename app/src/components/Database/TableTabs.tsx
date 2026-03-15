import * as React from 'react';
import { Plus } from 'lucide-react';
import type { TableSummary } from '@/api/databases';
import { cn } from '@/lib/utils';

interface TableTabsProps {
  tables: TableSummary[];
  activeTableId: string | null;
  onSelectTable: (tableId: string) => void;
  onAddTable: () => void;
}

export function TableTabs({ tables, activeTableId, onSelectTable, onAddTable }: TableTabsProps) {
  return (
    <div className="flex items-center gap-0 border-t border-border bg-muted/30 px-2">
      {tables
        .sort((a, b) => a.position - b.position)
        .map((table) => (
          <button
            key={table.id}
            type="button"
            onClick={() => onSelectTable(table.id)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium border-b-2 transition-colors cursor-pointer bg-transparent',
              table.id === activeTableId
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
            )}
          >
            {table.name}
          </button>
        ))}
      <button
        type="button"
        onClick={onAddTable}
        className="px-2 py-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none"
        title="Add table"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
