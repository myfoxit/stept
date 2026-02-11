import { createLookupColumn, deleteLookupColumn } from '@/api/lookup_columns';
import type { ApiError } from '@/lib/apiClient';
import  { queryKeys } from '@/lib/queryKeys';
import type { ColumnRead, LookUpColumnCreate } from '@/types/openapi';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';



export const useCreateLookupColumn = () => {
  const qc = useQueryClient();
  return useMutation<ColumnRead, ApiError, LookUpColumnCreate>({
    mutationFn: createLookupColumn,
    onSuccess: (data) => {
      // data.table_id comes from ColumnRead response
      qc.invalidateQueries({ queryKey: queryKeys.columns(data.table_id) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(data.table_id) });
    },
  });
};

export const useDeleteLookupColumn = () => {
  const qc = useQueryClient();
  return useMutation<
    Record<string, unknown>,
    ApiError,
    { columnId: string; tableId: string }
  >({
    mutationFn: ({ columnId }) => deleteLookupColumn(columnId),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.columns(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
    },
  });
};