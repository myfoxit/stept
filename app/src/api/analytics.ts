import { request, getApiBaseUrl } from '@/lib/apiClient';

export type AnalyticsPeriod = '7d' | '30d' | '90d';

export interface AnalyticsOverview {
  active_guides: number;
  guide_starts: number;
  guide_completions: number;
  completion_rate: number;
  users_guided: number;
  self_healing_count: number;
  self_healing_success_rate: number;
  period: AnalyticsPeriod;
}

export interface GuideAnalyticsRow {
  guide_id: string;
  name: string;
  views: number;
  completions: number;
  abandonments: number;
  step_views: number;
  step_completions: number;
  completion_rate: number;
  step_completion_rate: number;
  avg_time_ms: number;
}

export interface GuidesAnalyticsResponse {
  guides: GuideAnalyticsRow[];
}

export const getAnalyticsOverview = (projectId: string, period: AnalyticsPeriod) =>
  request<AnalyticsOverview>({
    method: 'GET',
    url: '/analytics/overview',
    params: {
      project_id: projectId,
      period,
    },
  });

export const getGuidesAnalytics = (projectId: string, period: AnalyticsPeriod) =>
  request<GuidesAnalyticsResponse>({
    method: 'GET',
    url: '/analytics/guides',
    params: {
      project_id: projectId,
      period,
    },
  });

export async function exportAnalytics(projectId: string, period: AnalyticsPeriod): Promise<void> {
  const apiBaseUrl = getApiBaseUrl();
  const url = new URL(`${apiBaseUrl}/analytics/export`, window.location.origin);
  url.searchParams.set('project_id', projectId);
  url.searchParams.set('period', period);

  const response = await fetch(url.toString(), {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to export analytics');
  }

  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `analytics_${period}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
