import { type SortRead, listSorts, type SortCreate, createSort, type SortUpdate, updateSort, deleteSort, clearTableSorts } from '@/api/sorts';
import type { ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

export const useSorts = (tableId?: string) =>
  useQuery<SortRead[], ApiError>({
    queryKey: ['sorts', tableId],
    queryFn: () => listSorts(tableId),
    enabled: !!tableId,
  });

export const useCreateSort = () => {
  const qc = useQueryClient();
  return useMutation<SortRead, ApiError, SortCreate>({
    mutationFn: createSort,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['sorts', vars.table_id] });
      qc.invalidateQueries({ queryKey: queryKeys.fields(vars.table_id) });
    },
  });
};

export const useUpdateSort = () => {
  const qc = useQueryClient();
  return useMutation<
    SortRead,
    ApiError,
    { sortId: string; updates: SortUpdate; tableId: string }
  >({
    mutationFn: ({ sortId, updates }) => updateSort(sortId, updates),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: ['sorts', tableId] });
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
    },
  });
};

export const useDeleteSort = () => {
  const qc = useQueryClient();
  return useMutation<
    { deleted: string },
    ApiError,
    { sortId: string; tableId: string }
  >({
    mutationFn: ({ sortId }) => deleteSort(sortId),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: ['sorts', tableId] });
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
    },
  });
};

export const useClearTableSorts = () => {
  const qc = useQueryClient();
  return useMutation<{ message: string }, ApiError, string>({
    mutationFn: clearTableSorts,
    onSuccess: (_data, tableId) => {
      qc.invalidateQueries({ queryKey: ['sorts', tableId] });
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
    },
  });
};
