import { useState , useMemo} from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandInput,
  CommandList,
} from '@/components/ui/command';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getContrastTextColor } from '@/lib/color';


import type { ColumnRead, SelectOption } from '@/types/openapi';
import { useAssignSelectOption, useSelectOptions } from '@/hooks/api/select_options';


const tint = (hex?: string) => (hex ? (hex.length === 9 ? hex : `${hex}2E`) : undefined);


const isSelectOption = (v: unknown): v is SelectOption =>
  !!v && typeof v === 'object' && 'id' in v && (v as any).id;


interface OptionPickerProps {
  options: SelectOption[];
  value: SelectOption | null;
  isLoading: boolean;
  isError: boolean;
  onSelect: (opt: SelectOption | null) => void;
}

function OptionPicker({
  options,
  value,
  isLoading,
  isError,
  onSelect,
}: OptionPickerProps) {
 
  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="p-4 text-sm text-destructive">Could not load options.</p>
    );
  }

  return (
    <Command className="w-full">
      <CommandInput placeholder="Search options..." />
      <CommandList className="max-h-64 overflow-y-auto">
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup className="w-full">
          {options.map((opt) => {
            const isSelected = value?.id === opt.id;
            return (
              <CommandItem
                key={opt.id}
                onSelect={() => onSelect(opt)}
                style={isSelected && opt.color ? { backgroundColor: tint(opt.color) } : undefined}
                className={cn(
                  'flex w-full cursor-pointer items-center rounded-md px-3 py-1.5 transition-colors hover:bg-muted',
                  isSelected && 'font-medium'
                )}
              >
               
                <Badge
                  className="pointer-events-none truncate rounded-full px-3 py-0.5 text-sm"
                  style={{
                    backgroundColor: opt.color ?? undefined,
                    color: getContrastTextColor(opt.color ?? undefined),
                  }}
                >
                  {opt.name}
                </Badge>
                <span className="grow" />
                {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </CommandItem>
            );
          })}

  
          <CommandItem
            onSelect={() => onSelect(null)}
            className={cn(
              'flex w-full cursor-pointer items-center rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted',
              value === null && 'font-medium'
            )}
          >
            <span className="text-sm">— Clear —</span>
            <span className="grow" />
            {value === null && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}


export interface TagSelectFieldProps {
  column: ColumnRead;
  value: SelectOption | string | number | null; 
  rowId: number | string;
  onChange?: (opt: SelectOption | null) => void; 
  
  commitMode?: 'immediate' | 'deferred';
}

export default function TagSelectField({
  column,
  value,
  rowId,
  onChange,
  commitMode = 'immediate',
}: TagSelectFieldProps) {
  const {
    data: options = [],
    isLoading,
    isError,
  } = useSelectOptions(String(column.id));

  // Add a key to force re-render when options change
  const optionsKey = useMemo(() => 
    options.map(o => `${o.id}-${o.name}-${o.color}`).join(','),
    [options]
  );

  const selectedOption: SelectOption | null = useMemo(() => {
    if (isSelectOption(value)) return value;

    if (value !== null && value !== undefined && value !== '') {
      return options.find((opt) => opt.id === String(value)) ?? null;
    }

    return null;
  }, [value, options, optionsKey]); // Add optionsKey as dependency


  const assign = useAssignSelectOption();
  const [open, setOpen] = useState(false);

  const handleSelect = (opt: SelectOption | null) => {
    if (commitMode === 'immediate') {
      assign.mutate(
        {
          tableId: String(column.table_id),
          rowId,
          columnId: String(column.id),
          optionId: opt?.id ?? null,
        },
        {
          onSuccess: () => {
            onChange?.(opt);
            setOpen(false);
          },
        }
      );
    } else {
 
      onChange?.(opt);
      setOpen(false);
    }
  };


  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        {selectedOption ? (
          <Badge
            className="max-w-[200px] cursor-pointer truncate"
            style={{
              backgroundColor: selectedOption.color ?? undefined,
              color: getContrastTextColor(selectedOption.color ?? undefined),
            }}
          >
            {selectedOption.name ?? selectedOption.id}
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

      <PopoverContent align="start" sideOffset={4} className="w-72 p-0">
        <OptionPicker
          options={options}
          value={selectedOption}
          isLoading={isLoading}
          isError={isError}
          onSelect={handleSelect}
        />
      </PopoverContent>
    </Popover>
  );
}
