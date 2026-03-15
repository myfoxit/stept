import { useState } from 'react';
import { Badge } from '@/components/ui/badge.tsx';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover.tsx';
import { RelationPicker } from '@/components/DataTable/RelationPicker.tsx';
import type { ColumnRead } from '@/types/openapi.ts';

export interface SingleRelationFieldProps<
  Row extends { id: string; name?: string }
> {
  column: ColumnRead;
  value: Row | null;
  leftItemId: string;
  onChange: (row: Row | Row[] | null) => void;
}

export function SingleRelationField<Row extends { id: string; name?: string }>(
  props: SingleRelationFieldProps<Row>
) {
  const { column, value, leftItemId, onChange } = props;
  const { relations_table_id, relation_id } = column;
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {value?.id ? (
          <Badge variant="secondary" className="cursor-pointer">
            {value?.name ?? value?.id}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="cursor-pointer text-muted-foreground"
          >
            + Add
          </Badge>
        )}
      </PopoverTrigger>

      <PopoverContent
        className="w-[22rem]
    max-w-[calc(100vw-2rem)]  
    max-h-100
    p-0
    overflow-y-auto   "
        align="start"
        sideOffset={4}
        avoidCollisions
        collisionPadding={8}
        sticky="partial"
      >
        <RelationPicker<Row>
          relationId={relation_id ?? ''}
          relationTableId={relations_table_id}
          tableId={String(column.table_id)}
          leftItemId={Number(leftItemId)}
          value={value}
          multiple={false}
          onChange={(row) => {
            onChange(row);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
