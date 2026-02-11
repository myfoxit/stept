import { type RowPage, listRows, insertRowApi, updateRow, deleteRow, searchRows } from '@/api/fields';
import { apiClient, type ApiError } from '@/lib/apiClient';
import  { queryKeys } from '@/lib/queryKeys';
import type { FieldRead, FieldCreate } from '@/types/openapi';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';



export const useRows = (
  tableId: string,
  applyFilters = true,
  applySorts = true, 
  limit = 100,
  offset = 0
) =>
  useQuery<RowPage<FieldRead>, ApiError>({
    queryKey: [
      ...queryKeys.fields(tableId, applyFilters, applySorts),
      limit,
      offset,
    ], 
    queryFn: () => listRows(tableId, applyFilters, applySorts, limit, offset), // ← UPDATED
    enabled: !!tableId,
  });

export const useInsertRow = (): UseMutationResult<
  Record<string, unknown>,
  ApiError,
  FieldCreate
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: insertRowApi,
    onSuccess: (_data, vars) => {
      // Invalidate all row-related queries for this table
      qc.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return (
            key[0] === 'rows' && 
            key[1] === vars.table_id
          );
        }
      });
    
      qc.invalidateQueries({ queryKey: queryKeys.fields(vars.table_id) });
    },
  });
};

export const useUpdateRow = () => {
  const qc = useQueryClient();
  return useMutation<
    Record<string, unknown>,
    ApiError,
    { tableId: string; rowId: number; data: Record<string, any> }
  >({
    mutationFn: ({ tableId, rowId, data }) => updateRow(tableId, rowId, data),
    onSuccess: (_, { tableId }) => {

      qc.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return (
            key[0] === 'rows' && 
            key[1] === tableId
          );
        }
      });

      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
    },
  });
};

export const useBatchUpdateRows = () => {
  const qc = useQueryClient();
  return useMutation<
    void,
    ApiError,
    {
      tableId: string;
      updates: Array<{ rowId: number; data: Record<string, any> }>;
    }
  >({
    mutationFn: async ({ tableId, updates }) => {
      await Promise.all(
        updates.map(({ rowId, data }) => updateRow(tableId, rowId, data))
      );
    },
    onSuccess: (_, { tableId }) =>
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) }),
  });
};

export const useDeleteRow = () => {
  const qc = useQueryClient();
  return useMutation<
    Record<string, unknown>,
    ApiError,
    { tableId: string | number; rowId: number } 
  >({
    mutationFn: ({ tableId, rowId }) => deleteRow(String(tableId), rowId), 
    onSuccess: (_, { tableId }) =>
      qc.invalidateQueries({ queryKey: queryKeys.fields(String(tableId)) }),
  });
};

export const useInsertRowAtPosition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      table_id,
      data,
      position,
      reference_row_id,
    }: {
      table_id: string;
      data: Record<string, any>;
      position: 'above' | 'below';
      reference_row_id?: number;
    }) => {
      const response = await apiClient.post('/fields/position', {
        table_id,
        data,
        position,
        reference_row_id,
      });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rows', variables.table_id] });
    },
  });
};


export const useSearchRows = (
  tableId: string,
  query: string,
  scope: 'global' | string = 'global',
  limit = 100,
  offset = 0,
  options?: { enabled?: boolean }
) =>
  useQuery<RowPage<FieldRead>, ApiError>({
    queryKey: ['search', tableId, query, scope, limit, offset],
    queryFn: () => searchRows(tableId, query, scope, limit, offset),
    enabled: options?.enabled ?? true,
  });

