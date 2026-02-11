import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectItem,
  SelectContent,
  SelectValue, // NEW
} from '@/components/ui/select';

import type { ColumnRead } from '@/types/openapi';
import { useColumns } from '@/hooks/api/columns';

interface Props {
  tableId: string;
  columns: ColumnRead[];
  name: string;
  onNameChange: (s: string) => void;
  onCancel: () => void;
  onSubmit: (cfg: {
    relation_column_id: string;
    rollup_column_id: string;
    aggregate_func: string;
    precision?: number;
    show_thousands_sep?: boolean;
  }) => void;
}

export function RollupSettings({
  columns,
  name,
  onNameChange,
  onCancel,
  onSubmit,
}: Props) {
  // crude filtering – relation columns only
  const relationCols = columns.filter((c) =>
    [
      'oo_relation',
      'om_relation',
      'mm_relation_left',
      'mm_relation_right',
      'mo_relation',
    ].includes(c.ui_type ?? '')
  );

  const [relationCol, setRelationCol] = useState<string>('');
  const [rollupCol, setRollupCol] = useState<string>('');
  const [agg, setAgg] = useState<string>('count');

  // NEW: derive related table id from selected relation column
  const selectedRelation = relationCols.find((c) => String(c.id) === relationCol);
  const relatedTableId =
    selectedRelation?.relations_table_id != null
      ? String(selectedRelation.relations_table_id)
      : undefined;

  // NEW: fetch columns from related table
  const { data: relatedColumns = [], isLoading: relatedLoading } = useColumns(relatedTableId);

  // NEW: reset rollup column when relation changes
  useEffect(() => {
    setRollupCol('');
  }, [relationCol, relatedTableId]);

  return (
    <div className="space-y-4">
      {/* field label */}
      <input
        className="w-full border px-2 py-1 rounded-sm text-sm"
        placeholder="Field name (optional)"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
      />

      {/* selects */}
      <div className="space-y-3">
        {/* ▶ Link column */}
        <label className="text-xs font-medium text-muted-foreground">
          Relation column
        </label>
        <Select value={relationCol} onValueChange={setRelationCol}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select relation…" />
          </SelectTrigger>
          <SelectContent>
            {relationCols.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* ▶ Roll-up target */}
        <label className="text-xs font-medium text-muted-foreground">
          Field to aggregate
        </label>
        <Select
          value={rollupCol}
          onValueChange={setRollupCol}
          disabled={!relatedTableId || relatedLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose field…" />
          </SelectTrigger>
          <SelectContent>
            {relatedColumns.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* ▶ Function */}
        <label className="text-xs font-medium text-muted-foreground">
          Aggregate function
        </label>
        <Select value={agg} onValueChange={setAgg}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Function…" />
          </SelectTrigger>
          <SelectContent>
            {['count', 'sum', 'avg', 'min', 'max'].map((fn) => (
              <SelectItem key={fn} value={fn}>
                {fn.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* actions */}
      <div className="flex justify-end space-x-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!relationCol || !rollupCol}
          onClick={() =>
            onSubmit({
              relation_column_id: relationCol,
              rollup_column_id: rollupCol,
              aggregate_func: agg,
            })
          }
        >
          Save Field
        </Button>
      </div>
    </div>
  );
}
