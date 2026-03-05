import {
  listLinks,
  createLink,
  deleteLink,
  detectLinks,
  type KnowledgeLinkRead,
  type CreateLinkPayload,
} from '@/api/links';
import type { ApiError } from '@/lib/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const linkKeys = {
  links: (projectId: string, resourceType?: string, resourceId?: string) =>
    ['knowledgeLinks', projectId, resourceType, resourceId] as const,
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

export const useCreateLink = () => {
  const qc = useQueryClient();
  return useMutation<KnowledgeLinkRead, ApiError, CreateLinkPayload>({
    mutationFn: (payload) => createLink(payload),
    onSuccess: (_data, { project_id }) => {
      qc.invalidateQueries({ queryKey: ['knowledgeLinks', project_id] });
    },
  });
};

export const useDeleteLink = () => {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, ApiError, { linkId: string; projectId: string }>({
    mutationFn: ({ linkId, projectId }) => deleteLink(linkId, projectId),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['knowledgeLinks', projectId] });
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
    },
  });
};
