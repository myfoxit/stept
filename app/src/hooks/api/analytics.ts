import { useQuery } from '@tanstack/react-query';

import { getAnalyticsOverview, getGuidesAnalytics, type AnalyticsPeriod } from '@/api/analytics';

export const useAnalyticsOverview = (projectId?: string | null, period: AnalyticsPeriod = '30d') =>
  useQuery({
    queryKey: ['analytics', 'overview', projectId, period],
    queryFn: () => getAnalyticsOverview(projectId!, period),
    enabled: !!projectId,
    staleTime: 60_000,
  });

export const useGuidesAnalytics = (projectId?: string | null, period: AnalyticsPeriod = '30d') =>
  useQuery({
    queryKey: ['analytics', 'guides', projectId, period],
    queryFn: () => getGuidesAnalytics(projectId!, period),
    enabled: !!projectId,
    staleTime: 60_000,
  });
