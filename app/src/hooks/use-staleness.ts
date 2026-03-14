import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  alert_id?: string | null;
  last_results?: StepCheckResult[];
}

export interface StepCheckResult {
  checked_at: string;
  status: 'passed' | 'failed';
  method: string | null;
  confidence?: number;
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

// ── Verification Job types ───────────────────────────────────────────────────

export interface VerificationJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total_steps: number;
  current_step: number;
  current_step_label?: string;
  started_at: string | null;
  completed_at: string | null;
  results?: VerificationJobResult;
  error?: string;
}

export interface VerificationJobResult {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  failed_steps: Array<{
    step_number: number;
    workflow_id: string;
    workflow_name?: string;
    reason: string;
  }>;
}

// ── Verification Config types ────────────────────────────────────────────────

export interface VerificationConfig {
  id?: string;
  project_id: string;
  auth_login_url: string;
  auth_email: string;
  auth_password: string;
  auth_email_selector?: string;
  auth_password_selector?: string;
  auth_submit_selector?: string;
  schedule_frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'manual';
  schedule_day?: number;
  schedule_time?: string;
  schedule_scope: 'all' | 'stale_only';
  llm_enabled: boolean;
  last_run_at?: string | null;
  next_run_at?: string | null;
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
    staleTime: 5 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

// ── Verification mutations ───────────────────────────────────────────────────

export const useRunVerification = () => {
  const qc = useQueryClient();
  return useMutation<
    { job_id: string },
    ApiError,
    { workflow_id?: string; project_id?: string; filter?: 'all' | 'stale' }
  >({
    mutationFn: async (params) => {
      const { data } = await apiClient.post<{ job_id: string }>(
        '/verification/run',
        params,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflowHealth'] });
      qc.invalidateQueries({ queryKey: ['projectHealth'] });
    },
  });
};

export const useVerificationJob = (jobId: string | null) =>
  useQuery<VerificationJob, ApiError>({
    queryKey: ['verificationJob', jobId],
    queryFn: async () => {
      const { data } = await apiClient.get<VerificationJob>(
        `/verification/jobs/${jobId}`,
      );
      return data;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'pending' || status === 'running') return 2000;
      return false;
    },
  });

export const useCancelVerification = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (jobId) => {
      await apiClient.post(`/verification/jobs/${jobId}/cancel`);
    },
    onSuccess: (_data, jobId) => {
      qc.invalidateQueries({ queryKey: ['verificationJob', jobId] });
      qc.invalidateQueries({ queryKey: ['workflowHealth'] });
      qc.invalidateQueries({ queryKey: ['projectHealth'] });
    },
  });
};

// ── Alert mutations ──────────────────────────────────────────────────────────

export const useResolveAlert = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (alertId) => {
      await apiClient.post(`/staleness-alerts/${alertId}/resolve`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflowHealth'] });
      qc.invalidateQueries({ queryKey: ['projectHealth'] });
    },
  });
};

export const useDismissAlert = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (alertId) => {
      await apiClient.post(`/staleness-alerts/${alertId}/dismiss`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflowHealth'] });
      qc.invalidateQueries({ queryKey: ['projectHealth'] });
    },
  });
};

// ── Verification config hooks ────────────────────────────────────────────────

export const useVerificationConfig = (projectId: string | undefined) =>
  useQuery<VerificationConfig, ApiError>({
    queryKey: ['verificationConfig', projectId],
    queryFn: async () => {
      const { data } = await apiClient.get<VerificationConfig>(
        `/projects/${projectId}/verification-config`,
      );
      return data;
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });

export const useUpdateVerificationConfig = () => {
  const qc = useQueryClient();
  return useMutation<VerificationConfig, ApiError, { projectId: string; config: Partial<VerificationConfig> }>({
    mutationFn: async ({ projectId, config }) => {
      const { data } = await apiClient.put<VerificationConfig>(
        `/projects/${projectId}/verification-config`,
        config,
      );
      return data;
    },
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['verificationConfig', projectId] });
    },
  });
};

export const useTestConnection = () =>
  useMutation<{ success: boolean; message: string }, ApiError, { projectId: string }>({
    mutationFn: async ({ projectId }) => {
      const { data } = await apiClient.post<{ success: boolean; message: string }>(
        `/projects/${projectId}/verification-config/test`,
      );
      return data;
    },
  });
