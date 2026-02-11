import {flexRender, useReactTable} from "@tanstack/react-table";
import type {UniqueIdentifier} from "@dnd-kit/core";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table.tsx";
import {SortableContext, verticalListSortingStrategy} from "@dnd-kit/sortable";
import {DraggableRow} from "@/components/DataTable/DraggableRow.tsx";
import React from "react";

type TableViewProps = {
    table: ReturnType<typeof useReactTable>;
    dataIds: UniqueIdentifier[];
    rows: { id: UniqueIdentifier }[];
};

export function TableView({ table, dataIds }: TableViewProps) {
    return (
        <Table>
            <TableHeader className="bg-muted sticky top-0 z-10">
                {table.getHeaderGroups().map(hg => (
                    <TableRow key={hg.id}>
                        {hg.headers.map(h => (
                            <TableHead key={h.id} colSpan={h.colSpan}>
                                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                            </TableHead>
                        ))}
                    </TableRow>
                ))}
            </TableHeader>
            <TableBody className="**:data-[slot=table-cell]:first:w-8">
                {table.getRowModel().rows.length ? (
                    <SortableContext items={dataIds} strategy={verticalListSortingStrategy}>
                        {table.getRowModel().rows.map(row => (
                            <DraggableRow key={row.id} row={row} />
                        ))}
                    </SortableContext>
                ) : (
                    <TableRow>
                        <TableCell colSpan={table.getAllColumns().length} className="h-24 text-center">
                            No results.
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
    );
}