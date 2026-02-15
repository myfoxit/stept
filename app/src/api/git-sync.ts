import { request } from '../lib/apiClient';

export interface GitSyncConfig {
  id: string;
  project_id: string;
  provider: 'github' | 'gitlab' | 'bitbucket';
  repo_url: string;
  branch: string;
  directory: string;
  access_token_masked: string;
  sync_format: 'markdown' | 'html';
  auto_sync: boolean;
  last_sync_at: string | null;
  last_sync_status: 'success' | 'error' | 'in_progress' | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface GitSyncConfigInput {
  provider: 'github' | 'gitlab' | 'bitbucket';
  repo_url: string;
  branch: string;
  directory: string;
  access_token: string;
  sync_format: 'markdown' | 'html';
  auto_sync: boolean;
}

export interface GitSyncStatus {
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

export const getGitSyncConfig = (projectId: string) =>
  request<GitSyncConfig>({ method: 'GET', url: `/git-sync/${projectId}` });

export const upsertGitSyncConfig = (projectId: string, data: GitSyncConfigInput) =>
  request<GitSyncConfig>({ method: 'PUT', url: `/git-sync/${projectId}`, data });

export const deleteGitSyncConfig = (projectId: string) =>
  request<void>({ method: 'DELETE', url: `/git-sync/${projectId}` });

export const pushToGit = (projectId: string) =>
  request<{ status: string; pushed: number }>({ method: 'POST', url: `/git-sync/${projectId}/push` });

export const pullFromGit = (projectId: string) =>
  request<{ status: string; updated: number; created: number }>({ method: 'POST', url: `/git-sync/${projectId}/pull` });

export const getGitSyncStatus = (projectId: string) =>
  request<GitSyncStatus>({ method: 'GET', url: `/git-sync/${projectId}/status` });

export const testGitConnection = (projectId: string, data: GitSyncConfigInput) =>
  request<{ status: string }>({ method: 'POST', url: `/git-sync/${projectId}/test`, data });
