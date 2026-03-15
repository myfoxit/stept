import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FieldRead } from '@/api/databases';
import { CellRenderer } from './CellRenderer';

interface DataGridProps {
  fields: FieldRead[];
  records: Record<string, any>[];
  total: number;
  onCreateRecord: () => void;
  onUpdateRecord: (recordId: number, fields: Record<string, any>) => void;
  onDeleteRecords: (recordIds: number[]) => void;
  isCreating?: boolean;
  selectedRecordIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
}

const ROW_HEIGHT = 36;
const ROW_NUM_WIDTH = 48;
const CHECKBOX_WIDTH = 40;
const MIN_COL_WIDTH = 80;
const DEFAULT_COL_WIDTH = 180;

export function DataGrid({
  fields,
  records,
  total,
  onCreateRecord,
  onUpdateRecord,
  onDeleteRecords,
  isCreating,
  selectedRecordIds,
  onSelectionChange,
}: DataGridProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const [editingCell, setEditingCell] = React.useState<{ recordId: number; fieldId: string } | null>(null);
  const [editValue, setEditValue] = React.useState<any>(null);
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});
  const [resizing, setResizing] = React.useState<{ fieldId: string; startX: number; startWidth: number } | null>(null);

  // Filter out system fields (except primary)
  const visibleFields = fields
    .filter((f) => !f.is_system || f.is_primary)
    .sort((a, b) => a.position - b.position);

  const getColWidth = (fieldId: string) => columnWidths[fieldId] || DEFAULT_COL_WIDTH;
  const totalWidth = ROW_NUM_WIDTH + CHECKBOX_WIDTH + visibleFields.reduce((sum, f) => sum + getColWidth(f.id), 0);

  const rowVirtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  // Handle column resize
  React.useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      const newWidth = Math.max(MIN_COL_WIDTH, resizing.startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [resizing.fieldId]: newWidth }));
    };
    const handleMouseUp = () => setResizing(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  const handleCellClick = (recordId: number, fieldId: string, value: any) => {
    const field = visibleFields.find((f) => f.id === fieldId);
    if (field?.is_primary || field?.is_computed) return; // Don't edit primary/computed fields inline
    // Checkbox and rating handle their own editing
    if (field?.field_type === 'checkbox' || field?.field_type === 'rating') return;
    setEditingCell({ recordId, fieldId });
    setEditValue(value);
  };

  const handleCommit = () => {
    if (editingCell) {
      const field = visibleFields.find((f) => f.id === editingCell.fieldId);
      if (field) {
        onUpdateRecord(editingCell.recordId, { [field.db_column_name]: editValue });
      }
    }
    setEditingCell(null);
    setEditValue(null);
  };

  const handleCancel = () => {
    setEditingCell(null);
    setEditValue(null);
  };

  const allSelected = records.length > 0 && records.every((r) => selectedRecordIds.has(r._row_id));

  const toggleSelectAll = () => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(records.map((r) => r._row_id)));
    }
  };

  const toggleSelect = (recordId: number) => {
    const next = new Set(selectedRecordIds);
    if (next.has(recordId)) next.delete(recordId);
    else next.add(recordId);
    onSelectionChange(next);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Selected actions bar */}
      {selectedRecordIds.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 border-b border-blue-200 text-sm">
          <span className="font-medium">{selectedRecordIds.size} selected</span>
          <button
            type="button"
            onClick={() => {
              onDeleteRecords(Array.from(selectedRecordIds));
              onSelectionChange(new Set());
            }}
            className="text-red-600 hover:text-red-800 cursor-pointer bg-transparent border-none text-sm"
          >
            Delete
          </button>
        </div>
      )}

      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
      >
        <div style={{ minWidth: totalWidth }}>
          {/* Header */}
          <div
            className="flex items-center border-b border-border bg-muted/50 sticky top-0 z-10"
            style={{ height: ROW_HEIGHT }}
          >
            <div
              className="flex items-center justify-center shrink-0 border-r border-border"
              style={{ width: CHECKBOX_WIDTH }}
            >
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
            </div>
            <div
              className="flex items-center justify-center shrink-0 border-r border-border text-xs text-muted-foreground font-medium"
              style={{ width: ROW_NUM_WIDTH }}
            >
              #
            </div>
            {visibleFields.map((field) => (
              <div
                key={field.id}
                className="relative flex items-center px-2 text-xs font-medium text-muted-foreground border-r border-border select-none shrink-0"
                style={{ width: getColWidth(field.id), height: ROW_HEIGHT }}
              >
                <span className="truncate">{field.name}</span>
                {/* Resize handle */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setResizing({ fieldId: field.id, startX: e.clientX, startWidth: getColWidth(field.id) });
                  }}
                />
              </div>
            ))}
          </div>

          {/* Rows */}
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const record = records[virtualRow.index];
              if (!record) return null;
              const recordId = record._row_id;
              const isSelected = selectedRecordIds.has(recordId);

              return (
                <div
                  key={virtualRow.key}
                  className={cn(
                    'flex items-center border-b border-border/50 hover:bg-muted/30 transition-colors',
                    isSelected && 'bg-blue-50/50'
                  )}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div
                    className="flex items-center justify-center shrink-0 border-r border-border/50"
                    style={{ width: CHECKBOX_WIDTH }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(recordId)}
                    />
                  </div>
                  <div
                    className="flex items-center justify-center shrink-0 border-r border-border/50 text-xs text-muted-foreground"
                    style={{ width: ROW_NUM_WIDTH }}
                  >
                    {virtualRow.index + 1}
                  </div>
                  {visibleFields.map((field) => {
                    const cellValue = record[field.db_column_name];
                    const isEditing = editingCell?.recordId === recordId && editingCell?.fieldId === field.id;
                    const isDirectEdit = field.field_type === 'checkbox' || field.field_type === 'rating';

                    return (
                      <div
                        key={field.id}
                        className={cn(
                          'flex items-center px-2 shrink-0 border-r border-border/50 text-sm overflow-hidden',
                          isEditing && 'ring-2 ring-primary ring-inset bg-white',
                          !isEditing && !isDirectEdit && 'cursor-pointer'
                        )}
                        style={{ width: getColWidth(field.id), height: virtualRow.size }}
                        onClick={() => {
                          if (!isEditing && !isDirectEdit) {
                            handleCellClick(recordId, field.id, cellValue);
                          }
                        }}
                      >
                        <CellRenderer
                          field={field}
                          value={isEditing ? editValue : cellValue}
                          isEditing={isEditing}
                          onChange={(val) => {
                            if (isDirectEdit) {
                              // Direct edit fields commit immediately
                              onUpdateRecord(recordId, { [field.db_column_name]: val });
                            } else {
                              setEditValue(val);
                            }
                          }}
                          onCommit={handleCommit}
                          onCancel={handleCancel}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* New row button */}
          <div
            className="flex items-center border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
            style={{ height: ROW_HEIGHT }}
            onClick={onCreateRecord}
          >
            <div style={{ width: CHECKBOX_WIDTH }} className="shrink-0" />
            <div
              className="flex items-center gap-1 px-2 text-sm text-muted-foreground"
              style={{ width: ROW_NUM_WIDTH }}
            >
              <Plus className="size-3.5" />
            </div>
            <span className="text-sm text-muted-foreground">
              {isCreating ? 'Adding...' : 'New row'}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
        <span>{total} record{total !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
