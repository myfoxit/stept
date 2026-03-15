import { apiClient } from '@/lib/apiClient';
import type {
  ColumnVisibilityRead,
  ColumnVisibilityCreate,
  ColumnVisibilityBulkUpdate,
} from '@/types/openapi';

export async function createColumnVisibility(data: ColumnVisibilityCreate): Promise<ColumnVisibilityRead> {
  const response = await apiClient.post('/datatable/visibility/', data);
  return response.data;
}

export async function listColumnVisibility(tableId?: string): Promise<ColumnVisibilityRead[]> {
  const params = tableId ? { table_id: tableId } : {};
  const response = await apiClient.get('/datatable/visibility/', { params });
  return response.data;
}

export async function bulkUpdateVisibility(data: ColumnVisibilityBulkUpdate): Promise<ColumnVisibilityRead[]> {
  const response = await apiClient.post('/datatable/visibility/bulk', data);
  return response.data;
}

export async function deleteColumnVisibility(visibilityId: string): Promise<void> {
  await apiClient.delete(`/datatable/visibility/${visibilityId}`);
}

export async function clearTableVisibility(tableId: string): Promise<void> {
  await apiClient.delete(`/datatable/visibility/table/${tableId}`);
}
