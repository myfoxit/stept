import * as React from 'react';
import { 
  IconArrowsSort, 
  IconPlus, 
  IconX, 
  IconTrash,
  IconArrowUp,
  IconArrowDown,
  IconGripVertical 
} from '@tabler/icons-react';
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
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

import type { ColumnRead } from '@/types/openapi';
import type { SortRead } from '@/api/sorts';
import { useSorts, useCreateSort, useUpdateSort, useDeleteSort, useClearTableSorts } from '@/hooks/api/sorts';

interface SortPopoverProps {
  tableId: string;
  columns?: ColumnRead[];
  embedded?: boolean;
}

interface DraftSort {
  id: string;
  column_id: string;
  direction: 'asc' | 'desc';
}

const SortRow: React.FC<{
  sort: SortRead;
  index: number;
  columns?: ColumnRead[];
  onDelete: (sortId: string) => void;
  onToggleDirection: (sortId: string, newDirection: 'asc' | 'desc') => void;
}> = React.memo(({ sort, index, columns, onDelete, onToggleDirection }) => {
  const column = columns?.find(c => c.id.toString() === sort.column_id);
  
  return (
    <div className="flex items-center gap-2 py-1">
      <IconGripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
      
      <div className="flex-1 flex items-center gap-2">
        <span className="text-sm">{column?.display_name || 'Unknown'}</span>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onToggleDirection(sort.id, sort.direction === 'asc' ? 'desc' : 'asc')}
        >
          {sort.direction === 'asc' ? 
            <IconArrowUp className="h-3.5 w-3.5" /> : 
            <IconArrowDown className="h-3.5 w-3.5" />
          }
        </Button>
      </div>
      
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={() => onDelete(sort.id)}
      >
        <IconTrash className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});

const DraftRow: React.FC<{
  draft: DraftSort;
  columns?: ColumnRead[];
  onChange: (draft: DraftSort) => void;
  onRemove: () => void;
}> = React.memo(({ draft, columns, onChange, onRemove }) => {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex-1 grid grid-cols-2 gap-2">
        <Select
          value={draft.column_id}
          onValueChange={(value) => onChange({ ...draft, column_id: value })}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select column" />
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
          value={draft.direction}
          onValueChange={(value) => onChange({ ...draft, direction: value as 'asc' | 'desc' })}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">
              <span className="flex items-center gap-1">
                <IconArrowUp className="h-3 w-3" /> Ascending
              </span>
            </SelectItem>
            <SelectItem value="desc">
              <span className="flex items-center gap-1">
                <IconArrowDown className="h-3 w-3" /> Descending
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={onRemove}
      >
        <IconTrash className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});

export function SortPopover({ tableId, columns, embedded }: SortPopoverProps) {
  const { data: sorts = [] } = useSorts(tableId);
  const { mutate: createSort } = useCreateSort();
  const { mutate: updateSort } = useUpdateSort();
  const { mutate: deleteSort } = useDeleteSort();
  const { mutate: clearSorts } = useClearTableSorts();
  
  const [open, setOpen] = React.useState(false);
  const [drafts, setDrafts] = React.useState<DraftSort[]>([]);
  
  const activeSorts = React.useMemo(() => 
    sorts.filter(s => s.is_active).sort((a, b) => a.priority - b.priority),
    [sorts]
  );
  
  const toolbarLabelClass = embedded ? 'hidden' : 'hidden lg:inline';
  
  const handleAddDraft = () => {
    if (!columns?.length) return;
    setDrafts(prev => [...prev, {
      id: crypto.randomUUID(),
      column_id: columns[0].id.toString(),
      direction: 'asc',
    }]);
  };
  
  const handleApplyDrafts = () => {
    drafts.forEach((draft, index) => {
      if (draft.column_id) {
        createSort({
          table_id: tableId,
          column_id: draft.column_id,
          direction: draft.direction,
          priority: activeSorts.length + index,
          is_active: true,
        });
      }
    });
    setDrafts([]);
  };
  
  const handleDeleteSort = (sortId: string) => {
    deleteSort({ sortId, tableId });
  };
  
  const handleToggleDirection = (sortId: string, newDirection: 'asc' | 'desc') => {
    updateSort({ sortId, updates: { direction: newDirection }, tableId });
  };
  
  const handleClearAll = () => {
    clearSorts(tableId);
  };
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 cursor-pointer"
          data-testid="sort-button"
          data-has-sorts={activeSorts.length > 0 ? 'true' : 'false'}
        >
          <IconArrowsSort className="h-4 w-4" />
          <span className={toolbarLabelClass}>Sort</span>
          {activeSorts.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 px-1.5 py-0.5 text-xs"
              data-testid="sort-count-badge"
            >
              {activeSorts.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent
        className="w-[calc(100vw-2rem)] sm:w-[350px] md:w-[350px] max-w-[90vw] p-0"
        side="bottom"
        align="start"
        sideOffset={5}
        alignOffset={-16}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Sort</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setOpen(false)}
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>
        
        <ScrollArea className="max-h-[400px]">
          <div className="p-4 space-y-4">
            {/* Active sorts */}
            {activeSorts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase">
                    Active sorts
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={handleClearAll}
                    className="text-xs p-0 h-auto"
                  >
                    Clear all
                  </Button>
                </div>
                <div className="space-y-1">
                  {activeSorts.map((sort, i) => (
                    <SortRow
                      key={sort.id}
                      sort={sort}
                      index={i}
                      columns={columns}
                      onDelete={handleDeleteSort}
                      onToggleDirection={handleToggleDirection}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Draft sorts */}
            {drafts.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground uppercase">
                  Add sorts
                </span>
                <div className="space-y-1">
                  {drafts.map((draft) => (
                    <DraftRow
                      key={draft.id}
                      draft={draft}
                      columns={columns}
                      onChange={(updated) => 
                        setDrafts(prev => prev.map(d => d.id === draft.id ? updated : d))
                      }
                      onRemove={() => 
                        setDrafts(prev => prev.filter(d => d.id !== draft.id))
                      }
                    />
                  ))}
                </div>
                
                <Button
                  size="sm"
                  onClick={handleApplyDrafts}
                  className="w-full"
                >
                  Apply sorts
                </Button>
              </div>
            )}
            
            <Button
              variant="link"
              size="sm"
              onClick={handleAddDraft}
              className="px-0 h-auto text-xs"
            >
              <IconPlus className="h-3.5 w-3.5 mr-1" />
              Add sort
            </Button>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
