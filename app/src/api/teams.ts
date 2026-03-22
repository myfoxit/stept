/**
 * Microsoft Teams integration API functions
 */
import { apiClient } from '@/lib/apiClient';

export interface TeamsConfig {
  enabled: boolean;
  default_project_id?: string;
  channel_project_map?: Record<string, string>;
  connected: boolean;
}

export interface TeamsConfigInput {
  app_id?: string;
  app_password?: string;
  webhook_url?: string;
  default_project_id?: string;
  channel_project_map?: Record<string, string>;
  enabled: boolean;
}

export interface TeamsTestRequest {
  conversation_id: string;
}

export interface TeamsTestResponse {
  status: string;
  message: string;
}

/**
 * Get Teams configuration for a project
 */
export async function getTeamsConfig(projectId: string): Promise<TeamsConfig> {
  const response = await apiClient.get<TeamsConfig>(`/integrations/teams/config`, {
    params: { project_id: projectId },
  });
  return response.data;
}

/**
 * Update Teams configuration for a project
 */
export async function updateTeamsConfig(
  projectId: string,
  config: TeamsConfigInput
): Promise<{ status: string }> {
  const response = await apiClient.put(`/integrations/teams/config`, config, {
    params: { project_id: projectId },
  });
  return response.data;
}

/**
 * Disconnect Teams integration for a project
 */
export async function disconnectTeams(projectId: string): Promise<{ status: string }> {
  const response = await apiClient.delete(`/integrations/teams/config`, {
    params: { project_id: projectId },
  });
  return response.data;
}

/**
 * Test Teams connection by sending a test card
 */
export async function testTeamsConnection(
  projectId: string,
  testRequest: TeamsTestRequest
): Promise<TeamsTestResponse> {
  const response = await apiClient.post<TeamsTestResponse>(
    `/integrations/teams/test`,
    testRequest,
    {
      params: { project_id: projectId },
    }
  );
  return response.data;
}