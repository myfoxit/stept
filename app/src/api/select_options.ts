import { request } from '../lib/apiClient';
import type {
  ColumnRead,
  SelectColumnCreate,
  SelectOption,
} from '../types/openapi';

export const createSelectColumn = (body: SelectColumnCreate & { ui_type?: string }) =>
  request<ColumnRead, SelectColumnCreate & { ui_type?: string }>({
    method: 'POST',
    url: '/datatable/select-options/',
    data: body,
  });

export const listSelectOptions = (columnId: string) =>
  request<SelectOption[]>({
    method: 'GET',
    url: `/datatable/select-options/${columnId}`,
  });

export const updateSelectOptions = (
  columnId: string,
  options: SelectColumnCreate['options']
) =>
  request<SelectOption[]>({
    method: 'PUT',
    url: `/datatable/select-options/${columnId}`,
    data: { options }, // Wrap options in an object
  });

export const asssignSelectOptions = (
  columnId: string,
  options: SelectColumnCreate['options']
) =>
  request<SelectOption[]>({
    method: 'POST',
    url: `/datatable/select-options/${columnId}/assign`,
    data: options,
  });

export const assignMultiSelectOptions = (
  columnId: string,
  rowId: number | string,
  optionIds: string[] | null
) =>
  request<{ row_id: number; options: string[] }>({
    method: 'POST',
    url: `/datatable/select-options/${columnId}/assign-multi`,
    data: { row_id: Number(rowId), option_ids: optionIds },
  });

export const deleteSelectColumn = (columnId: string) =>
  request<Record<string, unknown>>({
    method: 'DELETE',
    url: `/datatable/select-options/${columnId}`,
  });
