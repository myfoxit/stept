import type { RollupCreate, RollupRead, RollupUpdate } from '@/types/openapi';
import { request } from '../lib/apiClient';

/** Rollups */
export const addRollup = (body: RollupCreate) =>
  request<RollupRead, RollupCreate>({
    method: 'POST',
    url: '/datatable/rollups/',
    data: body,
  });

export const getRollup = (columnId: string) =>
  request<RollupRead[]>({
    method: 'GET',
    url: `/datatable/rollups/${columnId}`,
  });

export const deleteRollup = (rollupId: string) =>
  request<void>({
    method: 'DELETE',
    url: `/datatable/rollups/${rollupId}`,
  });

export const updateRollup = (columnId: string, body: RollupUpdate) =>
  request<RollupRead, RollupUpdate>({
    method: 'PATCH',
    url: `/datatable/rollups/${columnId}`,
    data: body,
  });
