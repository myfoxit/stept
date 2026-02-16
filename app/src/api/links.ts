// ────────────────────────────────────────────
// File: src/api/links.ts
// ────────────────────────────────────────────
import { request } from '../lib/apiClient';

export interface KnowledgeLinkRead {
  id: string;
  project_id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  link_type: string | null;
  confidence: number | null;
  auto_detected: boolean;
  created_by: string | null;
  created_at: string | null;
}

export interface CreateLinkPayload {
  project_id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  link_type?: string;
}

export interface KnowledgeGraph {
  nodes: Array<{ id: string; type: string; resource_id: string }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    link_type: string | null;
    confidence: number | null;
    auto_detected: boolean;
  }>;
}

/** List links for a project */
export const listLinks = (projectId: string, resourceType?: string, resourceId?: string) =>
  request<KnowledgeLinkRead[]>({
    method: 'GET',
    url: '/links',
    params: { project_id: projectId, resource_type: resourceType, resource_id: resourceId },
  });

/** Create a manual knowledge link */
export const createLink = (payload: CreateLinkPayload) =>
  request<KnowledgeLinkRead>({
    method: 'POST',
    url: '/links',
    data: payload,
  });

/** Delete a knowledge link */
export const deleteLink = (linkId: string, projectId: string) =>
  request<{ ok: boolean }>({
    method: 'DELETE',
    url: `/links/${linkId}`,
    params: { project_id: projectId },
  });

/** Detect related content */
export const detectLinks = (
  projectId: string,
  resourceType: string,
  resourceId: string,
  threshold = 0.8
) =>
  request<any[]>({
    method: 'POST',
    url: '/links/detect',
    params: { project_id: projectId, resource_type: resourceType, resource_id: resourceId, threshold },
  });

/** Get the full knowledge graph */
export const getKnowledgeGraph = (projectId: string) =>
  request<KnowledgeGraph>({
    method: 'GET',
    url: '/links/graph',
    params: { project_id: projectId },
  });
