import { listTables, createTable, dropTable, updateTable, getTable } from '@/api/tables';
import type { ApiError } from '@/lib/apiClient';
import  { queryKeys } from '@/lib/queryKeys';
import type { TableRead, TableCreate } from '@/types/openapi';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

export const useTables = (projectId: string) =>
  useQuery<TableRead[], ApiError>({
    queryKey: queryKeys.tables(projectId),
    queryFn: () => listTables(projectId),
  });
export const useCreateTable = () => {
  const qc = useQueryClient();
  return useMutation<TableRead, ApiError, TableCreate>({
    mutationFn: createTable,
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: queryKeys.tables(vars.project_id) }),
  });
};
export const useDropTable = () => {
  const qc = useQueryClient();
  return useMutation<
    TableRead,
    ApiError,
    { tableId: string; projectId: string }
  >({
    mutationFn: ({ tableId }) => dropTable(tableId),
    onSuccess: (_data, { projectId }) =>
      qc.invalidateQueries({ queryKey: queryKeys.tables(projectId) }),
  });
};
// add: hook to update table name
export const useUpdateTable = () => {
  const qc = useQueryClient();
  return useMutation<
    TableRead,
    ApiError,
    { tableId: string; name: string; projectId: string }
  >({
    mutationFn: ({ tableId, name }) => updateTable(tableId, { name }),
    onSuccess: (_data, { projectId }) =>
      qc.invalidateQueries({ queryKey: queryKeys.tables(projectId) }),
  });
};


export function useTable(tableId: string) {
  return useQuery({
    queryKey: ['table', tableId],
    queryFn: () => getTable(tableId),
    enabled: !!tableId,
  });
}
