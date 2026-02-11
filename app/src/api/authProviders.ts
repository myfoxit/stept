/**
 * Auth providers API client — OAuth / device-flow login for LLM providers.
 */

import { apiClient } from '@/lib/apiClient';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DeviceFlowStart {
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}

export interface DeviceFlowPoll {
  status: 'pending' | 'success' | 'expired' | 'error';
  message?: string;
  interval?: number;
}

export interface ProviderStatus {
  provider: string;
  connected: boolean;
}

export interface ProvidersStatus {
  providers: ProviderStatus[];
}

// ── Copilot endpoints ────────────────────────────────────────────────────────

export async function startCopilotDeviceFlow(): Promise<DeviceFlowStart> {
  const { data } = await apiClient.post<DeviceFlowStart>('/auth/providers/copilot/start');
  return data;
}

export async function pollCopilotDeviceFlow(): Promise<DeviceFlowPoll> {
  const { data } = await apiClient.post<DeviceFlowPoll>('/auth/providers/copilot/poll');
  return data;
}

export async function disconnectCopilot(): Promise<void> {
  await apiClient.post('/auth/providers/copilot/disconnect');
}

// ── Provider status ──────────────────────────────────────────────────────────

export async function fetchProvidersStatus(): Promise<ProvidersStatus> {
  const { data } = await apiClient.get<ProvidersStatus>('/auth/providers/status');
  return data;
}
