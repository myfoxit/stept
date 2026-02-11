import { listFilters, createFilter, updateFilter, deleteFilter, getColumnOperations } from '@/api/filters';
import type { ApiError } from '@/lib/apiClient';
import  { queryKeys } from '@/lib/queryKeys';
import type { FilterRead, FilterCreate, FilterUpdate } from '@/types/openapi';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';




export const useFilters = (tableId?: string) => {
  console.log('useFilters called with tableId:', tableId);

  const query = useQuery<FilterRead[], ApiError>({
    queryKey: queryKeys.filters(tableId),
    queryFn: async () => {
      console.log('listFilters queryFn executing with:', tableId);
      try {
        const result = await listFilters(tableId);
        console.log('listFilters result:', result);
        return result;
      } catch (error) {
        console.error('listFilters error in queryFn:', error);
        throw error;
      }
    },
    enabled: !!tableId,
  });


  console.log('useFilters query state:', {
    isLoading: query.isLoading,
    isError: query.isError,
    isSuccess: query.isSuccess,
    data: query.data,
    error: query.error,
  });

  return query;
};

export const useCreateFilter = () => {
  const qc = useQueryClient();
  return useMutation<FilterRead, ApiError, FilterCreate>({
    mutationFn: createFilter,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.filters(vars.table_id) });
    
      qc.invalidateQueries({ queryKey: queryKeys.columns(vars.table_id) });
      
      qc.invalidateQueries({ queryKey: queryKeys.fields(vars.table_id) });
    },
  });
};

export const useUpdateFilter = () => {
  const qc = useQueryClient();
  return useMutation<
    FilterRead,
    ApiError,
    { filterId: string; updates: FilterUpdate; tableId: string }
  >({
    mutationFn: ({ filterId, updates }) => updateFilter(filterId, updates),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.filters(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.columns(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
    },
  });
};

export const useDeleteFilter = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { filterId: string; tableId: string }>({
    mutationFn: ({ filterId }) => deleteFilter(filterId),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.filters(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.columns(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
    },
  });
};

export const useColumnOperations = (columnId: string) =>
  useQuery<string[], ApiError>({
    queryKey: ['filterOperations', columnId],
    queryFn: () => getColumnOperations(columnId),
    enabled: !!columnId,
  });