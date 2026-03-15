import {
  listDatabases, getDatabase, createDatabase, updateDatabase, deleteDatabase,
  getTable, createTable, updateTable, deleteTable,
  createField, updateField, deleteField,
  getView, createView, updateView, deleteView, updateViewSorts, updateViewFilters,
  listRecords, createRecord, updateRecord, deleteRecord, batchDeleteRecords,
  type DatabaseRead, type TableRead, type FieldRead, type ViewRead, type RecordListResponse,
} from '@/api/databases';
import { type ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export type { DatabaseRead, TableRead, FieldRead, ViewRead, RecordListResponse };

// ── Database hooks ─────────────────────────────────────────────────────────

export const useDatabases = (projectId?: string, folderId?: string) =>
  useQuery<DatabaseRead[], ApiError>({
    queryKey: [...queryKeys.databases(projectId!), folderId],
    queryFn: () => listDatabases(projectId!, folderId),
    enabled: !!projectId,
  });

export const useDatabase = (databaseId?: string) =>
  useQuery<DatabaseRead, ApiError>({
    queryKey: queryKeys.database(databaseId!),
    queryFn: () => getDatabase(databaseId!),
    enabled: !!databaseId,
  });

export const useCreateDatabase = () => {
  const qc = useQueryClient();
  return useMutation<DatabaseRead, ApiError, { name?: string; projectId: string; folderId?: string | null }>({
    mutationFn: ({ name, projectId, folderId }) =>
      createDatabase({ name, project_id: projectId, folder_id: folderId }),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.databases(projectId) });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, false] });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, true] });
    },
  });
};

export const useUpdateDatabase = () => {
  const qc = useQueryClient();
  return useMutation<
    DatabaseRead,
    ApiError,
    { databaseId: string; name?: string; description?: string; icon?: string; projectId: string }
  >({
    mutationFn: ({ databaseId, name, description, icon }) =>
      updateDatabase(databaseId, { name, description, icon }),
    onSuccess: (data, { projectId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.database(data.id) });
      qc.invalidateQueries({ queryKey: queryKeys.databases(projectId) });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, false] });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, true] });
    },
  });
};

export const useDeleteDatabase = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { databaseId: string; projectId: string }>({
    mutationFn: ({ databaseId }) => deleteDatabase(databaseId),
    onSuccess: (_data, { databaseId, projectId }) => {
      qc.removeQueries({ queryKey: queryKeys.database(databaseId) });
      qc.invalidateQueries({ queryKey: queryKeys.databases(projectId) });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, false] });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, true] });
    },
  });
};

// ── Table hooks ────────────────────────────────────────────────────────────

export const useTable = (tableId?: string) =>
  useQuery<TableRead, ApiError>({
    queryKey: queryKeys.dbTable(tableId!),
    queryFn: () => getTable(tableId!),
    enabled: !!tableId,
  });

export const useCreateTable = () => {
  const qc = useQueryClient();
  return useMutation<TableRead, ApiError, { databaseId: string; name?: string }>({
    mutationFn: ({ databaseId, name }) => createTable(databaseId, { name }),
    onSuccess: (_data, { databaseId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.database(databaseId) });
    },
  });
};

export const useUpdateTable = () => {
  const qc = useQueryClient();
  return useMutation<TableRead, ApiError, { tableId: string; databaseId: string; name?: string }>({
    mutationFn: ({ tableId, name }) => updateTable(tableId, { name }),
    onSuccess: (data, { databaseId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dbTable(data.id) });
      qc.invalidateQueries({ queryKey: queryKeys.database(databaseId) });
    },
  });
};

export const useDeleteTable = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { tableId: string; databaseId: string }>({
    mutationFn: ({ tableId }) => deleteTable(tableId),
    onSuccess: (_data, { tableId, databaseId }) => {
      qc.removeQueries({ queryKey: queryKeys.dbTable(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.database(databaseId) });
    },
  });
};

// ── Field hooks ────────────────────────────────────────────────────────────

export const useCreateField = () => {
  const qc = useQueryClient();
  return useMutation<
    FieldRead,
    ApiError,
    { tableId: string; name: string; field_type: string; options?: Record<string, any> }
  >({
    mutationFn: ({ tableId, name, field_type, options }) =>
      createField(tableId, { name, field_type, options }),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dbTable(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.dbRecords(tableId) });
    },
  });
};

export const useUpdateField = () => {
  const qc = useQueryClient();
  return useMutation<FieldRead, ApiError, { fieldId: string; tableId: string; name?: string; options?: Record<string, any> }>({
    mutationFn: ({ fieldId, name, options }) => updateField(fieldId, { name, options }),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dbTable(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.dbRecords(tableId) });
    },
  });
};

export const useDeleteField = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { fieldId: string; tableId: string }>({
    mutationFn: ({ fieldId }) => deleteField(fieldId),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dbTable(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.dbRecords(tableId) });
    },
  });
};

// ── View hooks ─────────────────────────────────────────────────────────────

export const useView = (viewId?: string) =>
  useQuery<ViewRead, ApiError>({
    queryKey: queryKeys.dbView(viewId!),
    queryFn: () => getView(viewId!),
    enabled: !!viewId,
  });

export const useCreateView = () => {
  const qc = useQueryClient();
  return useMutation<ViewRead, ApiError, { tableId: string; name?: string; view_type?: string }>({
    mutationFn: ({ tableId, name, view_type }) => createView(tableId, { name, view_type }),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dbTable(tableId) });
    },
  });
};

export const useUpdateViewSorts = () => {
  const qc = useQueryClient();
  return useMutation<ViewRead, ApiError, { viewId: string; tableId: string; sorts: { field_id: string; direction: string }[] }>({
    mutationFn: ({ viewId, sorts }) => updateViewSorts(viewId, sorts),
    onSuccess: (data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dbView(data.id) });
      qc.invalidateQueries({ queryKey: queryKeys.dbRecords(tableId) });
    },
  });
};

export const useUpdateViewFilters = () => {
  const qc = useQueryClient();
  return useMutation<
    ViewRead,
    ApiError,
    { viewId: string; tableId: string; filters: { field_id?: string; operator?: string; value?: any; conjunction?: string }[] }
  >({
    mutationFn: ({ viewId, filters }) => updateViewFilters(viewId, filters),
    onSuccess: (data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dbView(data.id) });
      qc.invalidateQueries({ queryKey: queryKeys.dbRecords(tableId) });
    },
  });
};

// ── Record hooks ───────────────────────────────────────────────────────────

export const useRecords = (
  tableId?: string,
  params?: { view_id?: string; offset?: number; limit?: number; sort?: string; filters?: string; search?: string }
) =>
  useQuery<RecordListResponse, ApiError>({
    queryKey: [...queryKeys.dbRecords(tableId!), params],
    queryFn: () => listRecords(tableId!, params),
    enabled: !!tableId,
  });

export const useCreateRecord = () => {
  const qc = useQueryClient();
  return useMutation<Record<string, any>, ApiError, { tableId: string; fields?: Record<string, any> }>({
    mutationFn: ({ tableId, fields }) => createRecord(tableId, fields),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dbRecords(tableId) });
    },
  });
};

export const useUpdateRecord = () => {
  const qc = useQueryClient();
  return useMutation<
    Record<string, any>,
    ApiError,
    { tableId: string; recordId: number; fields: Record<string, any> }
  >({
    mutationFn: ({ tableId, recordId, fields }) => updateRecord(tableId, recordId, fields),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dbRecords(tableId) });
    },
  });
};

export const useDeleteRecord = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { tableId: string; recordId: number }>({
    mutationFn: ({ tableId, recordId }) => deleteRecord(tableId, recordId),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dbRecords(tableId) });
    },
  });
};

export const useBatchDeleteRecords = () => {
  const qc = useQueryClient();
  return useMutation<{ deleted: number }, ApiError, { tableId: string; recordIds: number[] }>({
    mutationFn: ({ tableId, recordIds }) => batchDeleteRecords(tableId, recordIds),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.dbRecords(tableId) });
    },
  });
};
