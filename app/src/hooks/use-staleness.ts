import { useQuery } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/lib/apiClient';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StepHealth {
  step_number: number;
  status: 'passed' | 'failed' | 'unreliable' | 'needs_auth' | 'url_error' | 'skipped';
  reliability: number;
  is_reliable: boolean;
  last_method: string | null;
  last_checked: string | null;
  failing_since?: string | null;
  llm_explanation?: string | null;
  finder_confidence?: number;
}

export interface StaleAlert {
  id: string;
  type: string;
  severity: 'warning' | 'critical';
  title: string;
  created_at: string;
}

export interface WorkflowHealth {
  health_score: number | null;
  health_status: 'healthy' | 'aging' | 'stale' | 'unknown' | null;
  coverage: number | null;
  last_verified_at: string | null;
  last_verified_source: string | null;
  steps: StepHealth[];
  alerts: StaleAlert[];
}

export interface StaleWorkflowSummary {
  id: string;
  name: string;
  health_score: number;
  health_status: string;
  failed_step_count?: number;
}

export interface ProjectHealth {
  total_workflows: number;
  healthy: number;
  aging: number;
  stale: number;
  unknown: number;
  total_steps: number;
  coverage: number;
  stale_workflows: StaleWorkflowSummary[];
  aging_workflows: StaleWorkflowSummary[];
  last_run: { at: string; status: string; stats: Record<string, number> } | null;
  next_run: string | null;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export const useWorkflowHealth = (workflowId: string | undefined) =>
  useQuery<WorkflowHealth, ApiError>({
    queryKey: ['workflowHealth', workflowId],
    queryFn: async () => {
      const { data } = await apiClient.get<WorkflowHealth>(
        `/workflows/${workflowId}/health`,
      );
      return data;
    },
    enabled: !!workflowId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });

export const useProjectHealth = (projectId: string | undefined) =>
  useQuery<ProjectHealth, ApiError>({
    queryKey: ['projectHealth', projectId],
    queryFn: async () => {
      const { data } = await apiClient.get<ProjectHealth>(
        `/projects/${projectId}/health`,
      );
      return data;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
