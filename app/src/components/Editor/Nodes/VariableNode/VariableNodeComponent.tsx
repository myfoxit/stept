import React, { useReducer, useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const VariableNodeComponent: React.FC<NodeViewProps> = (props) => {
  const { node, updateAttributes, editor } = props;

  /* 🔁 local state used only to force a re-render on variableStore updates */
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  /* subscribe once */
  useEffect(() => {
    const handler = () => forceUpdate();
    // @ts-ignore – Editor is an EventEmitter
    (editor as any).on?.('variableStoreUpdate', handler);
    return () => {
      (editor as any).off?.('variableStoreUpdate', handler);
    };
  }, [editor]);

  const {
    rows = [], // this could be a paginated response or an array
    cols = [],
    tableId,
    tableName,
    rowId: globalRowId, // ← NEW
  } = editor.storage.variableStore ?? {};

  // Extract the actual rows array - handle both array and object with items
  const rowsArray = Array.isArray(rows) ? rows : (rows?.items || []);

  const [open, setOpen] = useState(false);
  const [colId, setColId] = useState<string | null>(
    node.attrs.colId ? String(node.attrs.colId) : null
  );

  const rowId = globalRowId != null ? String(globalRowId) : null; // ← NEW

  // Find selected data - handle both single object and array
  const findRow = Array.isArray(rowsArray) 
    ? rowsArray.find((r: any) => String(r.id) === String(rowId))
    : (rowsArray && String(rowsArray.id) === String(rowId) ? rowsArray : null);
  
  const findCol = cols.find((c: any) => String(c.id) === String(colId));

  // Display the value or column name
  let displayText = `[${
    findCol?.display_name || findCol?.name || 'Select column'
  }]`;
  
  if (findRow && findCol) {
    const cell = findRow[findCol.name];
    
    // Handle different data types
    if (cell != null) {
      // Check if it's a single select object with id and name
      if (typeof cell === 'object' && cell.name) {
        displayText = String(cell.name);
      } 
      // Check if it's an array (multi-select, relations)
      else if (Array.isArray(cell)) {
        displayText = cell.map(item => 
          typeof item === 'object' && item.name ? item.name : String(item)
        ).join(', ');
      } 
      // Plain value
      else {
        displayText = String(cell);
      }
    }
  }

  const save = () => {
    // Ensure we save the colId attribute
    updateAttributes({ colId: colId || null });
    setOpen(false);
  };

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className="relative inline-flex items-center"
    >
      {/* Variable chip - now clickable */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="inline-block rounded bg-blue-50 px-2 py-0.5 text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer border-0 font-inherit text-inherit print:bg-transparent print:text-black print:px-0"
            aria-label="Edit variable"
          >
            {displayText}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-4 print:hidden">
          {/* Column select */}
          <div className="space-y-1">
            <p className="text-sm font-medium">Column</p>
            <Select value={colId ?? ''} onValueChange={(v) => setColId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose column…" />
              </SelectTrigger>
              <SelectContent>
                {cols.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.display_name || c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
};
