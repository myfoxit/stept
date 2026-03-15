import { request } from '../lib/apiClient';
import type { ColumnRead, LookUpColumnCreate } from '@/types/openapi';


export const createLookupColumn = (body: LookUpColumnCreate) =>
  request<ColumnRead, LookUpColumnCreate>({
    method: 'POST',
    url: '/datatable/lookups/',
    data: body,
  });

export const deleteLookupColumn = (columnId: string) =>
  request<void>({
    method: 'DELETE',
    url: `/datatable/lookups/${columnId}`,
  });