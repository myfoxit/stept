import { apiClient } from '@/lib/apiClient';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TableSummary {
  id: string;
  name: string;
  icon: string | null;
  position: number;
}

export interface DatabaseRead {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  project_id: string;
  folder_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  tables: TableSummary[];
}

export interface FieldRead {
  id: string;
  table_id: string;
  name: string;
  description: string | null;
  field_type: string;
  db_column_name: string;
  options: Record<string, any> | null;
  default_value: any;
  is_required: boolean;
  is_unique: boolean;
  is_primary: boolean;
  is_system: boolean;
  is_computed: boolean;
  position: number;
}

export interface ViewSummary {
  id: string;
  name: string;
  view_type: string;
  position: number;
}

export interface ViewFieldConfig {
  id: string;
  field_id: string;
  is_visible: boolean;
  width: number;
  position: number;
  wrap: boolean;
}

export interface ViewSortRead {
  id: string;
  field_id: string;
  direction: string;
  position: number;
}

export interface ViewFilterRead {
  id: string;
  field_id: string | null;
  operator: string | null;
  value: any;
  conjunction: string;
  position: number;
}

export interface ViewRead {
  id: string;
  table_id: string;
  name: string;
  view_type: string;
  position: number;
  config: Record<string, any> | null;
  row_coloring: Record<string, any> | null;
  is_locked: boolean;
  is_public: boolean;
  share_token: string | null;
  field_configs: ViewFieldConfig[];
  sorts: ViewSortRead[];
  filters: ViewFilterRead[];
  groups: any[];
}

export interface TableRead {
  id: string;
  database_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  position: number;
  created_at: string;
  fields: FieldRead[];
  views: ViewSummary[];
}

export interface RecordListResponse {
  records: Record<string, any>[];
  total: number;
  offset: number;
  limit: number;
  fields: FieldRead[];
}

// ── Database CRUD ──────────────────────────────────────────────────────────

export const listDatabases = async (projectId: string, folderId?: string): Promise<DatabaseRead[]> => {
  const params: Record<string, string> = { project_id: projectId };
  if (folderId) params.folder_id = folderId;
  const { data } = await apiClient.get('/databases', { params });
  return data;
};

export const getDatabase = async (databaseId: string): Promise<DatabaseRead> => {
  const { data } = await apiClient.get(`/databases/${databaseId}`);
  return data;
};

export const createDatabase = async (payload: {
  name?: string;
  description?: string;
  icon?: string;
  project_id: string;
  folder_id?: string | null;
}): Promise<DatabaseRead> => {
  const { data } = await apiClient.post('/databases', payload);
  return data;
};

export const updateDatabase = async (
  databaseId: string,
  payload: { name?: string; description?: string; icon?: string; folder_id?: string | null }
): Promise<DatabaseRead> => {
  const { data } = await apiClient.put(`/databases/${databaseId}`, payload);
  return data;
};

export const deleteDatabase = async (databaseId: string): Promise<void> => {
  await apiClient.delete(`/databases/${databaseId}`);
};

// ── Table CRUD ─────────────────────────────────────────────────────────────

export const createTable = async (
  databaseId: string,
  payload: { name?: string; description?: string; icon?: string }
): Promise<TableRead> => {
  const { data } = await apiClient.post(`/databases/${databaseId}/tables`, payload);
  return data;
};

export const getTable = async (tableId: string): Promise<TableRead> => {
  const { data } = await apiClient.get(`/databases/tables/${tableId}`);
  return data;
};

export const updateTable = async (
  tableId: string,
  payload: { name?: string; description?: string; icon?: string }
): Promise<TableRead> => {
  const { data } = await apiClient.put(`/databases/tables/${tableId}`, payload);
  return data;
};

export const deleteTable = async (tableId: string): Promise<void> => {
  await apiClient.delete(`/databases/tables/${tableId}`);
};

// ── Field CRUD ─────────────────────────────────────────────────────────────

export const createField = async (
  tableId: string,
  payload: {
    name: string;
    field_type: string;
    description?: string;
    options?: Record<string, any>;
    default_value?: any;
    is_required?: boolean;
    is_unique?: boolean;
  }
): Promise<FieldRead> => {
  const { data } = await apiClient.post(`/databases/tables/${tableId}/fields`, payload);
  return data;
};

export const updateField = async (
  fieldId: string,
  payload: {
    name?: string;
    description?: string;
    options?: Record<string, any>;
    default_value?: any;
    is_required?: boolean;
    is_unique?: boolean;
  }
): Promise<FieldRead> => {
  const { data } = await apiClient.put(`/databases/fields/${fieldId}`, payload);
  return data;
};

export const deleteField = async (fieldId: string): Promise<void> => {
  await apiClient.delete(`/databases/fields/${fieldId}`);
};

// ── View CRUD ──────────────────────────────────────────────────────────────

export const createView = async (
  tableId: string,
  payload: { name?: string; view_type?: string; config?: Record<string, any> }
): Promise<ViewRead> => {
  const { data } = await apiClient.post(`/databases/tables/${tableId}/views`, payload);
  return data;
};

export const getView = async (viewId: string): Promise<ViewRead> => {
  const { data } = await apiClient.get(`/databases/views/${viewId}`);
  return data;
};

export const updateView = async (
  viewId: string,
  payload: { name?: string; config?: Record<string, any>; row_coloring?: Record<string, any> }
): Promise<ViewRead> => {
  const { data } = await apiClient.put(`/databases/views/${viewId}`, payload);
  return data;
};

export const deleteView = async (viewId: string): Promise<void> => {
  await apiClient.delete(`/databases/views/${viewId}`);
};

export const updateViewSorts = async (
  viewId: string,
  sorts: { field_id: string; direction: string }[]
): Promise<ViewRead> => {
  const { data } = await apiClient.put(`/databases/views/${viewId}/sorts`, sorts);
  return data;
};

export const updateViewFilters = async (
  viewId: string,
  filters: { field_id?: string; operator?: string; value?: any; conjunction?: string }[]
): Promise<ViewRead> => {
  const { data } = await apiClient.put(`/databases/views/${viewId}/filters`, filters);
  return data;
};

// ── Record CRUD ────────────────────────────────────────────────────────────

export const listRecords = async (
  tableId: string,
  params?: {
    view_id?: string;
    offset?: number;
    limit?: number;
    sort?: string;
    filters?: string;
    search?: string;
  }
): Promise<RecordListResponse> => {
  const { data } = await apiClient.get(`/databases/tables/${tableId}/records`, { params });
  return data;
};

export const createRecord = async (
  tableId: string,
  fields: Record<string, any> = {}
): Promise<Record<string, any>> => {
  const { data } = await apiClient.post(`/databases/tables/${tableId}/records`, { fields });
  return data;
};

export const updateRecord = async (
  tableId: string,
  recordId: number,
  fields: Record<string, any>
): Promise<Record<string, any>> => {
  const { data } = await apiClient.put(`/databases/tables/${tableId}/records/${recordId}`, { fields });
  return data;
};

export const deleteRecord = async (tableId: string, recordId: number): Promise<void> => {
  await apiClient.delete(`/databases/tables/${tableId}/records/${recordId}`);
};

export const batchDeleteRecords = async (tableId: string, recordIds: number[]): Promise<{ deleted: number }> => {
  const { data } = await apiClient.post(`/databases/tables/${tableId}/records/batch-delete`, { record_ids: recordIds });
  return data;
};
