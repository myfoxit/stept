import { listSelectOptions, createSelectColumn, updateSelectOptions, deleteSelectColumn, assignMultiSelectOptions, asssignSelectOptions } from '@/api/select_options';
import type { ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import type { SelectOption, ColumnRead, SelectColumnCreate } from '@/types/openapi';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

export const useSelectOptions = (columnId?: string) =>
  useQuery<SelectOption[], ApiError>({
    queryKey: queryKeys.selectOptions(columnId ?? ''),
    queryFn: () => listSelectOptions(columnId!),
    enabled: !!columnId,
  });

export const useCreateSelectColumn = () => {
  const qc = useQueryClient();
  return useMutation<
    ColumnRead,
    ApiError,
    SelectColumnCreate & { ui_type?: 'single_select' | 'multi_select' }
  >({
    mutationFn: createSelectColumn,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.columns(vars.table_id) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(vars.table_id) });
    },
  });
};

export const useUpdateSelectOptions = () => {
  const qc = useQueryClient();
  return useMutation<
    SelectOption[],
    ApiError,
    { columnId: string; options: SelectColumnCreate['options'] }
  >({
    mutationFn: ({ columnId, options }) =>
      updateSelectOptions(columnId, options),
    onSuccess: (_data, { columnId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.selectOptions(columnId) });
      qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'fields',
      });
    },
  });
};

export const useDeleteSelectColumn = () => {
  const qc = useQueryClient();
  return useMutation<
    Record<string, unknown>,
    ApiError,
    { columnId: string; tableId: string }
  >({
    mutationFn: ({ columnId }) => deleteSelectColumn(columnId),
    onSuccess: (_data, { tableId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.columns(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
    },
  });
};

export const useAssignSelectOption = () => {
  const qc = useQueryClient();
  return useMutation<
    Record<string, unknown>,
    ApiError,
    {
      tableId: string;
      rowId: number | string;
      columnId: string;
      optionId: string | null;
    }
  >({
    mutationFn: ({ columnId, rowId, optionId }) =>
      asssignSelectOptions(columnId, {
        row_id: Number(rowId),
        option_id: optionId,
      } as any),
    onSuccess: (_data, { tableId, columnId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.selectOptions(columnId) });
    },
  });
};

export const useAssignMultiSelectOptions = () => {
  const qc = useQueryClient();
  return useMutation<
    Record<string, unknown>,
    ApiError,
    {
      tableId: string;
      rowId: number | string;
      columnId: string;
      optionIds: string[] | null;
    }
  >({
    mutationFn: ({ columnId, rowId, optionIds }) =>
      assignMultiSelectOptions(columnId, rowId, optionIds),
    onSuccess: (_data, { tableId, columnId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.fields(tableId) });
      qc.invalidateQueries({ queryKey: queryKeys.selectOptions(columnId) });
    },
  });
};
