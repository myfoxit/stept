import { request } from '../lib/apiClient';
import { type StoreViewRead, type StoreViewCreate } from '../types/openapi';

// ────────────────────────────────────────────
// Store-Views
// ────────────────────────────────────────────
export const listStoreViews = () =>
  request<StoreViewRead[]>({ method: 'GET', url: '/store_views/' });

export const createStoreView = (body: StoreViewCreate) =>
  request<StoreViewRead, StoreViewCreate>({
    method: 'POST',
    url: '/store_views/',
    data: body,
  });

export const deleteStoreView = (storeViewId: string) =>
  request<void>({
    method: 'DELETE',
    url: `/store_views/${storeViewId}`,
  });
