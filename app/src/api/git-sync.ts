import { request } from '../lib/apiClient';

export interface GitSyncConfig {
  id: string;
  project_id: string;
  provider: 'github' | 'gitlab' | 'bitbucket';
  repo_url: string;
  branch: string;
  directory: string;
  access_token_masked: string;
  last_sync_at: string | null;
  last_sync_status: 'success' | 'error' | 'in_progress' | null;
  last_sync_error: string | null;
}

export interface GitSyncConfigInput {
  provider: 'github' | 'gitlab' | 'bitbucket';
  repo_url: string;
  branch: string;
  directory: string;
  access_token: string;
}

export const getGitSyncConfig = (projectId: string) =>
  request<GitSyncConfig>({ method: 'GET', url: `/git-sync/${projectId}` });

export const upsertGitSyncConfig = (projectId: string, data: GitSyncConfigInput) =>
  request<GitSyncConfig>({ method: 'PUT', url: `/git-sync/${projectId}`, data });

export const deleteGitSyncConfig = (projectId: string) =>
  request<void>({ method: 'DELETE', url: `/git-sync/${projectId}` });

export const exportToGit = (projectId: string) =>
  request<{ status: string; exported: number }>({ method: 'POST', url: `/git-sync/${projectId}/export` });

export const testGitConnection = (projectId: string, data: GitSyncConfigInput) =>
  request<{ status: string }>({ method: 'POST', url: `/git-sync/${projectId}/test`, data });
