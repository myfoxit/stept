// ────────────────────────────────────────────
// File: src/api/context-links.ts
// ────────────────────────────────────────────
import { apiClient } from '@/lib/apiClient';

export type MatchType =
  | 'url_exact'
  | 'url_pattern'
  | 'url_regex'
  | 'app_name'
  | 'app_exact'
  | 'app_regex'
  | 'window_title'
  | 'window_regex';

export interface ContextLink {
  id: string;
  project_id: string;
  match_type: MatchType;
  match_value: string;
  resource_type: 'workflow' | 'document';
  resource_id: string;
  resource_name?: string;
  note?: string;
  priority: number;
  group_id?: string | null;
  created_at?: string;
}

export interface ContextMatch extends ContextLink {
  resource_name: string;
  resource_summary?: string;
}

export interface KnownApp {
  name: string;
  aliases: string[];
  bundle_id: string;
}

export async function listContextLinks(
  projectId: string,
  resourceType?: string,
  resourceId?: string,
): Promise<ContextLink[]> {
  const params = new URLSearchParams({ project_id: projectId });
  if (resourceType) params.set('resource_type', resourceType);
  if (resourceId) params.set('resource_id', resourceId);
  const { data } = await apiClient.get<ContextLink[]>(`/context-links?${params}`);
  return data;
}

export async function createContextLink(body: {
  project_id: string;
  match_type: string;
  match_value: string;
  resource_type: string;
  resource_id: string;
  note?: string;
  priority?: number;
  group_id?: string | null;
}): Promise<ContextLink> {
  const { data } = await apiClient.post<ContextLink>('/context-links', body);
  return data;
}

export async function updateContextLink(
  id: string,
  body: {
    match_type?: string;
    match_value?: string;
    resource_type?: string;
    resource_id?: string;
    note?: string;
    priority?: number;
    group_id?: string | null;
  },
): Promise<ContextLink> {
  const { data } = await apiClient.put<ContextLink>(`/context-links/${id}`, body);
  return data;
}

export async function deleteContextLink(id: string): Promise<void> {
  await apiClient.delete(`/context-links/${id}`);
}

export async function listKnownApps(): Promise<KnownApp[]> {
  const { data } = await apiClient.get<{ apps: KnownApp[] }>('/context-links/known-apps');
  return data.apps;
}
