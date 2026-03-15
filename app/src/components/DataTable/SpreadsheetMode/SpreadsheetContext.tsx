// components/DataTable/SpreadsheetMode/SpreadsheetContext.tsx
import * as React from 'react';
import { setActiveCellStore, useActiveCellStore, getActiveCellStore } from '@/lib/active-cell-store';

 const NEW_ROW_HIGHLIGHT_MS = 1600;

type SpreadsheetContextValue = {
  isSpreadsheetMode: boolean;
  activeCell: { row: number; col: number } | null;
  editingCell: { row: number; col: number } | null;
  isDoubleClickEdit: boolean;
  setActiveCell: (cell: { row: number; col: number } | null) => void;
  setEditingCell: (cell: { row: number; col: number } | null, isDoubleClick?: boolean) => void;
  initialInput: string | null;
  setInitialInput: (ch: string | null) => void;
  addRowAndFocus?: (col?: number) => void;
  // global info:
  totalRows: number;
  visibleCols: number;
  scrollToIndex?: (index: number, opts?: { align?: 'start' | 'center' | 'end' | 'auto' }) => void;

  renderBaseIndex: number;

  lastAddedRowIndex: number | null;
  
  maxVisibleRowIndex: number;
 
  goPastEndAndAddRow?: (opts: { fromRow: number; col: number }) => void;
  invalidateData?: () => void; // NEW
};

const SpreadsheetContext = React.createContext<SpreadsheetContextValue | null>(null);

export function SpreadsheetProvider({
  children,
  enabled,
  totalRows,
  visibleCols,
  onAddRow,
  scrollToIndex,
  renderBaseIndex = 0,
  maxVisibleRowIndex = 0,
  invalidateData, // NEW
}: {
  children: React.ReactNode;
  enabled: boolean;
  totalRows: number;
  visibleCols: number;
  onAddRow?: () => void;
  scrollToIndex?: (index: number, opts?: { align?: 'start' | 'center' | 'end' | 'auto' }) => void;
  renderBaseIndex?: number;
  maxVisibleRowIndex?: number;
  invalidateData?: () => void; // NEW
}) {
  const [editingCell, setEditingCellState] = React.useState<{ row: number; col: number } | null>(null);
  const [isDoubleClickEdit, setIsDoubleClickEdit] = React.useState(false);
  const [initialInput, setInitialInput] = React.useState<string | null>(null);

  const [lastAddedRowIndex, setLastAddedRowIndex] = React.useState<number | null>(null);
  const clearAddedRowTimer = React.useRef<number | null>(null);

  const activeCell = useActiveCellStore();

  const setActiveCell = React.useCallback(
    (cell: { row: number; col: number } | null) => {
      setActiveCellStore(cell);
      if (cell && scrollToIndex) {
        scrollToIndex(cell.row, { align: 'auto' });
      }
    },
    [scrollToIndex]
  );


  const goPastEndAndAddRow = React.useCallback(
    (opts: { fromRow: number; col: number }) => {
      if (!onAddRow) return;

      const { col } = opts;
      const before = totalRows; 

    
      onAddRow();


      const target = before; 
      if (scrollToIndex) scrollToIndex(target, { align: 'end' });
      setActiveCell({ row: target, col });

      setLastAddedRowIndex(target);
      if (clearAddedRowTimer.current) window.clearTimeout(clearAddedRowTimer.current);
      clearAddedRowTimer.current = window.setTimeout(
        () => setLastAddedRowIndex(null),
        NEW_ROW_HIGHLIGHT_MS
      ) as unknown as number;
    },
    [onAddRow, totalRows, scrollToIndex, setActiveCell]
  );

  const addRowAndFocus = React.useCallback(
    (col: number = 1) => {
      if (!onAddRow) return;
      const before = totalRows;
      onAddRow();
      setTimeout(() => {
        const target = Math.max(before, 0);
        if (scrollToIndex) scrollToIndex(target, { align: 'end' });
        setActiveCell({ row: target, col });
        setLastAddedRowIndex(target);
        if (clearAddedRowTimer.current) window.clearTimeout(clearAddedRowTimer.current);
        clearAddedRowTimer.current = window.setTimeout(
          () => setLastAddedRowIndex(null),
          NEW_ROW_HIGHLIGHT_MS
        ) as unknown as number;
      }, 50);
    },
    [onAddRow, totalRows, setActiveCell, scrollToIndex]
  );

  const setEditingCell = React.useCallback(
    (cell: { row: number; col: number } | null, dbl = false) => {
      setEditingCellState(cell);
      setIsDoubleClickEdit(dbl);
    },
    []
  );


  React.useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[role="dialog"]') || t.closest('.simple-editor-wrapper')) return;

      const current = getActiveCellStore();
      if (!current || editingCell) return;

      if (e.key === 'F2') {
        e.preventDefault();
        setInitialInput(null);
        setEditingCell(current, false);
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) {
        e.preventDefault();
        setInitialInput(e.key);
        setEditingCell(current, false);
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [enabled, editingCell, setEditingCell]);

  
  React.useEffect(() => {
    if (!enabled || editingCell) return;

    let raf: number | null = null;
    let last = 0;
   
    const MIN_MS = 30;
    let pressKey: string | null = null;
    let pressStart = 0;

    const handler = (e: KeyboardEvent) => {
      const nav = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Tab','Escape'];
      if (!nav.includes(e.key)) return;
      const t = e.target as HTMLElement;
      if (t.closest('[role="dialog"]') || t.closest('.simple-editor-wrapper')) return;

      e.preventDefault();
      if (raf) cancelAnimationFrame(raf);

      raf = requestAnimationFrame(() => {
        const now = Date.now();
        if (e.repeat && now - last < MIN_MS) return;
        last = now;


        let step = 1;
        if (!pressKey || pressKey !== e.key || !e.repeat) {
          pressKey = e.key;
          pressStart = now;
        } else {
          const held = now - pressStart;
          if (held > 2500) step = 10;
          else if (held > 1200) step = 5;
          else if (held > 600) step = 3;
          else step = 2;
        }

        const cur = getActiveCellStore();
        const firstDataCol = 1;
        const lastCol = Math.max(firstDataCol, visibleCols - 1);

        if (!cur) {
          if (['ArrowDown', 'ArrowRight', 'Enter', 'Tab'].includes(e.key)) {
            setActiveCell({ row: 0, col: firstDataCol });
          }
          return;
        }

        let newRow = cur.row;
        let newCol = cur.col;
        let shouldAddRow = false;

        switch (e.key) {
          case 'ArrowUp':
            newRow = Math.max(0, cur.row - step);
            break;
          case 'ArrowDown':
  
            if (cur.row >= totalRows - 1 && onAddRow) {
              shouldAddRow = true;
              newRow = cur.row + 1; 
            } else {
              newRow = Math.min(Math.max(0, totalRows - 1), cur.row + step);
            }
            break;
          case 'Enter':
          
            if (cur.row >= totalRows - 1 && onAddRow) {
              shouldAddRow = true;
              newRow = cur.row + 1; 
            } else {
              newRow = Math.min(Math.max(0, totalRows - 1), cur.row + step);
            }
            break;
          case 'ArrowLeft':
            
            if (cur.col > firstDataCol) newCol = cur.col - 1;
            else if (cur.row > 0) { newRow = cur.row - 1; newCol = lastCol; }
            break;
          case 'ArrowRight':
            if (cur.col < lastCol) {
              newCol = cur.col + 1;
            } else if (cur.row < totalRows - 1) {
              newRow = cur.row + 1;
              newCol = firstDataCol;
            } else if (cur.row >= totalRows - 1 && onAddRow) {
            
              shouldAddRow = true;
              newRow = cur.row + 1;
              newCol = firstDataCol;
            }
            break;
          case 'Tab':
            if (!e.shiftKey) {
              if (cur.col < lastCol) {
                newCol = cur.col + 1;
              } else if (cur.row < totalRows - 1) {
                newRow = cur.row + 1;
                newCol = firstDataCol;
              } else if (cur.row >= totalRows - 1 && onAddRow) {
              
                shouldAddRow = true;
                newRow = cur.row + 1;
                newCol = firstDataCol;
              }
            } else {
              if (cur.col > firstDataCol) newCol = cur.col - 1;
              else if (cur.row > 0) { newRow = cur.row - 1; newCol = lastCol; }
            }
            break;
          case 'Escape':
            setActiveCell(null);
            return;
        }

    
        if (shouldAddRow && goPastEndAndAddRow) {
          goPastEndAndAddRow({ fromRow: cur.row, col: newCol });
        } else {
          if (scrollToIndex) scrollToIndex(newRow, { align: 'auto' });
          if (newRow !== cur.row || newCol !== cur.col) {
            setActiveCell({ row: newRow, col: newCol });
          }
        }
      });
    };

    window.addEventListener('keydown', handler, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('keydown', handler, true);
    };
  }, [enabled, editingCell, visibleCols, totalRows, scrollToIndex, setActiveCell, onAddRow, goPastEndAndAddRow]);


  React.useEffect(() => {
    if (!enabled) return;
    const onDocClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('[role="dialog"]') || el?.closest('.simple-editor-wrapper')) return;
      if (!el || !el.closest('[data-sr-cell]')) {
        setEditingCell(null);
        setActiveCell(null);
        setInitialInput(null);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [enabled, setActiveCell, setEditingCell]);

  React.useEffect(() => {
    return () => {
      if (clearAddedRowTimer.current) window.clearTimeout(clearAddedRowTimer.current);
    };
  }, []);

  const value: SpreadsheetContextValue = {
    isSpreadsheetMode: enabled,
    activeCell,
    editingCell,
    isDoubleClickEdit,
    setActiveCell,
    setEditingCell,
    initialInput,
    setInitialInput,
    addRowAndFocus,
    totalRows,
    visibleCols,
    scrollToIndex,
    renderBaseIndex,
    lastAddedRowIndex,
    maxVisibleRowIndex,
    goPastEndAndAddRow,
    invalidateData, // NEW
  };

  return <SpreadsheetContext.Provider value={value}>{children}</SpreadsheetContext.Provider>;
}

export function useSpreadsheet() {
  const ctx = React.useContext(SpreadsheetContext);
  if (!ctx) throw new Error('useSpreadsheet must be used within SpreadsheetProvider');
  return ctx;
}
