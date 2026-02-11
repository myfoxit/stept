import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAddFormula } from '@/hooks/api/formulas';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import type { ColumnRead } from '@/types/openapi';

import { BUILT_IN_FUNCTIONS } from '@/utils/builtInFunctions';

interface FormulaSettingsProps {
  tableId: string;
  fields: ColumnRead[];
  position?: string;  // NEW prop
  referenceColumnId?: string;  // NEW prop
  onCancel: () => void;
  onSubmit: () => void;
}

export function FormulaSettings({ 
  tableId, 
  fields,
  position,  // NEW
  referenceColumnId,  // NEW
  onCancel, 
  onSubmit 
}: FormulaSettingsProps) {
  const addFormulaMutation = useAddFormula();
  const [displayName, setDisplayName] = useState(''); // new
  const [formula, setFormula] = useState('');
  const [error, setError] = useState<string | undefined>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Separate state for manual filter input
  const [filter, setFilter] = useState('');


  // ─────────────────────────────────── Validation ───────────────────────────────────
  const validateFormula = (value: string): string | undefined => {
    // 0. Invalid characters: only letters, numbers, underscore and * / + - , . () {} and spaces allowed
    for (const ch of value) {
      if (!/[A-Za-z0-9_*\/+\-,\.\(\)\{\}\s]/.test(ch)) {
        return `Char ${ch} is not allowed`;
      }
    }

    // 1. Parentheses
    let depth = 0;
    for (const ch of value) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth < 0) return 'Mismatched parentheses';
    }
    if (depth !== 0) return 'Mismatched parentheses';

    // 2. Unknown functions
    // match any letter-based identifier and compare lowercase
    const fnRegex = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = fnRegex.exec(value))) {
      const fn = m[1];
      if (
        !BUILT_IN_FUNCTIONS.some(
          (f) => f.name.toLowerCase() === fn.toLowerCase()
        )
      ) {
        return `Unknown function: ${fn}`;
      }
    }

    // 3. Unknown fields
    const fieldRegex = /\{([^}]+)}/g;
    while ((m = fieldRegex.exec(value))) {
      const field = m[1];
      if (!fields.some((f) => f.name === field)) {
        return `Unknown field: ${field}`;
      }
    }

    // 4. Unknown bare identifiers (treat as fields)
    const idRegex = /([A-Za-z_][A-Za-z0-9_]*)/g;
    let idMatch: RegExpExecArray | null;
    while ((idMatch = idRegex.exec(value))) {
      const id = idMatch[1];
      if (
        !BUILT_IN_FUNCTIONS.some(
          (f) => f.name.toLowerCase() === id.toLowerCase()
        ) &&
        !fields.some((f) => f.name === id)
      ) {
        return `Unknown field: ${id}`;
      }
    }

    return undefined;
  };

  // Debounced validation
  useEffect(() => {
    const id = setTimeout(() => setError(validateFormula(formula)), 350);
    return () => clearTimeout(id);
  }, [formula]);

  // ───────────────────────────── Helper to grab current token ─────────────────────────────
  const getCurrentToken = (): string => {
    const el = textareaRef.current;
    if (!el) return '';
    const pos = el.selectionStart ?? 0;
    const before = formula.slice(0, pos);
    const tokenMatch = before.match(/([A-Za-z0-9_]+)$/);
    return tokenMatch ? tokenMatch[1] : '';
  };

  // ───────────────────────────── Suggestions logic ──────────────────────────────
  const suggestions = useMemo(() => {
    // Merge function + field suggestions
    const fieldSuggestions = fields.map(({ name, type }) => ({
      name,
      signature: `{${name}}`,
      returnType: type,
      isField: true as const,
    }));

    const combo = [
      ...BUILT_IN_FUNCTIONS.map((f) => ({ ...f, isField: false as const })),
      ...fieldSuggestions,
    ];

    const searchTerm = (filter.trim() || getCurrentToken()).toLowerCase();

    if (!searchTerm) return combo;

    return combo.filter((s) => s.name.toLowerCase().includes(searchTerm));
  }, [filter, formula, fields]);

  const insertSuggestion = (item: { name: string; isField: boolean }) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const before = formula.slice(0, start);
    const after = formula.slice(end);

    const snippet = item.isField ? `{${item.name}}` : `${item.name}()`;
    const cursorOffset = item.isField ? snippet.length : `${item.name}(`.length;

    const newValue = before.replace(/([A-Za-z0-9_]*)$/, '') + snippet + after;
    setFormula(newValue);

    // Reset manual filter to show full list next time
    setFilter('');

    requestAnimationFrame(() => {
      const pos = before.replace(/([A-Za-z0-9_]*)$/, '').length + cursorOffset;
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  };

  // helper: wrap bare letter/digit identifiers with {}
  const bracketIdentifiers = (value: string): string =>
    value.replace(/(?<!\{)\b([A-Za-z_][A-Za-z0-9_]*)\b(?![\(}])/g, '{$1}');

  const handleSubmit = async () => {
    if (!error && formula.trim()) {
      // wrap bare identifiers first
      const wrapped = bracketIdentifiers(formula);
      const processedFormula = wrapped.replace(
        /\{([^}]+)}/g,
        (_, fieldName) => {
          const f = fields.find((fld) => fld.name === fieldName);
          return f ? `{${f.id}}` : `{${fieldName}}`;
        }
      );

      await addFormulaMutation.mutateAsync({
        display_name: displayName,
        table_id: tableId,
        formula: processedFormula,
        formula_raw: wrapped,
        position,  // NEW: pass position
        reference_column_id: referenceColumnId,  // NEW: pass reference column
      });

      onCancel();
      onSubmit();
    }
  };

  // Autosize textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 400)}px`;
  }, [formula]);

  // ──────────────────────────────────── Render ────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 max-h-78">
      {/* Scrollable content area */}
      <div className="flex flex-col gap-4 overflow-y-auto pr-1">
        {/* Name */}
        <input
          className="w-full border rounded-md p-2 text-sm"
          placeholder="Field name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />

        {/* Formula editor */}
        <div className="space-y-1 relative">
          <span className="block text-xs font-medium mb-1">Formula</span>

          <textarea
            ref={textareaRef}
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="Type your formula…"
            className={cn(
              'w-full resize-y overflow-hidden border rounded-md p-2 font-mono text-sm leading-5 focus-visible:outline-none',
              error && 'border-destructive'
            )}
            rows={3}
            spellCheck={false}
            autoComplete="off"
          />

          {/* Suggestion panel – always visible */}
          <div
            data-autocomplete
            className="border rounded-md mt-2 w-full max-h-60 overflow-auto bg-background shadow-sm"
          >
            <Command shouldFilter={false} className="w-full">
              {/* Manual filter input */}
              <CommandInput
                placeholder="Filter…"
                value={filter}
                onValueChange={setFilter}
              />
              <CommandList className="max-h-48">
                <CommandEmpty>No match found.</CommandEmpty>

                {/* FUNCTIONS GROUP */}
                {suggestions.some((s) => !s.isField) && (
                  <CommandGroup heading="Functions">
                    <ScrollArea className="max-h-100">
                      {suggestions
                        .filter((s) => !s.isField)
                        .map((fn) => (
                          <CommandItem
                            key={fn.name}
                            value={fn.name}
                            onSelect={() =>
                              insertSuggestion({ name: fn.name, isField: false })
                            }
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">
                                {fn.name}
                              </span>
                              <span className="text-xs text-muted-foreground truncate">
                                {fn.signature}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                    </ScrollArea>
                  </CommandGroup>
                )}

                {/* FIELDS GROUP */}
                {suggestions.some((s) => s.isField) && (
                  <CommandGroup heading="Fields">
                    <ScrollArea className="max-h-40">
                      {suggestions
                        .filter((s) => s.isField)
                        .map((field) => (
                          <CommandItem
                            key={field.name}
                            value={field.name}
                            onSelect={() =>
                              insertSuggestion({
                                name: field.name,
                                isField: true,
                              })
                            }
                          >
                            <span className="text-sm">{field.name}</span>
                          </CommandItem>
                        ))}
                    </ScrollArea>
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </div>

          {error && <p className="text-sm text-destructive mt-1">{error}</p>}
        </div>

        {/* Optional description accordion */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="description">
            <AccordionTrigger className="text-sm">
              Add description
            </AccordionTrigger>
            <AccordionContent>
              <input
                className="w-full border rounded-md p-2 text-sm"
                placeholder="Add description…"
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Actions – sticky to bottom */}
      <div className="flex justify-end gap-2 mt-auto pt-4">
        <Button variant="outline" onClick={onCancel} tabIndex={-1}>
          Cancel
        </Button>
        <Button
          disabled={!!error || formula.trim() === ''}
          onClick={handleSubmit}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
