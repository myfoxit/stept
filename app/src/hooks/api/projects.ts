

import { getUserRole, listProjects, createProject, deleteProject, updateProject, getProjectMembers, addProjectMember, removeProjectMember, updateMemberRole } from '@/api/projects';
import type { ApiError } from '@/lib/apiClient';
import  { queryKeys } from '@/lib/queryKeys';
import type { ProjectRead, ProjectCreate } from '@/types/openapi';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';


export const useProjectRole = (projectId: string, userId: string) => {
  return useQuery({
    queryKey: ['projectRole', projectId, userId],
    queryFn: async () => {
      if (!projectId || !userId) return null;
      const { role } = await getUserRole(projectId);
      return role as 'owner' | 'admin' | 'member' | 'viewer' | null;
    },
    enabled: !!projectId && !!userId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};


export const useProjects = (userId?: string) =>
  useQuery<ProjectRead[], ApiError>({
    queryKey: queryKeys.projects(userId || ''),
    queryFn: () => listProjects(userId || ''),
    enabled: !!userId,
  });
export const useCreateProject = () => {
  const qc = useQueryClient();
  return useMutation<ProjectRead, ApiError, ProjectCreate>({
    mutationFn: createProject,
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: queryKeys.projects(vars.user_id) }),
  });
};

export const useDeleteProject = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteProject,
    onSuccess: () =>
      // Invalidate all project queries since we don't know the user_id here
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'projects' }),
  });
};

export const useUpdateProject = () => {
  const qc = useQueryClient();
  return useMutation<
    ProjectRead,
    ApiError,
    { projectId: string; name?: string; ai_enabled?: boolean }
  >({
    mutationFn: ({ projectId, name, ai_enabled }) => updateProject(projectId, name, ai_enabled),
    onSuccess: () =>
      // Invalidate all project queries to ensure the updated data appears everywhere
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'projects' }),
  });
};

// Project Members
export const useProjectMembers = (projectId: string) =>
  useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: () => getProjectMembers(projectId),
    enabled: !!projectId,
  });

export const useAddProjectMember = () => {
  const qc = useQueryClient();
  return useMutation<
    { status: string },
    ApiError,
    { projectId: string; userId: string; role?: string }
  >({
    mutationFn: ({ projectId, userId, role }) =>
      addProjectMember(projectId, userId, role),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['projectMembers', projectId] });
      // Also invalidate projects in case we want to show member count
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'projects' });
    },
  });
};

export const useRemoveProjectMember = () => {
  const qc = useQueryClient();
  return useMutation<
    { status: string },
    ApiError,
    { projectId: string; userId: string }
  >({
    mutationFn: ({ projectId, userId }) =>
      removeProjectMember(projectId, userId),
    onSuccess: (_data, { projectId, userId }) => {
      qc.invalidateQueries({ queryKey: ['projectMembers', projectId] });
      // Invalidate the removed user's project list
      qc.invalidateQueries({ queryKey: queryKeys.projects(userId) });
    },
  });
};

export const useUpdateMemberRole = () => {
  const qc = useQueryClient();
  return useMutation<
    { status: string },
    ApiError,
    { projectId: string; userId: string; role: string }
  >({
    mutationFn: ({ projectId, userId, role }) =>
      updateMemberRole(projectId, userId, role),
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['projectMembers', projectId] });
    },
  });
};