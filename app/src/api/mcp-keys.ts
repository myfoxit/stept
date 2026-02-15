import { apiClient } from '@/lib/apiClient';

export interface McpApiKey {
  id: string;
  project_id: string;
  name: string;
  key_prefix: string;
  created_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
}

export interface McpApiKeyCreated extends McpApiKey {
  raw_key: string;
}

export async function listMcpKeys(projectId: string): Promise<McpApiKey[]> {
  const { data } = await apiClient.get<McpApiKey[]>(`/projects/${projectId}/mcp-keys`);
  return data;
}

export async function createMcpKey(projectId: string, name: string): Promise<McpApiKeyCreated> {
  const { data } = await apiClient.post<McpApiKeyCreated>(`/projects/${projectId}/mcp-keys`, { name });
  return data;
}

export async function revokeMcpKey(projectId: string, keyId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/mcp-keys/${keyId}`);
}
