import {
  listKnowledgeSources,
  getKnowledgeSource,
  uploadKnowledgeSource,
  deleteKnowledgeSource,
  reindexKnowledgeSource,
} from '@/api/knowledge';
import type { ApiError } from '@/lib/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const knowledgeKeys = {
  sources: (projectId: string) => ['knowledgeSources', projectId] as const,
  source: (id: string) => ['knowledgeSource', id] as const,
};

export const useKnowledgeSources = (projectId: string) =>
  useQuery({
    queryKey: knowledgeKeys.sources(projectId),
    queryFn: () => listKnowledgeSources(projectId),
    enabled: !!projectId,
  });

export const useKnowledgeSource = (id: string) =>
  useQuery({
    queryKey: knowledgeKeys.source(id),
    queryFn: () => getKnowledgeSource(id),
    enabled: !!id,
  });

export const useUploadKnowledgeSource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, projectId }: { file: File; projectId: string }) =>
      uploadKnowledgeSource(file, projectId),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.sources(projectId) });
    },
  });
};

export const useDeleteKnowledgeSource = () => {
  const qc = useQueryClient();
  return useMutation<{ deleted: boolean }, ApiError, { sourceId: string; projectId: string }>({
    mutationFn: ({ sourceId }) => deleteKnowledgeSource(sourceId),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.sources(projectId) });
    },
  });
};

export const useReindexKnowledgeSource = () => {
  const qc = useQueryClient();
  return useMutation<
    { reindexed: boolean; embeddings_created: number },
    ApiError,
    { sourceId: string; projectId: string }
  >({
    mutationFn: ({ sourceId }) => reindexKnowledgeSource(sourceId),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.sources(projectId) });
    },
  });
};
