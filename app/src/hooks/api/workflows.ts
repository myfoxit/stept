import { 
  createStep, 
  updateStep, 
  deleteStep, 
  reorderSteps,
  uploadStepImage,
  getFilteredWorkflows,  // NEW import
  type StepCreate,
  type StepUpdate,
  type StepReorder
} from '@/api/workflows';
import { getWorkflow, listWorkflows, updateWorkflow, moveWorkflow, deleteWorkflow, duplicateWorkflow } from '@/api/workflows';
import type { ProcessRecordingSession, WorkflowRead } from '@/types/openapi';
import { apiClient, type ApiError } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

// RENAMED + STYLE: useProcessRecordingSession -> useWorkflow
export const useWorkflow = (workflowId: string) =>
  useQuery<ProcessRecordingSession, ApiError>({
    queryKey: ['workflow', workflowId],
    // when you add a dedicated queryKeys.workflow(workflowId), use it here
    queryFn: () => getWorkflow(workflowId),
    enabled: !!workflowId,
  });

// RENAMED + STYLE: useProcessRecordingSessions -> useWorkflows
export const useWorkflows = (limit = 20, offset = 0) =>
  useQuery<ProcessRecordingSession[], ApiError>({
    queryKey: ['workflows', limit, offset],
    // or queryKeys.workflows(limit, offset) once defined
    queryFn: () => listWorkflows(limit, offset),
  });

// NEW: Hook for filtered workflows
export const useFilteredWorkflows = (
  projectId?: string,
  folderId?: string,
  sortBy: 'created_at' | 'updated_at' | 'name' = 'created_at',
  sortOrder: 'asc' | 'desc' = 'desc'
) =>
  useQuery<ProcessRecordingSession[], ApiError>({
    queryKey: ['workflows', 'filtered', projectId, folderId, sortBy, sortOrder],
    queryFn: () => getFilteredWorkflows(projectId, folderId, sortBy, sortOrder),
  });

// Update workflow
export const useUpdateWorkflow = () => {
  const qc = useQueryClient();
  return useMutation<
    WorkflowRead,
    ApiError,
    {
      workflowId: string;
      name?: string;
      folder_id?: string | null;
      // NEW: icon fields
      icon_type?: 'tabler' | 'favicon';
      icon_value?: string;
      icon_color?: string;
      is_private?: boolean; // NEW
    }
  >({
    mutationFn: async ({ workflowId, name, folder_id, icon_type, icon_value, icon_color, is_private }) =>
      updateWorkflow(workflowId, { name, folder_id, icon_type, icon_value, icon_color, is_private }),
    onSuccess: (_data, { workflowId }) => {
      qc.invalidateQueries({ queryKey: ['workflow', workflowId] });
      // NEW: invalidate all folderTree queries (any project)
      qc.invalidateQueries({ queryKey: ['folderTree'], exact: false, refetchType: 'active' });
    },
  });
};

// Move workflow
export const useMoveWorkflow = () => {
  const qc = useQueryClient();
  return useMutation<
    any,
    ApiError,
    {
      workflowId: string;
      parentId: string | null;
      position?: number;
      projectId: string;
      isPrivate?: boolean;
    }
  >({
    mutationFn: async ({ workflowId, parentId, position, isPrivate }) => {
      const { data } = await apiClient.put(`/process-recording/workflow/${workflowId}/move`, {
        folder_id: parentId,
        position,
        is_private: isPrivate,
      });
      return data;
    },
    onSuccess: (_data, { projectId }) => {
      // Invalidate both shared and private trees
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, false] });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, true] });
    },
  });
};

// Delete workflow
export const useDeleteWorkflow = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { workflowId: string; projectId: string }>(
    {
      mutationFn: async ({ workflowId }) => {
        await apiClient.delete(`/process-recording/workflow/${workflowId}`);
      },
      onSuccess: (_data, { projectId }) => {
        // Invalidate both shared and private trees
        qc.invalidateQueries({ queryKey: ['folderTree', projectId, false] });
        qc.invalidateQueries({ queryKey: ['folderTree', projectId, true] });
      },
    }
  );
};

// Duplicate workflow
export const useDuplicateWorkflow = () => {
  const qc = useQueryClient();
  return useMutation<any, ApiError, { workflowId: string; projectId: string }>(
    {
      mutationFn: async ({ workflowId }) => {
        const { data } = await apiClient.post(`/process-recording/workflow/${workflowId}/duplicate`);
        return data;
      },
      onSuccess: (_data, { projectId }) => {
        // Invalidate both shared and private trees
        qc.invalidateQueries({ queryKey: ['folderTree', projectId, false] });
        qc.invalidateQueries({ queryKey: ['folderTree', projectId, true] });
      },
    }
  );
};

// Create step
export const useCreateStep = () => {
  const qc = useQueryClient();
  return useMutation<
    any,
    ApiError,
    { workflowId: string; position: number; data: StepCreate }
  >({
    mutationFn: async ({ workflowId, position, data }) =>
      createStep(workflowId, position, data),
    onSuccess: (_data, { workflowId }) => {
      qc.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });
};

// Update step
export const useUpdateStep = () => {
  const qc = useQueryClient();
  return useMutation<
    any,
    ApiError,
    { workflowId: string; stepNumber: number; data: StepUpdate }
  >({
    mutationFn: async ({ workflowId, stepNumber, data }) =>
      updateStep(workflowId, stepNumber, data), // Fixed typo
    onSuccess: (_data, { workflowId }) => {
      qc.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });
};

// Delete step
export const useDeleteStep = () => {
  const qc = useQueryClient();
  return useMutation<
    any,
    ApiError,
    { workflowId: string; stepNumber: number }
  >({
    mutationFn: async ({ workflowId, stepNumber }) =>
      deleteStep(workflowId, stepNumber), // Fixed typo
    onSuccess: (_data, { workflowId }) => {
      qc.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });
};

// Reorder steps
export const useReorderSteps = () => {
  const qc = useQueryClient();
  return useMutation<
    any,
    ApiError,
    { workflowId: string; reorders: StepReorder[] }
  >({
    mutationFn: async ({ workflowId, reorders }) =>
      reorderSteps(workflowId, reorders), // Fixed typo
    onSuccess: (_data, { workflowId }) => {
      qc.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });
};

// Upload step image
export const useUploadStepImage = () => {
  const qc = useQueryClient();
  return useMutation<
    any,
    ApiError,
    { workflowId: string; stepNumber: number; file: File; replace?: boolean }
  >({
    mutationFn: async ({ workflowId, stepNumber, file, replace = false }) =>
      uploadStepImage(workflowId, stepNumber, file, replace), // Fixed typo
    onSuccess: (_data, { workflowId }) => {
      qc.invalidateQueries({ queryKey: ['workflow', workflowId] });
      qc.refetchQueries({ queryKey: ['workflow', workflowId] });
    },
  });
};