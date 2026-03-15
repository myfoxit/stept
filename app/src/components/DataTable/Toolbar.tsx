import {useReactTable, type VisibilityState} from "@tanstack/react-table";
import type React from "react";
import {TabsList, TabsTrigger} from "@/components/ui/tabs.tsx";
import {Badge} from "@/components/ui/badge.tsx";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";
import {Button} from "@/components/ui/button.tsx";
import {IconChevronDown, IconLayoutColumns} from "@tabler/icons-react";
import {AddColumnPopover} from "@/components/DataTable/AddColumnPopover.tsx";

type ToolbarProps = {
    table: ReturnType<typeof useReactTable>;
    tableId: string;
    columnVisibility: VisibilityState;
    setColumnVisibility: React.Dispatch<React.SetStateAction<VisibilityState>>;
    onAddColumn: (name: string, type: string) => void;
    className?: string;
};

export function Toolbar({ table, tableId, setColumnVisibility: _setColumnVisibility, onAddColumn, className = "" }: ToolbarProps) {
    return (
        <div className={"flex items-center justify-between " + className}>
            <TabsList className="**:data-[slot=badge]:bg-muted-foreground/30 hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:px-1 @4xl/main:flex">
                <TabsTrigger value="outline">Outline</TabsTrigger>
                <TabsTrigger value="past-performance">
                    Past Performance <Badge variant="secondary">3</Badge>
                </TabsTrigger>
                <TabsTrigger value="key-personnel">
                    Key Personnel <Badge variant="secondary">2</Badge>
                </TabsTrigger>
                <TabsTrigger value="focus-documents">Focus Documents</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                            <IconLayoutColumns />
                            <span className="hidden lg:inline">Customize Columns</span>
                            <span className="lg:hidden">Columns</span>
                            <IconChevronDown />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        {table
                            .getAllColumns()
                            .filter(c => c.getCanHide())
                            .map(column => (
                                <DropdownMenuCheckboxItem
                                    key={column.id}
                                    className="capitalize"
                                    checked={column.getIsVisible()}
                                    onCheckedChange={v => column.toggleVisibility(!!v)}
                                >
                                    {column.id}
                                </DropdownMenuCheckboxItem>
                            ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <AddColumnPopover tableId={tableId} columns={[]} />
            </div>
        </div>
    );
}