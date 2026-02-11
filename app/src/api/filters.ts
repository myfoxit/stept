import { request } from '../lib/apiClient';
import type { FilterCreate, FilterRead, FilterUpdate } from '@/types/openapi';

/** Fields / Rows */
export const createFilter = (body: FilterCreate) =>
  request<Record<string, unknown>, FilterCreate>({
    method: 'POST',
    url: '/filters/',
    data: body,
  });

export const updateFilter = (
  filterId: string,
  data: Partial<FilterUpdate>
): Promise<Record<string, unknown>> => {
  return request<Record<string, unknown>, Partial<FilterUpdate>>({
    method: 'PATCH',
    url: `/filters/${filterId}`,
    data: { data },
  });
};
export const listFilters = (tableId: string) => {
  return request<FilterRead[]>({
    method: 'GET',
    url: `/filters/?tableId=${tableId}`,
  });
};
export const deleteFilter = (filterId: string) =>
  request<Record<string, unknown>>({
    method: 'DELETE',
    url: `/filters/${filterId}`,
  });

export const getColumnOperations = (columnId: string) =>
  request<[]>({
    method: 'GET',
    url: `/filters/operations/${columnId}`,
  });
