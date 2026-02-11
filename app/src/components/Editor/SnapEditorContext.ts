// SnapEditorContext.ts
import { createContext } from 'react';
import type { ColumnRead } from '@/types/openapi';

export interface TableDataCtx {
  rows: any[];
  cols: ColumnRead[];
}

export const TableDataContext = createContext<TableDataCtx>({
  rows: [],
  cols: [],
});
