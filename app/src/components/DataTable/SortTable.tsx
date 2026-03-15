import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "../ui/dropdown-menu";
import {
  IconChevronDown,
  IconLayoutColumns,
} from '@tabler/icons-react';

export function SortTable({ table }: { table: any }) {



return (
<DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="column-visibility-button"
                >
                  <IconLayoutColumns />
                  <span className="hidden lg:inline">Customize</span>
                  <span className="lg:hidden">Columns</span>
                  <IconChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56"
                aria-label="Column Visibility"
              >
                {table
                    .getAllColumns()
                    .filter(
                        (column: any) =>
                            typeof column.accessorFn !== 'undefined' &&
                            column.getCanHide()
                    )
                    .map((column: any) => {
                      return (
                          <DropdownMenuCheckboxItem
                              key={column.id}
                              className="capitalize"
                              checked={column.getIsVisible()}
                              onCheckedChange={(value) =>
                                  column.toggleVisibility(!!value)
                              }
                          >
                            {column.id}
                          </DropdownMenuCheckboxItem>
                      );
                    })}
              </DropdownMenuContent>
            </DropdownMenu>

)

}