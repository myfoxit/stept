// ────────────────────────────────────────────
// File: src/api/tables.ts
// ────────────────────────────────────────────
import { request } from '../lib/apiClient';
import { type TableCreate, type TableRead } from '../types/openapi';

/** Tables */
export const listTables = (projectId: string) =>
  request<TableRead[]>({ method: 'GET', url: `/tables/${projectId}` });
export const createTable = (body: TableCreate) =>
  request<TableRead, TableCreate>({
    method: 'POST',
    url: '/tables/',
    data: body,
  });
export const dropTable = (tableId: string) =>
  request<TableRead>({ method: 'DELETE', url: `/tables/${tableId}` });
export const updateTable = (tableId: string, body: { name: string }) =>
  request<TableRead, { name: string }>({
    method: 'PUT',
    url: `/tables/${tableId}`,
    data: body,
  });
export const getTable = (tableId: string) =>
  request<TableRead>({ method: 'GET', url: `/tables/table/${tableId}` });
