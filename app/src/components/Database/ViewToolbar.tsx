import * as React from 'react';
import { ArrowUpDown, Filter, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { ViewSummary, ViewSortRead, ViewFilterRead, FieldRead } from '@/api/databases';
import { SortDialog } from './SortDialog';
import { FilterDialog } from './FilterDialog';
import { AddFieldDialog } from './AddFieldDialog';
import { Badge } from '@/components/ui/badge';

interface ViewToolbarProps {
  views: ViewSummary[];
  activeViewId: string | null;
  onSelectView: (viewId: string) => void;
  fields: FieldRead[];
  currentSorts: ViewSortRead[];
  currentFilters: ViewFilterRead[];
  onUpdateSorts: (sorts: { field_id: string; direction: string }[]) => void;
  onUpdateFilters: (filters: { field_id?: string; operator?: string; value?: any; conjunction?: string }[]) => void;
  onAddField: (data: { name: string; field_type: string; options?: Record<string, any> }) => void;
  isAddingField?: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function ViewToolbar({
  views,
  activeViewId,
  onSelectView,
  fields,
  currentSorts,
  currentFilters,
  onUpdateSorts,
  onUpdateFilters,
  onAddField,
  isAddingField,
  searchQuery,
  onSearchChange,
}: ViewToolbarProps) {
  const [sortOpen, setSortOpen] = React.useState(false);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [addFieldOpen, setAddFieldOpen] = React.useState(false);

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background">
      {views.length > 1 && (
        <Select value={activeViewId || ''} onValueChange={onSelectView}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Select view" />
          </SelectTrigger>
          <SelectContent>
            {views.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1"
        onClick={() => setSortOpen(true)}
      >
        <ArrowUpDown className="size-3.5" />
        Sort
        {currentSorts.length > 0 && (
          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{currentSorts.length}</Badge>
        )}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1"
        onClick={() => setFilterOpen(true)}
      >
        <Filter className="size-3.5" />
        Filter
        {currentFilters.filter((f) => f.field_id).length > 0 && (
          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
            {currentFilters.filter((f) => f.field_id).length}
          </Badge>
        )}
      </Button>

      <div className="flex-1" />

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          className="h-8 w-48 pl-7 text-sm"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1"
        onClick={() => setAddFieldOpen(true)}
      >
        <Plus className="size-3.5" />
        Field
      </Button>

      <SortDialog
        open={sortOpen}
        onOpenChange={setSortOpen}
        fields={fields}
        currentSorts={currentSorts}
        onSubmit={onUpdateSorts}
      />

      <FilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        fields={fields}
        currentFilters={currentFilters}
        onSubmit={onUpdateFilters}
      />

      <AddFieldDialog
        open={addFieldOpen}
        onOpenChange={setAddFieldOpen}
        onSubmit={(data) => {
          onAddField(data);
          setAddFieldOpen(false);
        }}
        isPending={isAddingField}
      />
    </div>
  );
}
