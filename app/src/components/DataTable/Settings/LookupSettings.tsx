import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ColumnRead } from '@/types/openapi';

import { useProject } from '@/providers/project-provider';
import { useTables } from '@/hooks/api/tables';
import { useColumns } from '@/hooks/api/columns';


type Props = {
  // keep backwards compatible props
  name?: string;
  onNameChange?: (v: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;

  // new optional context props
  tableId?: string;
  columns?: ColumnRead[];
};

const RELATION_UI_TYPES = new Set([
  'oo_relation',
  'om_relation',
  'mm_relation_left',
  'mm_relation_right',
]);

export function LookupSettings({
  name: initialName = '',
  onNameChange,
  onSubmit,
  onCancel,
  tableId,
}: Props) {
  const [name, setName] = React.useState<string>(initialName);
  const { selectedProjectId } = useProject();
  const { data: tables = [] } = useTables(selectedProjectId || '');
  const { data: columns = [] } = useColumns(tableId);

  // 1) Relation columns from the current table
  const relationColumns = React.useMemo(
    () => (columns || []).filter((c) => c.ui_type && RELATION_UI_TYPES.has(c.ui_type)),
    [columns]
  );

  // 2) Pick a specific relation column first
  const [selectedRelationColumnId, setSelectedRelationColumnId] = React.useState<
    string | undefined
  >(relationColumns[0]?.id ? String(relationColumns[0].id) : undefined);

  // 3) Derive the related table id from the selected relation column
  const selectedRelationTableId = React.useMemo(() => {
    if (!selectedRelationColumnId) return undefined;
    const relCol = relationColumns.find((c) => String(c.id) === selectedRelationColumnId);
    return relCol?.relations_table_id;
  }, [relationColumns, selectedRelationColumnId]);

  console.log("Selected relation table ID:", selectedRelationTableId);

  // 4) Load columns from the related table with a separate hook call
  // The key here is to ensure we're using the correct table ID and it's properly differentiated
  const { data: targetColumns = [], isLoading: targetColumnsLoading } = useColumns(
    selectedRelationTableId || undefined
  );

  console.log('Target columns:', targetColumns);
  console.log('Target columns loading:', targetColumnsLoading);

  const [lookupColumnId, setLookupColumnId] = React.useState<string | undefined>(undefined);

  // Reset defaults when relation changes or when target columns load
  React.useEffect(() => {
    // Only set the default if we have loaded the target columns
    if (!targetColumnsLoading && targetColumns.length > 0) {
      setLookupColumnId(String(targetColumns[0].id));
    } else {
      setLookupColumnId(undefined);
    }
  }, [selectedRelationTableId, targetColumns, targetColumnsLoading]);

  const createLookup = useCreateLookupColumn();

  const submitDisabled =
    !selectedRelationColumnId || !lookupColumnId || !selectedRelationTableId || targetColumnsLoading;

  const handleSubmit = async () => {
    if (submitDisabled) return;
    await createLookup.mutateAsync({
      relation_column_id: selectedRelationColumnId!,
      lookup_column_id: lookupColumnId!,
      custom_name: name || undefined,
    });
    onSubmit?.();
  };

  const tableLabel = (id: string) =>
    tables.find((t) => String(t.id) === String(id))?.name || id;

  return (
    <div className="space-y-3">
      <Input
        placeholder="Field name"
        value={name}
        onChange={(e) => {
          setName(e.currentTarget.value);
          onNameChange?.(e.currentTarget.value);
        }}
      />

      {/* Select a specific relation column from current table */}
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Relation</div>
        <Select
          value={selectedRelationColumnId}
          onValueChange={setSelectedRelationColumnId}
          disabled={!relationColumns.length}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick a relation" />
          </SelectTrigger>
          <SelectContent>
            {relationColumns.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {(c.display_name || c.name) +
                  (c.relations_table_id ? ` → ${tableLabel(c.relations_table_id)}` : '')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Then pick the field from the related table */}
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">Field to lookup</div>
        <Select
          value={lookupColumnId}
          onValueChange={setLookupColumnId}
          disabled={!selectedRelationTableId || targetColumnsLoading || !targetColumns.length}
        >
          <SelectTrigger>
            <SelectValue placeholder={targetColumnsLoading ? "Loading..." : "Pick a field from related table"} />
          </SelectTrigger>
          <SelectContent>
            {targetColumns.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.display_name || c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          
          disabled={submitDisabled || createLookup.isPending}
          onClick={handleSubmit}
        >
          {createLookup.isPending ? 'Save…' : 'Save'}
        </Button>
      </div>

   
    </div>
  );
}