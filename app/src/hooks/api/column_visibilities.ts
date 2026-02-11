import { listColumnVisibility, createColumnVisibility, bulkUpdateVisibility, deleteColumnVisibility, clearTableVisibility } from '@/api/column_visibility';
import type { ApiError } from '@/lib/apiClient';

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  ColumnVisibilityRead,
  ColumnVisibilityCreate,
  ColumnVisibilityBulkUpdate,
} from '@/types/openapi';


export const useColumnVisibility = (tableId?: string) =>
  useQuery<ColumnVisibilityRead[], ApiError>({
    queryKey: ['columnVisibility', tableId],
    queryFn: () => listColumnVisibility(tableId),
    enabled: !!tableId,
  });

export const useCreateColumnVisibility = () => {
  const qc = useQueryClient();
  return useMutation<ColumnVisibilityRead, ApiError, ColumnVisibilityCreate>({
    mutationFn: createColumnVisibility,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['columnVisibility', vars.table_id] });
    },
  });
};

export const useBulkUpdateVisibility = () => {
  const qc = useQueryClient();
  return useMutation<
    ColumnVisibilityRead[],
    ApiError,
    ColumnVisibilityBulkUpdate
  >({
    mutationFn: bulkUpdateVisibility,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['columnVisibility', vars.table_id] });
    },
  });
};

export const useDeleteColumnVisibility = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { visibilityId: string; tableId: string }>(
    {
      mutationFn: ({ visibilityId }) => deleteColumnVisibility(visibilityId),
      onSuccess: (_data, { tableId }) => {
        qc.invalidateQueries({ queryKey: ['columnVisibility', tableId] });
      },
    }
  );
};

export const useClearTableVisibility = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: clearTableVisibility,
    onSuccess: (_data, tableId) => {
      qc.invalidateQueries({ queryKey: ['columnVisibility', tableId] });
    },
  });
};