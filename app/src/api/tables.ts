// ────────────────────────────────────────────
// File: src/api/tables.ts
// ────────────────────────────────────────────
import { request } from '../lib/apiClient';
import { type TableCreate, type TableRead } from '../types/openapi';

/** Tables */
export const listTables = (projectId: string) =>
  request<TableRead[]>({ method: 'GET', url: `/datatable/tables/${projectId}` });
export const createTable = (body: TableCreate) =>
  request<TableRead, TableCreate>({
    method: 'POST',
    url: '/datatable/tables/',
    data: body,
  });
export const dropTable = (tableId: string) =>
  request<TableRead>({ method: 'DELETE', url: `/datatable/tables/${tableId}` });
export const updateTable = (tableId: string, body: { name: string }) =>
  request<TableRead, { name: string }>({
    method: 'PUT',
    url: `/datatable/tables/${tableId}`,
    data: body,
  });
export const getTable = (tableId: string) =>
  request<TableRead>({ method: 'GET', url: `/datatable/tables/table/${tableId}` });
