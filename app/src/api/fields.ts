// ────────────────────────────────────────────
// File: src/api/fields.ts
// ────────────────────────────────────────────
import { apiClient, request } from '../lib/apiClient';
import { type FieldCreate, type FieldRead } from '../types/openapi';

/** Fields / Rows */
export const insertRowApi = (body: FieldCreate) =>
  request<Record<string, unknown>, FieldCreate>({
    method: 'POST',
    url: '/datatable/rows/',
    data: body,
  });

export const updateRow = (
  tableId: string,
  rowId: number,
  data: Partial<FieldCreate>
): Promise<Record<string, unknown>> => {
  return request<Record<string, unknown>, Partial<FieldCreate>>({
    method: 'PATCH',
    url: `/datatable/rows/${tableId}/${rowId}`,
    data: { data },
  });
};

export type RowPage<T = FieldRead> = {
  items: T[];
  total: number;
};

export const listRows = (
  tableId: string,
  applyFilters = true,
  applySorts = true,
  limit = 100,
  offset = 0
) =>
  request<RowPage<FieldRead>>({
    method: 'GET',
    url: `/datatable/rows/${tableId}?apply_filters=${applyFilters}&apply_sorts=${applySorts}&limit=${limit}&offset=${offset}`,
  });

export const deleteRow = (tableId: string | number, rowId: number) =>
  request<Record<string, unknown>>({
    method: 'DELETE',
    url: `/datatable/rows/${tableId}/${rowId}`,
  });

export const searchRows = (
  tableId: string,
  query: string,
  scope: 'global' | string = 'global',
  limit = 100,
  offset = 0
): Promise<RowPage<FieldRead>> => {
  return request<RowPage<FieldRead>>({
    method: 'GET',
    url: `/datatable/rows/${tableId}/search`,
    params: { query, scope, limit, offset },
  });
};

