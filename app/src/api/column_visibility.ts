import { apiClient } from '@/lib/apiClient';
import type {
  ColumnVisibilityRead,
  ColumnVisibilityCreate,
  ColumnVisibilityBulkUpdate,
} from '@/types/openapi';

export async function createColumnVisibility(data: ColumnVisibilityCreate): Promise<ColumnVisibilityRead> {
  const response = await apiClient.post('/column_visibility/', data);
  return response.data;
}

export async function listColumnVisibility(tableId?: string): Promise<ColumnVisibilityRead[]> {
  const params = tableId ? { table_id: tableId } : {};
  const response = await apiClient.get('/column_visibility/', { params });
  return response.data;
}

export async function bulkUpdateVisibility(data: ColumnVisibilityBulkUpdate): Promise<ColumnVisibilityRead[]> {
  const response = await apiClient.post('/column_visibility/bulk', data);
  return response.data;
}

export async function deleteColumnVisibility(visibilityId: string): Promise<void> {
  await apiClient.delete(`/column_visibility/${visibilityId}`);
}

export async function clearTableVisibility(tableId: string): Promise<void> {
  await apiClient.delete(`/column_visibility/table/${tableId}`);
}
