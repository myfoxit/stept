/**
 * Slack integration API functions
 */
import { apiClient } from '@/lib/apiClient';

export interface SlackConfig {
  enabled: boolean;
  default_project_id?: string;
  channel_project_map?: Record<string, string>;
  connected: boolean;
}

export interface SlackConfigInput {
  bot_token: string;
  signing_secret: string;
  default_project_id?: string;
  channel_project_map?: Record<string, string>;
  enabled: boolean;
}

export interface SlackTestRequest {
  channel: string;
}

export interface SlackTestResponse {
  status: string;
  message: string;
}

/**
 * Get Slack configuration for a project
 */
export async function getSlackConfig(projectId: string): Promise<SlackConfig> {
  const response = await apiClient.get<SlackConfig>(`/integrations/slack/config`, {
    params: { project_id: projectId },
  });
  return response.data;
}

/**
 * Update Slack configuration for a project
 */
export async function updateSlackConfig(
  projectId: string,
  config: SlackConfigInput
): Promise<{ status: string }> {
  const response = await apiClient.put(`/integrations/slack/config`, config, {
    params: { project_id: projectId },
  });
  return response.data;
}

/**
 * Disconnect Slack integration for a project
 */
export async function disconnectSlack(projectId: string): Promise<{ status: string }> {
  const response = await apiClient.delete(`/integrations/slack/config`, {
    params: { project_id: projectId },
  });
  return response.data;
}

/**
 * Test Slack connection by sending a test message
 */
export async function testSlackConnection(
  projectId: string,
  testRequest: SlackTestRequest
): Promise<SlackTestResponse> {
  const response = await apiClient.post<SlackTestResponse>(
    `/integrations/slack/test`,
    testRequest,
    {
      params: { project_id: projectId },
    }
  );
  return response.data;
}