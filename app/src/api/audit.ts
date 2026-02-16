// ────────────────────────────────────────────
// File: src/api/audit.ts
// ────────────────────────────────────────────
import { request } from '../lib/apiClient';

export interface AuditLogEntry {
  id: string;
  action: string | null;
  user_id: string | null;
  api_key_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  detail: string | null;
  ip_address: string | null;
  created_at: string | null;
}

export interface AuditLogParams {
  project_id: string;
  action?: string;
  resource_type?: string;
  user_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

/** Get audit logs for a project */
export const getAuditLogs = (params: AuditLogParams) =>
  request<AuditLogEntry[]>({
    method: 'GET',
    url: '/audit/logs',
    params,
  });

/** Export audit logs as CSV */
export const exportAuditLogs = (params: Omit<AuditLogParams, 'limit' | 'offset'>) =>
  request<Blob>({
    method: 'GET',
    url: '/audit/logs/export',
    params,
    responseType: 'blob',
  });

/** Get audit log stats (action counts) */
export const getAuditStats = (params: {
  project_id: string;
  from_date?: string;
  to_date?: string;
}) =>
  request<Record<string, number>>({
    method: 'GET',
    url: '/audit/logs/stats',
    params,
  });
