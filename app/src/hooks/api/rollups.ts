import { getRollup, addRollup, updateRollup, deleteRollup } from '@/api/rollups';
import type { ApiError } from '@/lib/apiClient';
import type { RollupRead, RollupCreate, RollupUpdate } from '@/types/openapi';

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

export const useRollup = (columnId: string) =>
  useQuery<RollupRead, ApiError>({
    queryKey: ['rollup', columnId],
    queryFn: () => getRollup(columnId),
    enabled: !!columnId,
  });

export const useAddRollup = () => {
  const qc = useQueryClient();
  return useMutation<RollupRead, ApiError, RollupCreate>({
    mutationFn: addRollup,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['rollup', data.column_id] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'columns' });
    },
  });
};

export const useUpdateRollup = () => {
  const qc = useQueryClient();
  return useMutation<
    RollupRead,
    ApiError,
    { columnId: string; data: RollupUpdate }
  >({
    mutationFn: ({ columnId, data }) => updateRollup(columnId, data),
    onSuccess: (_d, { columnId }) => {
      qc.invalidateQueries({ queryKey: ['rollup', columnId] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'columns' });
    },
  });
};

export const useDeleteRollup = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteRollup,
    onSuccess: (_d, columnId) => {
      qc.invalidateQueries({ queryKey: ['rollup', columnId] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'columns' });
    },
  });
};