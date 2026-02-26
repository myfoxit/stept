/**
 * Spotlight / Unified Search API client.
 */

import { request } from '@/lib/apiClient';
import { apiClient } from '@/lib/apiClient';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MatchingStep {
  step_id: string;
  step_number: number;
  generated_title?: string;
  score: number;
}

export interface UnifiedSearchResult {
  type: 'workflow' | 'document';
  id: string;
  name: string;
  summary?: string | null;
  preview?: string;
  score: number;
  matching_steps?: MatchingStep[];
}

export interface UnifiedSearchResponse {
  query: string;
  results: UnifiedSearchResult[];
  total_results: number;
  search_type: 'keyword' | 'semantic';
}

export interface ConfirmActionResponse {
  status: string;
  result: Record<string, unknown>;
}

// ── API Functions ────────────────────────────────────────────────────────────

/** Unified hybrid search (RRF fusion of keyword + semantic) across workflows + documents */
export async function unifiedSearch(
  query: string,
  projectId: string,
  limit = 20,
  contextApp?: string,
  contextUrl?: string,
): Promise<UnifiedSearchResponse> {
  const params: Record<string, unknown> = { q: query, project_id: projectId, limit };
  if (contextApp) params.context_app = contextApp;
  if (contextUrl) params.context_url = contextUrl;
  return request<UnifiedSearchResponse>({
    method: 'GET',
    url: '/search/unified-v2',
    params,
  });
}

/** Legacy unified keyword search (fallback) */
export async function unifiedKeywordSearch(
  query: string,
  projectId: string,
  limit = 20,
): Promise<UnifiedSearchResponse> {
  return request<UnifiedSearchResponse>({
    method: 'GET',
    url: '/search/unified',
    params: { q: query, project_id: projectId, limit },
  });
}

/** Legacy unified semantic search */
export async function unifiedSemanticSearch(
  query: string,
  projectId: string,
  limit = 20,
): Promise<UnifiedSearchResponse> {
  return request<UnifiedSearchResponse>({
    method: 'GET',
    url: '/search/unified-semantic',
    params: { q: query, project_id: projectId, limit },
  });
}

/** Confirm an AI-suggested action */
export async function confirmAction(
  action: string,
  params: Record<string, unknown>,
  projectId?: string,
): Promise<ConfirmActionResponse> {
  const { data } = await apiClient.post<ConfirmActionResponse>('/chat/confirm-action', {
    action,
    params,
    project_id: projectId,
  });
  return data;
}
