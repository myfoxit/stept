import * as React from 'react';
import { useSpreadsheet } from './SpreadsheetContext';
import { cn } from '@/lib/utils';
import { useUpdateRow } from '@/hooks/api/fields';


interface EditableCellProps {
  rowIndex: number;
  colIndex: number;
  rowId: string;
  columnId: string;
  value: any;
  tableId: string;
  children: React.ReactNode;
  className?: string;
  uiType?: string;
}

export function EditableCell({
  rowIndex,
  colIndex,
  rowId,
  columnId,
  value,
  tableId,
  children,
  className,
  uiType,
}: EditableCellProps) {
  const {
    editingCell,
    setActiveCell,
    setEditingCell,
    isDoubleClickEdit,
    initialInput,
    setInitialInput,
    renderBaseIndex,
    lastAddedRowIndex,
    maxVisibleRowIndex,
    goPastEndAndAddRow,
    totalRows,
    invalidateData, // NEW
  } = useSpreadsheet();
  const [editValue, setEditValue] = React.useState(value);
  const [isInternalEditing, setIsInternalEditing] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const editorRef = React.useRef<HTMLDivElement>(null);
  const updateRowMutation = useUpdateRow();

  const globalRowIndex = renderBaseIndex + rowIndex;
  const isEditing =
    editingCell?.row === globalRowIndex && editingCell?.col === colIndex;
  const isNewRow = lastAddedRowIndex === globalRowIndex;

  // TEMP: debug logs
  React.useEffect(() => {
    if (isEditing) {
      console.log('EditableCell editing', {
        globalRowIndex,
        renderBaseIndex,
        rowIndex,
        maxVisibleRowIndex,
        totalRows,
      });
    }
  }, [isEditing, globalRowIndex, renderBaseIndex, rowIndex, maxVisibleRowIndex, totalRows]);

  React.useEffect(() => {
    setEditValue(value);
  }, [value]);

  // Helper: place caret at end synchronously
  const setCursorAtEnd = (element: HTMLDivElement) => {
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(element);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  React.useEffect(() => {
    if (isEditing && editorRef.current && !isInternalEditing) {
      // Decide initial content based on how editing started
      const startedByTyping = !!initialInput && !isDoubleClickEdit;
      const content = startedByTyping ? initialInput! : String(value ?? '');

      editorRef.current.textContent = content;
      editorRef.current.focus();
      setCursorAtEnd(editorRef.current); // sync; no rAF to avoid races

      if (startedByTyping) setInitialInput(null); // consume initial char
      setIsInternalEditing(true);
    } else if (!isEditing) {
      if (editorRef.current) editorRef.current.textContent = '';
      setIsInternalEditing(false);
    }
  }, [
    isEditing,
    isInternalEditing,
    value,
    initialInput,
    isDoubleClickEdit,
    setInitialInput,
  ]);

  const handleCommit = React.useCallback(
    (opts?: { navigation?: 'none' | 'down' | 'right' }) => {
      let newValue: any = editorRef.current?.textContent ?? '';

      // Special handling for decimal type
      if (uiType === 'decimal' && newValue) {
        // Replace comma with dot for parsing
        const normalized = newValue.replace(',', '.');
        const parsed = parseFloat(normalized);

        // If parsing fails, don't save
        if (isNaN(parsed)) {
          // cancel invalid decimal edits
          if (editorRef.current) editorRef.current.textContent = '';
          setEditValue(value);
          setEditingCell(null);
          setIsInternalEditing(false);
          return;
        }

        newValue = parsed;
      }

      const original = String(value ?? '');
      const changed = newValue !== original;

      if (changed && rowId) {
        // Existing row: patch
        updateRowMutation.mutate(
          {
            tableId,
            rowId: Number(rowId),
            data: { [columnId]: newValue || null },
          },
          {
            onSuccess: () => {
              // Invalidate the virtual data window
              invalidateData?.();
            }
          }
        );
      }

      if (editorRef.current) editorRef.current.textContent = '';
      setEditingCell(null);
      setIsInternalEditing(false);

      // Navigation logic after commit
      const nav = opts?.navigation ?? 'none';
      if (nav === 'none') return;

      // Decide next cell coordinates
      const firstDataCol = 1;

      if (nav === 'down') {
        const nextRow = globalRowIndex + 1;
        const atBottomWindow = nextRow > maxVisibleRowIndex;

        console.log('Enter nav', {
          globalRowIndex,
          nextRow,
          maxVisibleRowIndex,
          atBottomWindow,
        });

        if (atBottomWindow) {
          // We are at / beyond the last row: trigger row creation
          goPastEndAndAddRow?.({ fromRow: globalRowIndex, col: colIndex });
        } else {
          setActiveCell({ row: nextRow, col: colIndex });
        }
      }

      if (nav === 'right') {
        const nextCol = colIndex + 1;
        const atBottomWindow = globalRowIndex >= maxVisibleRowIndex;

        console.log('Tab nav', {
          globalRowIndex,
          nextCol,
          maxVisibleRowIndex,
          atBottomWindow,
        });

        if (atBottomWindow && nextCol > colIndex) {
          // Tab on last column & last row: create new row, jump to first data column
          goPastEndAndAddRow?.({ fromRow: globalRowIndex, col: firstDataCol });
        } else {
          setActiveCell({ row: globalRowIndex, col: nextCol });
        }
      }
    },
    [
      uiType,
      value,
      rowId,
      tableId,
      columnId,
      updateRowMutation,
      setEditingCell,
      setActiveCell,
      colIndex,
      globalRowIndex,
      maxVisibleRowIndex,
      goPastEndAndAddRow,
      invalidateData, // ADD to dependencies
    ]
  );

  const handleCancel = React.useCallback(() => {
    if (editorRef.current) editorRef.current.textContent = '';
    setEditValue(value);
    setEditingCell(null);
    setIsInternalEditing(false);
  }, [value, setEditingCell]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!isEditing) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // Enter: commit and move downward (creating a row if needed)
        handleCommit({ navigation: 'down' });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        // Tab: commit and move right (or to new row when at the last column)
        handleCommit({ navigation: 'right' });
      }
    },
    [isEditing, handleCommit, handleCancel]
  );

  const handleClick = React.useCallback(() => {
    setActiveCell({ row: globalRowIndex, col: colIndex });
  }, [globalRowIndex, colIndex, setActiveCell]);

  const handleDoubleClick = React.useCallback(() => {
    setActiveCell({ row: globalRowIndex, col: colIndex });
    setEditingCell({ row: globalRowIndex, col: colIndex }, true);
  }, [globalRowIndex, colIndex, setActiveCell, setEditingCell]);

  const handleInput = React.useCallback(() => {
    if (editorRef.current && uiType === 'decimal') {
      const content = editorRef.current.textContent || '';
      const cleaned = content
        .replace(/[^0-9,.-]/g, '') // Remove non-numeric except separators and minus
        .replace(/^(-?)(.*)/, (_, sign, rest) => {
          // Ensure minus only at start
          return sign + rest.replace(/-/g, '');
        })
        .replace(/([,.].*?)[,.]/g, '$1'); // Keep only first decimal separator

      if (cleaned !== content) {
        // Preserve cursor position as much as possible
        const selection = window.getSelection();
        const cursorPos = selection?.rangeCount ? selection.getRangeAt(0).startOffset : 0;

        editorRef.current.textContent = cleaned;

        // Restore cursor position
        if (selection && editorRef.current.firstChild) {
          const range = document.createRange();
          range.setStart(
            editorRef.current.firstChild,
            Math.min(cursorPos, cleaned.length)
          );
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }

      setEditValue(cleaned);
    } else if (editorRef.current) {
      setEditValue(editorRef.current.textContent || '');
    }
  }, [uiType]);

  return (
    <div
      data-sr-cell
      data-sr-row={globalRowIndex}
      data-sr-col={colIndex}
      ref={containerRef}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={cn(
        'cursor-pointer px-2 py-1 min-h-[32px] flex items-center outline-none min-w-32',
        isEditing && 'ring-2 ring-blue-500 ring-inset',
        isNewRow && 'bg-yellow-100/60',
        className
      )}
      style={{ minWidth: '100px' }}
    >
      {/* View mode */}
      {!isEditing && (
        // Use same wrapping as edit mode so entering edit doesn't change layout policy
        <div className="w-full whitespace-pre-wrap break-words">{children}</div>
      )}

      {/* Edit mode */}
      <div
        ref={editorRef}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onBlur={() => {
          if (isEditing) handleCommit();
        }}
        className={cn(
          'w-full min-w-0 outline-none',
          // Multi-line wrap so content can grow, matching view mode
          isEditing ? 'whitespace-pre-wrap break-words' : 'hidden'
        )}
        style={{ minWidth: '100px' }}
      />
    </div>
  );
}
