import { request } from '../lib/apiClient';
import type { ColumnRead, LookUpColumnCreate } from '@/types/openapi';


export const createLookupColumn = (body: LookUpColumnCreate) =>
  request<ColumnRead, LookUpColumnCreate>({
    method: 'POST',
    url: '/lookup/',
    data: body,
  });

export const deleteLookupColumn = (columnId: string) =>
  request<void>({
    method: 'DELETE',
    url: `/lookup/${columnId}`,
  });