import { useState } from 'react';
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
import { Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getContrastTextColor } from '@/lib/color';

import type { ColumnRead, SelectOption } from '@/types/openapi';
import { useAssignMultiSelectOptions, useSelectOptions } from '@/hooks/api/select_options';


const tint = (hex?: string) => (hex ? (hex.length === 9 ? hex : `${hex}2E`) : undefined);

interface MultiSelectFieldProps {
  column: ColumnRead;
  value: string | SelectOption[] | null; 
  rowId: number | string;
  onChange?: (opts: SelectOption[]) => void;
  commitMode?: 'immediate' | 'deferred';
}

export default function MultiSelectField({
  column,
  value,
  rowId,
  onChange,
  commitMode = 'immediate',
}: MultiSelectFieldProps) {
  const {
    data: options = [],
    isLoading,
    isError,
  } = useSelectOptions(column.id);

  // Add a key to force re-render when options change
  const optionsKey = React.useMemo(() => 
    options.map(o => `${o.id}-${o.name}-${o.color}`).join(','),
    [options]
  );

  const selectedOptions: SelectOption[] = React.useMemo(() => {
    if (!value) return [];
    
    if (Array.isArray(value)) {
      return value.filter(v => typeof v === 'object' && 'id' in v) as SelectOption[];
    }
    
    if (typeof value === 'string') {
      const names = value.split(',').map(s => s.trim()).filter(Boolean);
      return names
        .map(name => options.find(opt => opt.name === name))
        .filter(Boolean) as SelectOption[];
    }
    
    return [];
  }, [value, options, optionsKey]); // Add optionsKey as dependency

  const selectedIds = new Set(selectedOptions.map(opt => opt.id));

  const assign = useAssignMultiSelectOptions();
  const [open, setOpen] = useState(false);

  const handleToggle = (opt: SelectOption) => {
    let newSelection: SelectOption[];
    
    if (selectedIds.has(opt.id)) {
      newSelection = selectedOptions.filter(o => o.id !== opt.id);
    } else {
      newSelection = [...selectedOptions, opt];
    }

    if (commitMode === 'immediate') {
      assign.mutate(
        {
          tableId: column.table_id,
          rowId,
          columnId: column.id,
          optionIds: newSelection.length > 0 ? newSelection.map(o => o.id) : null,
        },
        {
          onSuccess: () => {
            onChange?.(newSelection);
          },
        }
      );
    } else {
      onChange?.(newSelection);
    }
  };

  const handleClear = () => {
    if (commitMode === 'immediate') {
      assign.mutate(
        {
          tableId: column.table_id,
          rowId,
          columnId: column.id,
          optionIds: null,
        },
        {
          onSuccess: () => {
            onChange?.([]);
            setOpen(false);
          },
        }
      );
    } else {
      onChange?.([]);
      setOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        {selectedOptions.length === 0 ? (
          <PopoverTrigger asChild>
            <Badge
              variant="outline"
              className="cursor-pointer text-muted-foreground"
            >
              + Select
            </Badge>
          </PopoverTrigger>
        ) : (
          <PopoverTrigger asChild>
            <div className="flex items-center gap-1 flex-wrap cursor-pointer">
              {selectedOptions.map((opt) => (
                <Badge
                  key={opt.id}
                  className="max-w-[150px] truncate"
                  style={{
                    backgroundColor: opt.color ?? undefined,
                    color: getContrastTextColor(opt.color),
                  }}
                >
                  {opt.name}
                </Badge>
              ))}
            </div>
          </PopoverTrigger>
        )}

        <PopoverContent align="start" sideOffset={4} className="w-72 p-0">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="animate-spin" />
            </div>
          ) : isError ? (
            <p className="p-4 text-sm text-destructive">Could not load options.</p>
          ) : (
            <Command className="w-full">
              <CommandInput placeholder="Search options..." />
              <CommandList className="max-h-64 overflow-y-auto">
                <CommandEmpty>No results.</CommandEmpty>
                <CommandGroup className="w-full">
                  {options.map((opt) => {
                    const isSelected = selectedIds.has(opt.id);
                    return (
                      <CommandItem
                        key={opt.id}
                        onSelect={() => handleToggle(opt)}
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
                            color: getContrastTextColor(opt.color),
                          }}
                        >
                          {opt.name}
                        </Badge>
                        <span className="grow" />
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </CommandItem>
                    );
                  })}

                  {selectedOptions.length > 0 && (
                    <CommandItem
                      onSelect={handleClear}
                      className="flex w-full cursor-pointer items-center rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted"
                    >
                      <span className="text-sm">— Clear all —</span>
                      <span className="grow" />
                      <X className="h-4 w-4 shrink-0" />
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
