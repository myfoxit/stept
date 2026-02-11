import * as React from 'react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ColumnRead } from '@/types/openapi.ts';
import { SingleRelationField } from '@/components/DataTable/Fields/SingleRelationField.tsx';
import { MultiRelationField } from '@/components/DataTable/Fields/MultiRelationField.tsx';
import TagSelectField from './Fields/TagSelectField';
import {LookUpColumnField} from './Fields/LookUpField';
import FormulaField from './Fields/FormulaField';
import { useUpdateRow } from '@/hooks/api/fields';
import { useAssignSelectOption } from '@/hooks/api/select_options';

export function RowDialog<T extends Record<string, any>>({
  item,
  field,
  tableId,
  columns = [],
  trigger,
}: {
  item: T;
  field: keyof T;
  tableId: string;
  columns?: ColumnRead[];
  trigger?: React.ReactNode;
}) {
  const isMobile = useIsMobile();

  const [formState, setFormState] = React.useState<T>(item);
  const updateRowMutation = useUpdateRow();
  const assignSelectOption = useAssignSelectOption();
  const [pendingSelects, setPendingSelects] = React.useState<
    Record<string, { column: ColumnRead; option: any | null }>
  >({});

  const handleChange = (key: keyof T, value: any) =>
    setFormState((prev) => ({ ...prev, [key]: value }));

  const editableKeys = React.useMemo(
    () => columns.map((c) => c.name as keyof T).filter((k) => k !== 'id'),
    [columns]
  );

  const handleSubmit = () => {
    const relationOrSpecial = [
      'oo_relation',
      'om_relation',
      'mm_relation_left',
      'mm_relation_right',
      'single_select',
      'lookup',
      'formula'
    ];

    const filteredData = columns.reduce((acc, col) => {
      if (col.name !== 'id' && !relationOrSpecial.includes(col.ui_type)) {
        acc[col.name] = formState[col.name as keyof T];
      }
      return acc;
    }, {} as Record<string, any>);

    const selectAssignments = Object.values(pendingSelects);

    const runSelectAssignments = async () => {
      await Promise.all(
        selectAssignments.map(({ column, option }) =>
          assignSelectOption.mutateAsync({
            tableId: column.table_id,
            rowId: item.id,
            columnId: column.id,
            optionId: option?.id ?? null,
          })
        )
      );
    };

    const runRowUpdate = () =>
      new Promise<void>((resolve, reject) => {
        if (Object.keys(filteredData).length === 0) {
          resolve();
          return;
        }
        updateRowMutation.mutate(
          {
            tableId,
            rowId: Number(item.id),
            data: filteredData,
          },
          {
            onSuccess: () => resolve(),
            onError: (err: any) => reject(err),
          }
        );
      });

    (async () => {
      try {
        await runSelectAssignments();
        await runRowUpdate();
        toast.success('Row updated');
      } catch (e: any) {
        toast.error(e?.message ?? 'Failed to update row');
      }
    })();
  };

  
  const renderField = (column: ColumnRead) => {
    const keyName = column.name as keyof T;
    const uiType = column.ui_type;

    switch (uiType) {
      case 'oo_relation':
        return (
          <SingleRelationField
            column={column}
            tableId={column.table_id ?? ''}
            leftItemId={String(item.id)}
            value={formState[keyName] as any}
            onChange={(row) => handleChange(keyName, row as any)}
          />
        );
      case 'om_relation':
      case 'mm_relation_left':
      case 'mm_relation_right':
        return (
          <MultiRelationField
            column={column}
            tableId={column.table_id ?? ''}
            leftItemId={String(item.id)}
            value={(formState[keyName] as any) ?? []}
            onChange={(rows) => handleChange(keyName, rows as any)}
          />
        );

      case 'single_select':
        return (
          <TagSelectField
            column={column}
            value={formState[keyName] as any}
            rowId={String(item.id)}
            commitMode="deferred"
            onChange={(opt) => {
              handleChange(keyName, opt);
              setPendingSelects((prev) => ({
                ...prev,
                [column.id]: { column, option: opt },
              }));
            }}
          />
        );
      case 'lookup':
        return (
          <LookUpColumnField
            column={column}
            value={formState[keyName] as any}
            onChange={(opt) => handleChange(keyName, opt)}
          />
        );
      case 'formula':
        return (
          <FormulaField
            column={column}
            rowData={formState}
            columnsMeta={columns}
          />
        );
      default:
        return (
          <Input
            id={String(column.name)}
            value={formState[keyName] as any}
            onChange={(e) => handleChange(keyName, e.target.value as any)}
          />
        );
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="link"
            className="text-foreground w-fit px-0 text-left cursor-pointer"
          >
            {String(item[field]) ?? '-'}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className={isMobile ? 'sm:max-w-full w-full' : 'sm:max-w-lg'}
      >
        <DialogHeader className="gap-1">
          <DialogTitle>{item.header ?? `Row ${item.id ?? ''}`}</DialogTitle>
          <DialogDescription>Edit the row</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4 overflow-y-auto px-1 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          
          {columns
            .filter((col) => col.name !== 'id' && col.ui_type !== 'db_id')
            .map((col) => (
              <div key={String(col.name)} className="flex flex-col gap-3">
                <Label htmlFor={String(col.name)}>
                  {String(col.display_name).charAt(0).toUpperCase() +
                    String(col.display_name).slice(1)}
                </Label>
                {renderField(col)}
              </div>
            ))}
        </form>

        <DialogFooter>
          <Button onClick={handleSubmit}>Submit</Button>
          <DialogClose asChild>
            <Button variant="outline">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
