import {
  listLinks,
  createLink,
  deleteLink,
  detectLinks,
  getKnowledgeGraph,
  type KnowledgeLinkRead,
  type CreateLinkPayload,
  type KnowledgeGraph,
} from '@/api/links';
import type { ApiError } from '@/lib/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const linkKeys = {
  links: (projectId: string, resourceType?: string, resourceId?: string) =>
    ['knowledgeLinks', projectId, resourceType, resourceId] as const,
  graph: (projectId: string) => ['knowledgeGraph', projectId] as const,
};

export const useKnowledgeLinks = (
  projectId: string,
  resourceType?: string,
  resourceId?: string
) =>
  useQuery<KnowledgeLinkRead[]>({
    queryKey: linkKeys.links(projectId, resourceType, resourceId),
    queryFn: () => listLinks(projectId, resourceType, resourceId),
    enabled: !!projectId,
  });

export const useKnowledgeGraph = (projectId: string) =>
  useQuery<KnowledgeGraph>({
    queryKey: linkKeys.graph(projectId),
    queryFn: () => getKnowledgeGraph(projectId),
    enabled: !!projectId,
  });

export const useCreateLink = () => {
  const qc = useQueryClient();
  return useMutation<KnowledgeLinkRead, ApiError, CreateLinkPayload>({
    mutationFn: (payload) => createLink(payload),
    onSuccess: (_data, { project_id }) => {
      qc.invalidateQueries({ queryKey: ['knowledgeLinks', project_id] });
      qc.invalidateQueries({ queryKey: linkKeys.graph(project_id) });
    },
  });
};

export const useDeleteLink = () => {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, ApiError, { linkId: string; projectId: string }>({
    mutationFn: ({ linkId, projectId }) => deleteLink(linkId, projectId),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['knowledgeLinks', projectId] });
      qc.invalidateQueries({ queryKey: linkKeys.graph(projectId) });
    },
  });
};

export const useDetectLinks = () => {
  const qc = useQueryClient();
  return useMutation<
    any[],
    ApiError,
    { projectId: string; resourceType: string; resourceId: string; threshold?: number }
  >({
    mutationFn: ({ projectId, resourceType, resourceId, threshold }) =>
      detectLinks(projectId, resourceType, resourceId, threshold),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['knowledgeLinks', projectId] });
      qc.invalidateQueries({ queryKey: linkKeys.graph(projectId) });
    },
  });
};
