// ────────────────────────────────────────────
// File: src/api/analytics.ts
// ────────────────────────────────────────────
import { request } from '../lib/apiClient';

/** Get top accessed resources */
export const getTopAccessed = (projectId: string, days = 30, limit = 10) =>
  request<any[]>({
    method: 'GET',
    url: '/analytics/top-accessed',
    params: { project_id: projectId, days, limit },
  });

/** Get access counts grouped by channel */
export const getAccessByChannel = (projectId: string, days = 30) =>
  request<any[]>({
    method: 'GET',
    url: '/analytics/access-by-channel',
    params: { project_id: projectId, days },
  });

/** Get stale resources */
export const getStaleResources = (projectId: string, days = 90) =>
  request<any[]>({
    method: 'GET',
    url: '/analytics/stale',
    params: { project_id: projectId, days },
  });

/** Get query log */
export const getQueryLog = (projectId: string, days = 30, limit = 50) =>
  request<any[]>({
    method: 'GET',
    url: '/analytics/queries',
    params: { project_id: projectId, days, limit },
  });

/** Get knowledge gaps */
export const getKnowledgeGaps = (projectId: string, days = 30) =>
  request<any[]>({
    method: 'GET',
    url: '/analytics/gaps',
    params: { project_id: projectId, days },
  });
