import * as React from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useUpdateRow } from '@/hooks/api/fields';



/**
 * TableCellViewer – extremely generic version.
 * Renders *every* key in the row as a plain shadcn <Input>, regardless of type.
 */
export function TableCellViewer<T extends Record<string, any>>({
  item,
  /** The column whose value appears in the table cell */
  field,
  tableId,
}: {
  item: T;
  field: keyof T;
  tableId: string;
}) {
  const isMobile = useIsMobile();

  const [formState, setFormState] = React.useState<T>(item);
  const updateRowMutation = useUpdateRow();

  const handleChange = (key: keyof T, value: any) =>
    setFormState((prev) => ({ ...prev, [key]: value }));

  const editableKeys = (Object.keys(item) as (keyof T)[]).filter(
    (k) => k !== 'id'
  );

  const handleSubmit = () => {
    // Replace with persistence logic if needed
    const { id, ...dataWithoutId } = formState as any;
    toast.success('Row updated');
    // Call the mutation with tableId, rowId and the updated payload
    console.log(formState);

    
    updateRowMutation.mutate(
      {
        tableId: tableId,
        rowId: Number(item.id),
        data: dataWithoutId,
      },
      {
        onSuccess: () => toast.success('Row updated'),
        onError: (err: any) =>
          toast.error(err?.message ?? 'Failed to update row'),
      }
    );
  };

  return (
    <Drawer direction={isMobile ? 'bottom' : 'right'}>
      {/* Trigger shows the value from the clicked cell */}
      <DrawerTrigger asChild>
        <Button variant="link" className="text-foreground w-fit px-0 text-left">
          {String(item[field]) ?? '-'}
        </Button>
      </DrawerTrigger>

      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{item.header ?? `Row ${item.id ?? ''}`}</DrawerTitle>
          <DrawerDescription>Edit the row</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            {editableKeys.map((key) => (
              <div key={String(key)} className="flex flex-col gap-3">
                <Label htmlFor={String(key)}>
                  {String(key).charAt(0).toUpperCase() + String(key).slice(1)}
                </Label>
                <Input
                  id={String(key)}
                  value={formState[key] as any}
                  onChange={(e) => handleChange(key, e.target.value as any)}
                />
              </div>
            ))}
          </form>
        </div>

        <DrawerFooter>
          <Button onClick={handleSubmit}>Submit</Button>
          <DrawerClose asChild>
            <Button variant="outline">Done</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
