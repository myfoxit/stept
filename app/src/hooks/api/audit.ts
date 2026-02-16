import { getAuditLogs, getAuditStats, type AuditLogEntry } from '@/api/audit';
import { useQuery } from '@tanstack/react-query';

const auditKeys = {
  logs: (projectId: string, filters?: Record<string, unknown>) =>
    ['auditLogs', projectId, filters] as const,
  stats: (projectId: string) => ['auditStats', projectId] as const,
};

export const useAuditLogs = (
  projectId: string,
  filters?: {
    action?: string;
    resource_type?: string;
    user_id?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
    offset?: number;
  }
) =>
  useQuery<AuditLogEntry[]>({
    queryKey: auditKeys.logs(projectId, filters),
    queryFn: () =>
      getAuditLogs({ project_id: projectId, ...filters }),
    enabled: !!projectId,
  });

export const useAuditStats = (projectId: string) =>
  useQuery<Record<string, number>>({
    queryKey: auditKeys.stats(projectId),
    queryFn: () => getAuditStats({ project_id: projectId }),
    enabled: !!projectId,
  });
