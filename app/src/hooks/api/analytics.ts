import {
  getTopAccessed,
  getAccessByChannel,
  getStaleResources,
  getQueryLog,
  getKnowledgeGaps,
} from '@/api/analytics';
import { useQuery } from '@tanstack/react-query';

const analyticsKeys = {
  topAccessed: (projectId: string, days?: number) =>
    ['analyticsTopAccessed', projectId, days] as const,
  accessByChannel: (projectId: string) =>
    ['analyticsAccessByChannel', projectId] as const,
  stale: (projectId: string) => ['analyticsStale', projectId] as const,
  queryLog: (projectId: string) => ['analyticsQueryLog', projectId] as const,
  gaps: (projectId: string) => ['analyticsGaps', projectId] as const,
};

export const useTopAccessed = (projectId: string, days = 30) =>
  useQuery({
    queryKey: analyticsKeys.topAccessed(projectId, days),
    queryFn: () => getTopAccessed(projectId, days),
    enabled: !!projectId,
  });

export const useAccessByChannel = (projectId: string) =>
  useQuery({
    queryKey: analyticsKeys.accessByChannel(projectId),
    queryFn: () => getAccessByChannel(projectId),
    enabled: !!projectId,
  });

export const useStaleResources = (projectId: string) =>
  useQuery({
    queryKey: analyticsKeys.stale(projectId),
    queryFn: () => getStaleResources(projectId),
    enabled: !!projectId,
  });

export const useQueryLog = (projectId: string) =>
  useQuery({
    queryKey: analyticsKeys.queryLog(projectId),
    queryFn: () => getQueryLog(projectId),
    enabled: !!projectId,
  });

export const useKnowledgeGaps = (projectId: string) =>
  useQuery({
    queryKey: analyticsKeys.gaps(projectId),
    queryFn: () => getKnowledgeGaps(projectId),
    enabled: !!projectId,
  });
