import type { ApiError } from '@/lib/apiClient';
import  { queryKeys } from '@/lib/queryKeys';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { listFormulas, type FormulaCreateWithPosition, addFormula, deleteFormula } from '@/api/formulas';
import type { FormulaRead } from '@/types/openapi';

export const useFormulas = (columnId: string) =>
  useQuery<FormulaRead[], ApiError>({
    queryKey: queryKeys.formulas(columnId),
    queryFn: () => listFormulas(columnId),
    enabled: !!columnId,
  });
export const useAddFormula = () => {
  const qc = useQueryClient();
  return useMutation<FormulaRead, ApiError, FormulaCreateWithPosition>({
    mutationFn: addFormula,
    onSuccess: (_data, vars) => {
      if (vars.table_id) {
        qc.invalidateQueries({ queryKey: queryKeys.columns(vars.table_id) });
        qc.invalidateQueries({ queryKey: queryKeys.fields(vars.table_id) });
      }
    },
  });
};
export const useDeleteFormula = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteFormula,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.formulas() });
      qc.invalidateQueries({ queryKey: queryKeys.columns() });
    },
  });
};