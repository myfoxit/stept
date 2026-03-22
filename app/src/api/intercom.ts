/**
 * Intercom integration API functions
 */
import { apiClient } from '@/lib/apiClient';

export interface IntercomConfig {
  enabled: boolean;
  sync_enabled: boolean;
  webhook_enabled: boolean;
  project_id: string;
  region: string; // "us" | "eu" | "au"
  content_source_id?: string;
  last_synced_at?: string;
  sync_stats?: {
    workflows_synced: number;
    documents_synced: number;
    errors: string[];
    last_sync: string;
  };
  connected: boolean;
}

export interface IntercomConfigInput {
  access_token: string;
  client_secret: string;
  project_id: string;
  region: string;
  sync_enabled: boolean;
  webhook_enabled: boolean;
}

export interface IntercomTestRequest {
  test_type?: string; // "connection" | "content_sync"
}

export interface IntercomTestResponse {
  status: string;
  message: string;
  source_id?: string;
  app_name?: string;
  app_id?: string;
}

export interface IntercomSyncRequest {
  force?: boolean;
}

export interface IntercomSyncResponse {
  status: string;
  message: string;
}

export interface IntercomSyncStatus {
  status: string; // "not_configured" | "configured" | "disabled"
  last_synced_at?: string;
  content_source_id?: string;
  stats?: {
    workflows_synced: number;
    documents_synced: number;
    errors: string[];
    last_sync: string;
  };
}

/**
 * Get Intercom configuration for a project
 */
export async function getIntercomConfig(projectId: string): Promise<IntercomConfig> {
  const response = await apiClient.get<IntercomConfig>(`/integrations/intercom/config`, {
    params: { project_id: projectId },
  });
  return response.data;
}

/**
 * Update Intercom configuration for a project
 */
export async function updateIntercomConfig(
  projectId: string,
  config: IntercomConfigInput
): Promise<{ status: string }> {
  const response = await apiClient.put(`/integrations/intercom/config`, config, {
    params: { project_id: projectId },
  });
  return response.data;
}

/**
 * Disconnect Intercom integration for a project
 */
export async function disconnectIntercom(projectId: string): Promise<{ status: string }> {
  const response = await apiClient.delete(`/integrations/intercom/config`, {
    params: { project_id: projectId },
  });
  return response.data;
}

/**
 * Test Intercom connection
 */
export async function testIntercomConnection(
  projectId: string,
  testRequest: IntercomTestRequest = {}
): Promise<IntercomTestResponse> {
  const response = await apiClient.post<IntercomTestResponse>(
    `/integrations/intercom/test`,
    testRequest,
    {
      params: { project_id: projectId },
    }
  );
  return response.data;
}

/**
 * Trigger content sync to Intercom
 */
export async function triggerIntercomSync(
  projectId: string,
  syncRequest: IntercomSyncRequest = {}
): Promise<IntercomSyncResponse> {
  const response = await apiClient.post<IntercomSyncResponse>(
    `/integrations/intercom/sync`,
    syncRequest,
    {
      params: { project_id: projectId },
    }
  );
  return response.data;
}

/**
 * Get content sync status
 */
export async function getIntercomSyncStatus(projectId: string): Promise<IntercomSyncStatus> {
  const response = await apiClient.get<IntercomSyncStatus>(`/integrations/intercom/sync/status`, {
    params: { project_id: projectId },
  });
  return response.data;
}

/**
 * Sync a single resource to Intercom
 */
export async function syncIntercomResource(
  projectId: string,
  resourceType: 'workflow' | 'document',
  resourceId: string
): Promise<IntercomSyncResponse> {
  const response = await apiClient.post<IntercomSyncResponse>(
    `/integrations/intercom/sync/${resourceType}/${resourceId}`,
    {},
    {
      params: { project_id: projectId },
    }
  );
  return response.data;
}