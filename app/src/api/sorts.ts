import { request } from '../lib/apiClient';

export interface SortCreate {
  table_id: string;
  column_id: string;
  direction: 'asc' | 'desc';
  priority: number;
  is_active?: boolean;
}

export interface SortRead extends SortCreate {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SortUpdate {
  direction?: 'asc' | 'desc';
  priority?: number;
  is_active?: boolean;
}

export const createSort = (body: SortCreate) =>
  request<SortRead, SortCreate>({
    method: 'POST',
    url: '/sorts/',
    data: body,
  });

export const listSorts = (tableId?: string) =>
  request<SortRead[]>({
    method: 'GET',
    url: tableId ? `/sorts/?table_id=${tableId}` : '/sorts/',
  });

export const updateSort = (sortId: string, data: SortUpdate) =>
  request<SortRead, SortUpdate>({
    method: 'PATCH',
    url: `/sorts/${sortId}`,
    data,
  });

export const deleteSort = (sortId: string) =>
  request<{ deleted: string }>({
    method: 'DELETE',
    url: `/sorts/${sortId}`,
  });

export const clearTableSorts = (tableId: string) =>
  request<{ message: string }>({
    method: 'DELETE',
    url: `/sorts/table/${tableId}`,
  });
