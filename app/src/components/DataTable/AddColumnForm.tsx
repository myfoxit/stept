'use client';

import { useState, useEffect } from 'react';
import {
  Icon123,
  IconCalendar,
  IconCheckbox,
  IconHash,
  IconLink,
  IconList,
  IconListCheck,
  IconNotes,
  IconTypography,
  IconChevronLeft,
  IconMath,
  IconListSearch,
  IconSum,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from '@/components/ui/command';
import { NumberSettings } from './Settings/NumberSettings';
import { TextSettings } from './Settings/TextSettings';

import { RelationSettings } from '@/components/DataTable/Settings/RelationSettings.tsx';

import { SingleSelectSettings } from './Settings/SingleSelectSettings';
import { DecimalSettings } from './Settings/DecimalSettings';
import { LookupSettings } from './Settings/LookupSettings';
import { FormulaSettings } from './Settings/FormulaSettings';
import { RollupSettings } from './Settings/RollupSettings';

import type { ColumnRead } from '@/types/openapi';
import { MultiSelectSettings } from './Settings/MultiSelectSettings';
import { LongTextSettings } from './Settings/LongTextSettings';
import { useAddColumn } from '@/hooks/api/columns';
import { useCreateRelation } from '@/hooks/api/relations';
import { useAddRollup } from '@/hooks/api/rollups';

const FIELD_TYPES = [
  { label: 'Single Line Text', icon: IconTypography, value: 'text' },
  { label: 'Long Text', icon: IconNotes, value: 'long_text' },
  { label: 'Formula', icon: IconMath, value: 'formula' },
  { label: 'Number', icon: IconHash, value: 'number' },
  { label: 'Relation', icon: IconLink, value: 'relation' },
  { label: 'Checkbox', icon: IconCheckbox, value: 'checkbox' },
  { label: 'Single Select', icon: IconList, value: 'single_select' },
  { label: 'Multi Select', icon: IconListCheck, value: 'multi_select' },
  { label: 'Date', icon: IconCalendar, value: 'date' },
  { label: 'Decimal', icon: Icon123, value: 'decimal' },
  { label: 'Lookup', icon: IconListSearch, value: 'lookup' },
  { label: 'Rollup', icon: IconSum, value: 'rollup' },
];

interface AddColumnFormProps {
  tableId: string;
  columns: ColumnRead[];
  position?: 'left' | 'right';
  referenceColumnId?: string;
  onClose: () => void; // Prop to close the parent (Dialog or Popover)
}

export function AddColumnForm({
  tableId,
  columns,
  position,
  referenceColumnId,
  onClose,
}: AddColumnFormProps) {
  const [fieldName, setFieldName] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Reset state when the form is mounted (i.e., when dialog/popover opens)
  useEffect(() => {
    setFieldName('');
    setSelectedType(null);
  }, []);

  const addColumnMutation = useAddColumn(tableId);
  const createRelationMutation = useCreateRelation();
  const addRollupMutation = useAddRollup();

  async function handleCreate(
    type: string,
    cfg?: {
      scale?: number;
      relation_type?: string;
      related_table_id?: string;
      limit_view?: boolean;
      limit_filters?: boolean;
      richText?: boolean;
      // Add other config types from your settings
      relation_column_id?: string;
      rollup_column_id?: string;
      aggregate_func?: string;
      precision?: number;
      show_thousands_sep?: boolean;
      // NEW: defaults & settings from settings panes
      default_value?: any;
      settings?: Record<string, any>;
    }
  ) {
    if (!tableId) return;

    if (type === 'relation') {
      if (!cfg?.related_table_id) return;

      try {
        await createRelationMutation.mutateAsync({
          left_table_id: tableId,
          right_table_id: cfg.related_table_id,
          relation_type: cfg.relation_type as
            | 'one_to_one'
            | 'one_to_many'
            | 'many_to_many',
          display_name: fieldName || undefined,
        });
      } catch (err) {
        console.error('Failed to create relation', err);
        return;
      }
    } else if (type === 'rollup') {
      try {
        await addRollupMutation.mutateAsync({
          display_name: fieldName,
          table_id: tableId,
          relation_column_id: cfg?.relation_column_id!,
          rollup_column_id: cfg?.rollup_column_id!,
          aggregate_func: cfg?.aggregate_func!,
          precision: cfg?.precision,
          show_thousands_sep: cfg?.show_thousands_sep,
        });
      } catch (err) {
        console.error('Failed to add rollup', err);
      }
    } else if (type === 'decimal') {
      try {
        console.log('Adding decimal column with scale:', cfg?.scale);
        await addColumnMutation.mutateAsync({
          table_id: tableId,
          name: fieldName,
          ui_type: type,
          position: position,
          reference_column_id: referenceColumnId,
          // NEW: pass through default and settings coming from DecimalSettings
          default_value: cfg?.default_value,
          settings: cfg?.settings ?? {
            show_thousands_separator: cfg?.show_thousands_sep ?? false,
            scale: cfg?.scale,
          },
        });
      } catch (err) {
        console.error('Failed to add decimal column', err);
      }
    } else if (type === 'long_text') {
      try {
        await addColumnMutation.mutateAsync({
          table_id: tableId,
          name: fieldName,
          ui_type: 'long_text',
          position: position,
          reference_column_id: referenceColumnId,
          // You might need to pass cfg.richText here if your API supports it
        });
      } catch (err) {
        console.error('Failed to add long text column', err);
      }
    } else {
      try {
        await addColumnMutation.mutateAsync({
          table_id: tableId,
          name: fieldName,
          ui_type: type,
          position: position,
          reference_column_id: referenceColumnId,
        });
      } catch (err) {
        console.error('Failed to add column', err);
      }
    }

    // Call the onClose prop instead of managing state
    onClose();
  }

  // This is the JSX that was inside your <PopoverContent>
  return (
    <>
      {selectedType ? (
        <>
          {/* Header with back button */}
          <div className="flex items-center mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedType(null)}
            >
              <IconChevronLeft />
            </Button>
            <h4 className="ml-2 text-sm font-medium">
              {FIELD_TYPES.find((f) => f.value === selectedType)!.label}
              {position && ` (Insert ${position})`}
            </h4>
          </div>

          {/* Type-specific form */}
          {selectedType === 'text' && (
            <TextSettings
              name={fieldName}
              onNameChange={setFieldName}
              onSubmit={() => handleCreate('single_line_text')}
            />
          )}
          {selectedType === 'single_select' && (
            <SingleSelectSettings
              tableId={tableId}
              name={fieldName}
              onNameChange={setFieldName}
              onCancel={() => setSelectedType(null)}
              // Note: SingleSelectSettings seems to be missing an onSubmit prop
              // You'll need to add one to call handleCreate
            />
          )}
          {selectedType === 'multi_select' && (
            <MultiSelectSettings
              tableId={tableId}
              name={fieldName}
              onNameChange={setFieldName}
              onCancel={() => setSelectedType(null)}
              // Note: MultiSelectSettings seems to be missing an onSubmit prop
            />
          )}
          {selectedType === 'number' && (
            <NumberSettings
              name={fieldName}
              onNameChange={setFieldName}
              onSubmit={() => handleCreate('number')}
            />
          )}
          {selectedType === 'relation' && (
            <RelationSettings
              name={fieldName}
              onNameChange={setFieldName}
              onCancel={() => setSelectedType(null)}
              onSubmit={(cfg) => handleCreate('relation', cfg)}
            />
          )}
          {selectedType === 'lookup' && (
            <LookupSettings
              tableId={tableId}
              name={fieldName}
              onNameChange={setFieldName}
              onCancel={() => setSelectedType(null)}
              onSubmit={() => {
                // This component seems to handle its own mutation.
                // We just need to close.
                onClose();
              }}
            />
          )}
          {selectedType === 'formula' && (
            <FormulaSettings
              tableId={tableId}
              fields={columns ?? []}
              position={position}  // NEW: pass position prop
              referenceColumnId={referenceColumnId}  // NEW: pass reference column
              onCancel={() => setSelectedType(null)}
              onSubmit={() => {
                // This component seems to handle its own mutation.
                onClose();
              }}
            />
          )}
          {selectedType === 'decimal' && (
            <DecimalSettings
              name={fieldName}
              onNameChange={setFieldName}
              onCancel={() => setSelectedType(null)}
              onSubmit={(cfg) => handleCreate('decimal', cfg)}
            />
          )}
          {selectedType === 'rollup' && (
            <RollupSettings
              tableId={tableId}
              columns={columns}
              name={fieldName}
              onNameChange={setFieldName}
              onCancel={() => setSelectedType(null)}
              onSubmit={(cfg) => handleCreate('rollup', cfg)}
            />
          )}
          {selectedType === 'long_text' && (
            <LongTextSettings
              name={fieldName}
              onNameChange={setFieldName}
              onSubmit={(cfg) => handleCreate('long_text', cfg)}
              onCancel={() => setSelectedType(null)}
            />
          )}
          {/* Add other simple types like checkbox, date here */}
          {selectedType === 'checkbox' && (
             <TextSettings // Reusing TextSettings for simple name input
              name={fieldName}
              onNameChange={setFieldName}
              onSubmit={() => handleCreate('checkbox')}
            />
          )}
           {selectedType === 'date' && (
             <TextSettings // Reusing TextSettings for simple name input
              name={fieldName}
              onNameChange={setFieldName}
              onSubmit={() => handleCreate('date')}
            />
          )}
        </>
      ) : (
        <>
          <Input
            placeholder="Field name (optional)"
            value={fieldName}
            onChange={(e) => setFieldName(e.currentTarget.value)}
            className="mb-2"
          />
          <Command>
            <CommandInput placeholder="Search field type…" />
            <CommandList className="max-h-48 overflow-auto">
              <CommandEmpty>No types found.</CommandEmpty>
              {FIELD_TYPES.map(({ label, icon: Icon, value }) => (
                <CommandItem
                  key={value}
                  onSelect={() => setSelectedType(value)}
                  className="flex items-center space-x-2"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </>
      )}
    </>
  );
}