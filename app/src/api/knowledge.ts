// ────────────────────────────────────────────
// File: src/api/knowledge.ts
// ────────────────────────────────────────────
import { request } from '../lib/apiClient';

export interface KnowledgeSourceRead {
  id: string;
  name: string;
  source_type: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string | null;
  last_indexed_at: string | null;
}

export interface KnowledgeSourceDetail extends KnowledgeSourceRead {
  raw_content: string | null;
  processed_content: string | null;
  file_path: string | null;
  created_by: string | null;
}

/** Upload a file to the project knowledge base */
export const uploadKnowledgeSource = (file: File, projectId: string) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('project_id', projectId);
  return request<KnowledgeSourceRead>({
    method: 'POST',
    url: '/knowledge/upload',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/** List all knowledge sources for a project */
export const listKnowledgeSources = (projectId: string) =>
  request<KnowledgeSourceRead[]>({
    method: 'GET',
    url: '/knowledge/sources',
    params: { project_id: projectId },
  });

/** Get a single knowledge source */
export const getKnowledgeSource = (sourceId: string) =>
  request<KnowledgeSourceDetail>({
    method: 'GET',
    url: `/knowledge/sources/${sourceId}`,
  });

/** Delete a knowledge source */
export const deleteKnowledgeSource = (sourceId: string) =>
  request<{ deleted: boolean }>({
    method: 'DELETE',
    url: `/knowledge/sources/${sourceId}`,
  });

/** Re-extract and re-index a knowledge source */
export const reindexKnowledgeSource = (sourceId: string) =>
  request<{ reindexed: boolean; embeddings_created: number }>({
    method: 'POST',
    url: `/knowledge/reindex/${sourceId}`,
  });
