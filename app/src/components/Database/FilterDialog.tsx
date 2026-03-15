import * as React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import type { FieldRead, ViewFilterRead } from '@/api/databases';

const OPERATORS: Record<string, { label: string; value: string }[]> = {
  text: [
    { label: 'contains', value: 'contains' },
    { label: 'does not contain', value: 'not_contains' },
    { label: 'is', value: 'eq' },
    { label: 'is not', value: 'neq' },
    { label: 'is empty', value: 'is_empty' },
    { label: 'is not empty', value: 'is_not_empty' },
  ],
  number: [
    { label: '=', value: 'eq' },
    { label: '!=', value: 'neq' },
    { label: '>', value: 'gt' },
    { label: '<', value: 'lt' },
    { label: '>=', value: 'gte' },
    { label: '<=', value: 'lte' },
    { label: 'is empty', value: 'is_empty' },
    { label: 'is not empty', value: 'is_not_empty' },
  ],
  boolean: [
    { label: 'is', value: 'eq' },
  ],
  select: [
    { label: 'is', value: 'eq' },
    { label: 'is not', value: 'neq' },
    { label: 'is empty', value: 'is_empty' },
    { label: 'is not empty', value: 'is_not_empty' },
  ],
};

function getOperators(fieldType: string) {
  if (['number', 'decimal', 'currency', 'percent', 'rating'].includes(fieldType)) return OPERATORS.number;
  if (['checkbox'].includes(fieldType)) return OPERATORS.boolean;
  if (['single_select', 'multi_select'].includes(fieldType)) return OPERATORS.select;
  return OPERATORS.text;
}

interface FilterRow {
  field_id: string;
  operator: string;
  value: any;
  conjunction: string;
}

interface FilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FieldRead[];
  currentFilters: ViewFilterRead[];
  onSubmit: (filters: FilterRow[]) => void;
}

export function FilterDialog({ open, onOpenChange, fields, currentFilters, onSubmit }: FilterDialogProps) {
  const [filters, setFilters] = React.useState<FilterRow[]>(
    currentFilters
      .filter((f) => f.field_id)
      .map((f) => ({ field_id: f.field_id!, operator: f.operator || 'contains', value: f.value ?? '', conjunction: f.conjunction }))
  );

  React.useEffect(() => {
    setFilters(
      currentFilters
        .filter((f) => f.field_id)
        .map((f) => ({ field_id: f.field_id!, operator: f.operator || 'contains', value: f.value ?? '', conjunction: f.conjunction }))
    );
  }, [currentFilters]);

  const filterableFields = fields.filter((f) => !f.is_system || f.is_primary);

  const noValueOps = ['is_empty', 'is_not_empty'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Filter Records</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {filters.map((filter, idx) => {
            const field = fields.find((f) => f.id === filter.field_id);
            const ops = field ? getOperators(field.field_type) : OPERATORS.text;
            return (
              <div key={idx} className="flex items-center gap-2">
                {idx > 0 && (
                  <Select
                    value={filter.conjunction}
                    onValueChange={(v) => {
                      const next = [...filters];
                      next[idx] = { ...next[idx], conjunction: v };
                      setFilters(next);
                    }}
                  >
                    <SelectTrigger className="w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="and">And</SelectItem>
                      <SelectItem value="or">Or</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {idx === 0 && <span className="text-sm text-muted-foreground w-16 text-center">Where</span>}
                <Select
                  value={filter.field_id}
                  onValueChange={(v) => {
                    const next = [...filters];
                    next[idx] = { ...next[idx], field_id: v };
                    setFilters(next);
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    {filterableFields.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filter.operator}
                  onValueChange={(v) => {
                    const next = [...filters];
                    next[idx] = { ...next[idx], operator: v };
                    setFilters(next);
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ops.map((op) => (
                      <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!noValueOps.includes(filter.operator) && (
                  <Input
                    className="w-28"
                    value={filter.value ?? ''}
                    onChange={(e) => {
                      const next = [...filters];
                      next[idx] = { ...next[idx], value: e.target.value };
                      setFilters(next);
                    }}
                    placeholder="Value"
                  />
                )}
                <Button variant="ghost" size="icon" onClick={() => setFilters(filters.filter((_, i) => i !== idx))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const firstField = filterableFields[0];
              if (firstField) {
                setFilters([...filters, { field_id: firstField.id, operator: 'contains', value: '', conjunction: 'and' }]);
              }
            }}
          >
            <Plus className="size-4 mr-1" /> Add filter
          </Button>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={() => {
            onSubmit(filters.filter((f) => f.field_id));
            onOpenChange(false);
          }}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
