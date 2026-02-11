// hooks/useAddColumn.ts
import {
  useMutation,
  type UseMutationOptions,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';


import type { ColumnRead, ColumnCreate } from '@/types/openapi';
import { addColumn, reorderColumn, deleteColumn, listColumns, updateColumn } from '@/api/columns';
import type { ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';

// Accept default_value/settings in the vars shape for reuse across settings components
type CreateColumnVars = ColumnCreate & {
  position?: string;
  reference_column_id?: string;
  default_value?: any;
  settings?: Record<string, any>;
};

export const useAddColumn = (
  tableId: string,
  options?: UseMutationOptions<ColumnRead, ApiError, CreateColumnVars>
) => {
  const qc = useQueryClient();

  return useMutation<ColumnRead, ApiError, CreateColumnVars>({
    mutationFn: addColumn,
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: queryKeys.columns(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
      options?.onSuccess?.(data, vars, ctx);
    },
    ...options,
  });
};

// NEW: Hook for reordering columns
export const useReorderColumn = () => {
  const qc = useQueryClient();
  return useMutation<
    ColumnRead,
    ApiError,
    { columnId: string; newPosition: number; tableId: string }
  >({
    mutationFn: ({ columnId, newPosition }) =>
      reorderColumn(columnId, newPosition),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.columns(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
    },
  });
};

export const useDeleteColumn = () => {
  const qc = useQueryClient();
  return useMutation<
    Record<string, unknown>,
    ApiError,
    { tableId: string; colId: string; colName: string }
  >({
    mutationFn: ({ colId }) => deleteColumn(colId),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.columns(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
    },
  });
};

export const useColumns = (tableId?: string) =>
  useQuery<ColumnRead[], ApiError>({
    queryKey: queryKeys.columns(tableId ?? ''),
    queryFn: () => listColumns(tableId!), // tableId is guaranteed when enabled below
    enabled: !!tableId, // ← NEW: lazy fetch
  });

export const useUpdateColumn = () => {
  const qc = useQueryClient();
  return useMutation<
    ColumnRead,
    ApiError,
    {
      columnId: string;
      tableId: string;
      name?: string;
      default_value?: any; 
      settings?: Record<string, any>; 
    }
  >({
    mutationFn: ({ columnId, name, default_value, settings }) =>
      updateColumn(columnId, { name, default_value, settings }),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.columns(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
    },
  });
};


