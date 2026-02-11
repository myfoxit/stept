// tableDataStore.ts
import { create } from 'zustand';
import type { ColumnRead } from '@/types/openapi';

interface TableDataState {
  rows: any[];
  cols: ColumnRead[];
  setData: (rows: any[], cols: ColumnRead[]) => void;
}

export const useTableDataStore = create<TableDataState>((set) => ({
  rows: [],
  cols: [],
  setData: (rows, cols) => set({ rows: rows ?? [], cols: cols ?? [] }),
}));
