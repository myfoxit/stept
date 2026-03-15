import * as React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import type { FieldRead, ViewSortRead } from '@/api/databases';

interface SortDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FieldRead[];
  currentSorts: ViewSortRead[];
  onSubmit: (sorts: { field_id: string; direction: string }[]) => void;
}

export function SortDialog({ open, onOpenChange, fields, currentSorts, onSubmit }: SortDialogProps) {
  const [sorts, setSorts] = React.useState<{ field_id: string; direction: string }[]>(
    currentSorts.map((s) => ({ field_id: s.field_id, direction: s.direction }))
  );

  React.useEffect(() => {
    setSorts(currentSorts.map((s) => ({ field_id: s.field_id, direction: s.direction })));
  }, [currentSorts]);

  const sortableFields = fields.filter((f) => !f.is_system || f.is_primary);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sort Records</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {sorts.map((sort, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select
                value={sort.field_id}
                onValueChange={(v) => {
                  const next = [...sorts];
                  next[idx] = { ...next[idx], field_id: v };
                  setSorts(next);
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {sortableFields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sort.direction}
                onValueChange={(v) => {
                  const next = [...sorts];
                  next[idx] = { ...next[idx], direction: v };
                  setSorts(next);
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">A → Z</SelectItem>
                  <SelectItem value="desc">Z → A</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSorts(sorts.filter((_, i) => i !== idx))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const firstField = sortableFields[0];
              if (firstField) setSorts([...sorts, { field_id: firstField.id, direction: 'asc' }]);
            }}
          >
            <Plus className="size-4 mr-1" /> Add sort
          </Button>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={() => {
            onSubmit(sorts.filter((s) => s.field_id));
            onOpenChange(false);
          }}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
