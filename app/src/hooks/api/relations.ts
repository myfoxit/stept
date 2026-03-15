import { listRelations, addRelation, deleteRelation, assignRelation, unAssignRelation } from '@/api/relations';
import type { ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import type { RelationRead, RelationCreate, RelationAssign } from '@/types/openapi';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

export const useRelations = (leftTableId?: string, rightTableId?: string) =>
  useQuery<RelationRead[], ApiError>({
    queryKey: queryKeys.relations(leftTableId, rightTableId),
    queryFn: () => listRelations(leftTableId, rightTableId),
    enabled: leftTableId !== undefined || rightTableId !== undefined,
  });

export const useCreateRelation = () => {
  const qc = useQueryClient();
  return useMutation<RelationRead, ApiError, RelationCreate>({
    mutationFn: addRelation,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({
        queryKey: queryKeys.relations(vars.left_table_id, vars.right_table_id),
      });
      qc.invalidateQueries({ queryKey: queryKeys.columns(vars.left_table_id) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(vars.left_table_id) });
      if (vars.right_table_id) {
        qc.invalidateQueries({ queryKey: queryKeys.fields(vars.right_table_id) });
        qc.invalidateQueries({ queryKey: queryKeys.columns(vars.right_table_id) });
      }
    },
  });
};

export const useDeleteRelation = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteRelation,
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'relations' });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'fields' });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'columns' });
    },
  });
};

type RelationMutationVars = RelationAssign & {
  relationId: string;
  left_table_id: string;
  right_table_id?: string;
};

export const useAssignRelation = () => {
  const qc = useQueryClient();
  return useMutation<Record<string, unknown>, ApiError, RelationMutationVars>({
    mutationFn: ({ relationId, ...payload }) =>
      assignRelation(relationId, payload),
    onSuccess: (_data, { relationId, left_table_id, right_table_id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.relations(relationId) });
      qc.invalidateQueries({ queryKey: queryKeys.columns(left_table_id) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(left_table_id) });
      if (right_table_id) {
        qc.invalidateQueries({ queryKey: queryKeys.columns(right_table_id) });
        qc.invalidateQueries({ queryKey: queryKeys.fields(right_table_id) });
      }
    },
  });
};

export const useUnAssignRelation = () => {
  const qc = useQueryClient();
  return useMutation<Record<string, unknown>, ApiError, RelationMutationVars>({
    mutationFn: ({ relationId, ...payload }) =>
      unAssignRelation(relationId, payload),
    onSuccess: (_data, { relationId, left_table_id, right_table_id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.relations(relationId) });
      qc.invalidateQueries({ queryKey: queryKeys.columns(left_table_id) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(left_table_id) });
      if (right_table_id) {
        qc.invalidateQueries({ queryKey: queryKeys.columns(right_table_id) });
        qc.invalidateQueries({ queryKey: queryKeys.fields(right_table_id) });
      }
    },
  });
};
