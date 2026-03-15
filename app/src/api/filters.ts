import { request } from '../lib/apiClient';
import type { FilterCreate, FilterRead, FilterUpdate } from '@/types/openapi';

export const createFilter = (body: FilterCreate) =>
  request<FilterRead, FilterCreate>({
    method: 'POST',
    url: '/datatable/filters/',
    data: body,
  });

export const updateFilter = (
  filterId: string,
  data: FilterUpdate
): Promise<FilterRead> => {
  return request<FilterRead, FilterUpdate>({
    method: 'PATCH',
    url: `/datatable/filters/${filterId}`,
    data,
  });
};

export const listFilters = (tableId?: string) => {
  return request<FilterRead[]>({
    method: 'GET',
    url: '/datatable/filters/',
    params: tableId ? { table_id: tableId } : undefined,
  });
};

export const deleteFilter = (filterId: string) =>
  request<void>({
    method: 'DELETE',
    url: `/datatable/filters/${filterId}`,
  });

export const getColumnOperations = (columnId: string) =>
  request<string[]>({
    method: 'GET',
    url: `/datatable/filters/operations/${columnId}`,
  });
