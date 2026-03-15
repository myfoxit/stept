import { useState } from "react";
import { Badge } from "@/components/ui/badge.tsx";
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "@/components/ui/popover.tsx";
import { RelationPicker } from "@/components/DataTable/RelationPicker.tsx";
import type {ColumnRead} from "@/types/openapi.ts";

export interface MultiRelationFieldProps<Row extends { id: string; name?: string }> {
    column: ColumnRead;
    value: Row[];
    leftItemId: string;
    onChange: (rows: Row | Row[] | null) => void;
}

export function MultiRelationField<Row extends { id: string; name?: string }>(
    props: MultiRelationFieldProps<Row>,
) {
    const { column, value,leftItemId, onChange } = props;
    const {relations_table_id, relation_id} = column;
    const [open, setOpen] = useState(false);

    const displayBadges = value?.length ? (
        value.map((row) => (
            <Badge key={row.id} variant="secondary" className="cursor-pointer">
                {row.name ?? row.id}
            </Badge>
        ))
    ) : (
        <Badge variant="outline" className="cursor-pointer text-muted-foreground">
            + Add
        </Badge>
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div className="flex flex-wrap gap-1">{displayBadges}</div>
            </PopoverTrigger>

            <PopoverContent
                className="w-[22rem] p-0"
                align="start"
                sideOffset={4}
            >
                <RelationPicker<Row>
                    relationId={relation_id ?? ''}
                    relationTableId={relations_table_id}
                    tableId={String(column.table_id)}
                    leftItemId={Number(leftItemId)}
                    value={value}
                    multiple
                    onChange={(row) => {
                        onChange(row);
                        setOpen(false);
                    }}
                />
            </PopoverContent>
        </Popover>
    );
}
