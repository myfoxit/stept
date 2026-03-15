// ────────────────────────────────────────────
// File: src/api/columns.ts
// ────────────────────────────────────────────
import { request } from '../lib/apiClient';
import { type ColumnCreate, type ColumnRead, type ColumnUpdate } from '../types/openapi';

// Reusable create payload including UI extras (position, default, settings)
export type ColumnCreateWithExtras = ColumnCreate & {
  position?: string;
  reference_column_id?: string;
  default_value?: any;
  settings?: Record<string, any>;
};

/** Columns */
export const listColumns = (tableId: string) =>
  request<ColumnRead[]>({ method: 'GET', url: `/datatable/columns/${tableId}` });

export const addColumn = (body: ColumnCreateWithExtras) =>
  request<ColumnRead>({
    method: 'POST',
    url: '/datatable/columns/',
    data: body,
  });

export const updateColumn = (columnId: string, updates: ColumnUpdate) =>
  request<ColumnRead>({
    method: 'PATCH',
    url: `/datatable/columns/${columnId}`,
    data: updates,
  });

export const deleteColumn = (colId: string) =>
  request<Record<string, unknown>>({
    method: 'DELETE',
    url: `/datatable/columns/${colId}/`,
  });

export const reorderColumn = (columnId: string, newPosition: number) =>
  request<ColumnRead>({
    method: 'PATCH',
    url: `/datatable/columns/${columnId}/reorder`,
    data: { new_position: newPosition },
  });
