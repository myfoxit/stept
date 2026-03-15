import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { GripVertical, Trash } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { HexColorPicker } from 'react-colorful';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useCreateSelectColumn, useUpdateSelectOptions } from '@/hooks/api/select_options';

// Same interface as SingleSelectSettings
interface MultiSelectSettingsProps {
  tableId: string;
  columnId?: string;
  name: string;
  onNameChange: (v: string) => void;
  onCancel: () => void;
  onSave?: (name: string) => void;
  editMode?: boolean;
  existingOptions?: Array<{ id: string; name: string; color: string }>;
}

// Reuse the same palette
const SOFT_PALETTE = [
  '#E3F2FD', '#BBDEFB', '#90CAF9',
  '#E8F5E9', '#C8E6C9', '#A5D6A7',
  '#FFFDE7', '#FFF9C4', '#FFF59D',
  '#FFF3E0', '#FFE0B2', '#FFCC80',
  '#FAFAFA', '#F5F5F5', '#EEEEEE',
];

export function MultiSelectSettings({
  tableId,
  columnId,
  name,
  onNameChange,
  onCancel,
  onSave,
  editMode = false,
  existingOptions = [],
}: MultiSelectSettingsProps) {
  // Same state and logic as SingleSelectSettings
  const [options, setOptions] = useState<
    { id: string; name: string; color: string }[]
  >(() => {
    if (editMode && existingOptions.length > 0) {
      return existingOptions;
    }
    return [{ id: uuid(), name: '', color: SOFT_PALETTE[0] }];
  });

  const nextColorIndexRef = useRef<number>(1);

  useEffect(() => {
    nextColorIndexRef.current = options.length % SOFT_PALETTE.length || 1;
  }, []);

  const [description, setDescription] = useState<string>('');

  const {
    mutate: createColumn,
    isPending: isCreating,
    isError: isCreateError,
    error: createError,
  } = useCreateSelectColumn();

  const {
    mutate: updateOptions,
    isPending: isUpdating,
    isError: isUpdateError,
    error: updateError,
  } = useUpdateSelectOptions();

  const isLoading = isCreating || isUpdating;
  const isError = isCreateError || isUpdateError;
  const error = createError || updateError;

  function updateOption(
    id: string,
    payload: Partial<{ name: string; color: string }>
  ) {
    setOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...payload } : o))
    );
  }

  function removeOption(id: string) {
    setOptions((prev) => prev.filter((o) => o.id !== id));
  }

  const viewportRootRef = useRef<HTMLDivElement | null>(null);
  const prevLenRef = useRef<number>(options.length);
  const lastAddedIdRef = useRef<string | null>(null);

  const getViewport = () =>
    (viewportRootRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement | null) ?? null;

  function addOption() {
    setOptions((prev) => {
      const id = uuid();
      const color =
        SOFT_PALETTE[nextColorIndexRef.current % SOFT_PALETTE.length];
      nextColorIndexRef.current =
        (nextColorIndexRef.current + 1) % SOFT_PALETTE.length;

      lastAddedIdRef.current = id;

      return [...prev, { id, name: '', color }];
    });
  }

  useLayoutEffect(() => {
    const prevLen = prevLenRef.current;
    if (options.length > prevLen) {
      const id = lastAddedIdRef.current;
      const viewport = getViewport();
      if (id && viewport) {
        const rowEl = document.getElementById(`ms-option-${id}`) as HTMLElement | null;
        if (rowEl) {
          const rowRect = rowEl.getBoundingClientRect();
          const vpRect = viewport.getBoundingClientRect();

          const overBottom = rowRect.bottom - vpRect.bottom;
          const overTop = vpRect.top - rowRect.top;

          if (overBottom > 0) {
            viewport.scrollTo({ top: viewport.scrollTop + overBottom, behavior: 'smooth' });
          } else if (overTop > 0) {
            viewport.scrollTo({ top: viewport.scrollTop - overTop, behavior: 'smooth' });
          }

          requestAnimationFrame(() => {
            const input = rowEl.querySelector('input') as HTMLInputElement | null;
            input?.focus({ preventScroll: true });
          });
        }
        lastAddedIdRef.current = null;
      }
    }
    prevLenRef.current = options.length;
  }, [options.length]);

  function handleSave() {
    const cleaned = options.filter((o) => o.name.trim() !== '');
    if (cleaned.length === 0) return;

    if (editMode && columnId) {
      updateOptions(
        {
          columnId,
          options: cleaned.map(({ name, color }) => ({ name, color })),
        },
        {
          onSuccess: () => {
            onSave?.(name.trim() || 'Multi select');
          },
        }
      );
    } else {
      createColumn(
        {
          table_id: tableId,
          name: name.trim() || 'Multi select',
          options: cleaned.map(({ name, color }) => ({ name, color })),
          ui_type: 'multi_select', // Specify multi_select type
        },
        {
          onSuccess: () => onCancel(),
        }
      );
    }
  }

  return (
    <div className="space-y-4  max-h-[800px]:max-h-78 overflow-y-auto pr-1">
      <Input
        placeholder="Field name (optional)"
        value={name}
        onChange={(e) => onNameChange(e.currentTarget.value)}
      />

      <div className="border rounded-md bg-background">
        <ScrollArea
          ref={viewportRootRef}
          className="max-h-72 [&_[data-radix-scroll-area-viewport]]:max-h-72"
        >
          <div className="divide-y">
            {options.map((opt) => (
              <div
                key={opt.id}
                id={`ms-option-${opt.id}`}
                className="flex items-center gap-3 p-3"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="h-6 w-6 rounded-sm border focus:outline-none focus:ring-2 focus:ring-ring"
                      style={{ backgroundColor: opt.color }}
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-2" align="start">
                    <HexColorPicker
                      color={opt.color}
                      onChange={(c) => updateOption(opt.id, { color: c })}
                      className="mx-auto"
                    />
                    <p className="mt-2 text-center text-xs text-muted-foreground select-all">
                      {opt.color.toUpperCase()}
                    </p>
                  </PopoverContent>
                </Popover>

                <Input
                  className="flex-1 h-8"
                  placeholder="Option name"
                  value={opt.name}
                  onChange={(e) =>
                    updateOption(opt.id, { name: e.currentTarget.value })
                  }
                />

                {options.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeOption(opt.id)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <button
          type="button"
          onClick={addOption}
          className="flex w-full items-center justify-center gap-1 py-2 text-sm font-medium text-primary hover:bg-muted"
        >
          <span className="text-base leading-none">＋</span> Add option
        </button>
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="description">
          <AccordionTrigger className="text-sm">
            Add description
          </AccordionTrigger>
          <AccordionContent>
            <Input
              placeholder="Add description…"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {isError && (
        <p className="text-sm text-destructive-foreground">
          {(error as Error)?.message ?? 'Something went wrong'}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
