/**
 * Semantic Search API client — RAG-powered search across workflows.
 */

import { request } from '@/lib/apiClient';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SemanticSearchResult {
  type: 'recording';
  recording_id: string;
  name: string;
  generated_title: string | null;
  summary: string | null;
  tags: string[] | null;
  is_processed: boolean;
  score: number;
  matching_steps: Array<{
    step_id: string;
    step_number: number;
    score: number;
  }>;
}

export interface SemanticSearchResponse {
  query: string;
  search_type: 'semantic' | 'keyword';
  total_results: number;
  results: SemanticSearchResult[];
}

export interface ReindexResponse {
  status: string;
  embeddings_created: number;
  message: string;
}

// ── API Functions ────────────────────────────────────────────────────────────

/** Semantic search across all user workflows */
export async function semanticSearch(
  query: string,
  projectId?: string,
  limit = 10,
): Promise<SemanticSearchResponse> {
  const params: Record<string, string | number> = { q: query, limit };
  if (projectId) params.project_id = projectId;

  return request<SemanticSearchResponse>({
    method: 'GET',
    url: '/search/semantic',
    params,
  });
}

/** Trigger bulk reindexing of embeddings */
export async function reindexEmbeddings(
  projectId?: string,
): Promise<ReindexResponse> {
  const params: Record<string, string> = {};
  if (projectId) params.project_id = projectId;

  return request<ReindexResponse>({
    method: 'POST',
    url: '/search/reindex',
    params,
  });
}
