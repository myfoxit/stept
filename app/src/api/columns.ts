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
  request<ColumnRead[]>({ method: 'GET', url: `/columns/${tableId}` });

export const addColumn = (body: ColumnCreateWithExtras) =>
  request<ColumnRead>({
    method: 'POST',
    url: '/columns/',
    data: body,
  });

export const updateColumn = (columnId: string, updates: ColumnUpdate) =>
  request<ColumnRead>({
    method: 'PATCH',
    url: `/columns/${columnId}`,  // Fixed URL path
    data: updates,
  });

export const deleteColumn = (colId: string) =>
  request<Record<string, unknown>>({
    method: 'DELETE',
    url: `/columns/${colId}/`,
  });

export const reorderColumn = (columnId: string, newPosition: number) =>
  request<ColumnRead>({
    method: 'PUT',
    url: `/columns/${columnId}/reorder`,
    data: { new_position: newPosition },
  });
