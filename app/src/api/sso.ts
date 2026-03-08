import { request } from '@/lib/apiClient';

export interface SsoConfigRead {
  id: string;
  domain: string;
  provider_name: string;
  issuer_url: string;
  client_id: string;
  enabled: boolean;
  auto_create_users: boolean;
  created_at: string;
  updated_at: string;
}

export interface SsoConfigCreate {
  domain: string;
  provider_name: string;
  issuer_url: string;
  client_id: string;
  client_secret: string;
  enabled: boolean;
  auto_create_users: boolean;
}

export interface SsoConfigUpdate {
  domain?: string;
  provider_name?: string;
  issuer_url?: string;
  client_id?: string;
  client_secret?: string;
  enabled?: boolean;
  auto_create_users?: boolean;
}

export interface SsoTestResult {
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
}

const withCred = { withCredentials: true } as const;

export const listSsoConfigs = () =>
  request<SsoConfigRead[]>({
    method: 'GET',
    url: '/sso/configs',
    ...withCred,
  });

export const createSsoConfig = (data: SsoConfigCreate) =>
  request<SsoConfigRead, SsoConfigCreate>({
    method: 'POST',
    url: '/sso/configs',
    data,
    ...withCred,
  });

export const updateSsoConfig = (id: string, data: SsoConfigUpdate) =>
  request<SsoConfigRead, SsoConfigUpdate>({
    method: 'PUT',
    url: `/sso/configs/${id}`,
    data,
    ...withCred,
  });

export const deleteSsoConfig = (id: string) =>
  request<void>({
    method: 'DELETE',
    url: `/sso/configs/${id}`,
    ...withCred,
  });

export const testSsoConfig = (id: string) =>
  request<SsoTestResult>({
    method: 'POST',
    url: `/sso/configs/${id}/test`,
    ...withCred,
  });
