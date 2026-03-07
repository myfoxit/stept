// ────────────────────────────────────────────
// File: src/api/projects.ts
// ────────────────────────────────────────────
import { request } from '../lib/apiClient';
import { type ProjectCreate, type ProjectRead } from '../types/openapi';

/** Projects */
export const listProjects = (userId: string) =>
  request<ProjectRead[]>({ method: 'GET', url: `/projects/${userId}` });
export const createProject = (body: ProjectCreate) =>
  request<ProjectRead, ProjectCreate>({
    method: 'POST',
    url: '/projects/',
    data: body,
  });

export const deleteProject = (projectId: string) =>
  request<void>({
    method: 'DELETE',
    url: `/projects/${projectId}`,
  });

export const updateProject = (projectId: string, name?: string, ai_enabled?: boolean) =>
  request<ProjectRead>({
    method: 'PUT',
    url: `/projects/${projectId}`,
    data: { ...(name !== undefined && { name }), ...(ai_enabled !== undefined && { ai_enabled }) },
  });

// Project Members
export const addProjectMember = (projectId: string, userId: string, role: string = 'member') =>
  request<{ status: string }>({
    method: 'POST',
    url: `/projects/${projectId}/members`,
    data: { user_id: userId, role },
  });

export const removeProjectMember = (projectId: string, userId: string) =>
  request<{ status: string }>({
    method: 'DELETE',
    url: `/projects/${projectId}/members/${userId}`,
  });

export const updateMemberRole = (projectId: string, userId: string, role: string) =>
  request<{ status: string }>({
    method: 'PUT',
    url: `/projects/${projectId}/members/${userId}`,
    data: { role },
  });

export const getProjectMembers = (projectId: string) =>
  request<Array<{
    user_id: string;
    role: string;
    joined_at: string;
    invited_by?: string;
  }>>({
    method: 'GET',
    url: `/projects/${projectId}/members`,
  });
export const getUserRole = (projectId: string) =>
  request<{ role: string | null }>({
    method: 'GET',
    url: `/projects/${projectId}/role`,
  });
