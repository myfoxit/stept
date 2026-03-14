import { request, getApiBaseUrl } from '../lib/apiClient';
import type { ProcessRecordingSession, WorkflowRead } from '@/types/openapi';

export const getWorkflow = (workflowId: string) =>
  request<ProcessRecordingSession>({
    method: 'GET',
    url: `/process-recording/session/${workflowId}/status`,
  });

export const listWorkflows = (limit = 20, offset = 0) =>
  request<ProcessRecordingSession[]>({
    method: 'GET',
    url: `/process-recording/sessions?limit=${limit}&offset=${offset}`,
  });

export const getWorkflowImage = (workflowId: string, stepNumber: number) => {
  const apiBaseUrl = getApiBaseUrl();
  // Add cache-busting timestamp to force reload
  const timestamp = Date.now();
  return `${apiBaseUrl}/process-recording/session/${workflowId}/image/${stepNumber}?t=${timestamp}`;
};

export const updateWorkflow = (
  workflowId: string,
  payload: {
    name?: string;
    folder_id?: string | null;
    // NEW: icon fields
    icon_type?: 'tabler' | 'favicon';
    icon_value?: string;
    icon_color?: string;
    is_private?: boolean;
  }
) =>
  request<WorkflowRead>({
    method: 'PUT',
    url: `/process-recording/workflow/${workflowId}`,
    data: payload,
  });

// Make signature explicit so hooks know this expects folder_id
export const moveWorkflow = (
  workflowId: string,
  payload: { folder_id: string | null; position?: number }
) =>
  request<WorkflowRead>({
    method: 'PUT',
    url: `/process-recording/workflow/${workflowId}/move`,
    data: payload,
  });

export const deleteWorkflow = (workflowId: string) =>
  request<void>({
    method: 'DELETE',
    url: `/process-recording/workflow/${workflowId}`,
  });

export const duplicateWorkflow = (workflowId: string) =>
  request<WorkflowRead>({
    method: 'POST',
    url: `/process-recording/workflow/${workflowId}/duplicate`,
  });

export interface StepCreate {
  step_type: 'screenshot' | 'tip' | 'alert' | 'header' | 'text' | 'gif' | 'video' | 'capture';
  description?: string;
  content?: string;
  window_title?: string;
}

export interface StepUpdate {
  description?: string;
  content?: string;
  window_title?: string;
}

export interface StepReorder {
  step_number: number;
  new_position: number;
}

export const createStep = (
  workflowId: string,
  position: number,
  data: StepCreate
) =>
  request({
    method: 'POST',
    url: `/process-recording/session/${workflowId}/steps?position=${position}`,
    data,
  });

export const updateStep = (
  workflowId: string,
  stepNumber: number,
  data: StepUpdate
) =>
  request({
    method: 'PUT',
    url: `/process-recording/session/${workflowId}/steps/${stepNumber}`,
    data,
  });

export const deleteStep = (workflowId: string, stepNumber: number) =>
  request({
    method: 'DELETE',
    url: `/process-recording/session/${workflowId}/steps/${stepNumber}`,
  });

export const reorderSteps = (
  workflowId: string,
  reorders: StepReorder[]
) =>
  request({
    method: 'POST',
    url: `/process-recording/session/${workflowId}/steps/reorder`,
    data: { reorders },
  });

export async function uploadStepImage(
  workflowId: string,
  stepNumber: number,
  file: File,
  replace: boolean = false 
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('stepNumber', stepNumber.toString());
  formData.append('replace', replace.toString()); 

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('Uploading image:', {
      workflowId,
      stepNumber,
      replace,
      fileName: file.name,
    });
  }

  // Get the base URL using shared function
  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/process-recording/session/${workflowId}/image`;

  // Make a direct fetch call for FormData uploads
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type - browser will set it with boundary
    credentials: 'include', // Include cookies if needed
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Upload failed with status:', response.status, errorText);

    // Parse error detail if it's JSON
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(errorJson.detail || errorText);
    } catch {
      throw new Error(errorText);
    }
  }

  return response.json();
}

export const getFilteredWorkflows = (
  projectId?: string,
  folderId?: string,
  sortBy: 'created_at' | 'updated_at' | 'name' = 'created_at',
  sortOrder: 'asc' | 'desc' = 'desc',
  skip = 0,
  limit = 100
) => {
  return request<ProcessRecordingSession[]>({
    method: 'GET',
    url: '/process-recording/workflows/filtered',
    params: {
      ...(projectId ? { project_id: projectId } : {}),
      folder_id: folderId,
      sort_by: sortBy,
      sort_order: sortOrder,
      skip,
      limit,
    },
  });
};

// ──────────────────────────────────────────────────────────────────────────────
// EXPORT FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

export type ExportFormat = 'pdf' | 'html' | 'markdown' | 'docx';

export const getExportUrl = (workflowId: string, format: ExportFormat): string => {
  const apiBaseUrl = getApiBaseUrl();
  return `${apiBaseUrl}/process-recording/workflow/${workflowId}/export/${format}`;
};

export const exportWorkflow = async (
  workflowId: string,
  format: ExportFormat,
  options?: { embedImages?: boolean; includeImages?: boolean; lang?: string }
): Promise<void> => {
  const apiBaseUrl = getApiBaseUrl();
  let url = `${apiBaseUrl}/process-recording/workflow/${workflowId}/export/${format}`;
  
  // Add query params for options
  const params = new URLSearchParams();
  if (options?.embedImages !== undefined) {
    params.append('embed_images', options.embedImages.toString());
  }
  if (options?.includeImages !== undefined) {
    params.append('include_images', options.includeImages.toString());
  }
  if (options?.lang && options.lang !== 'original') {
    params.append('lang', options.lang);
  }
  if (params.toString()) {
    url += `?${params.toString()}`;
  }
  
  // Trigger download
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Export failed');
  }
  
  // Get filename from Content-Disposition header
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `workflow.${format}`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="(.+)"/);
    if (match) {
      filename = match[1];
    }
  }
  
  // Create blob and trigger download
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
};






// ──────────────────────────────────────────────────────────────────────────────
// TRASH / SOFT DELETE
// ──────────────────────────────────────────────────────────────────────────────

/** Get all soft-deleted workflows for a project */
export const getDeletedWorkflows = (projectId: string) =>
  request<ProcessRecordingSession[]>({
    method: 'GET',
    url: `/process-recording/workflows/trash/${projectId}`,
  });

/** Restore a soft-deleted workflow */
export const restoreWorkflow = (workflowId: string) =>
  request<ProcessRecordingSession>({
    method: 'POST',
    url: `/process-recording/workflows/${workflowId}/restore`,
  });

/** Permanently delete a workflow (no recovery) */
export const permanentDeleteWorkflow = (workflowId: string) =>
  request<void>({
    method: 'DELETE',
    url: `/process-recording/workflows/${workflowId}/permanent`,
  });

// ──────────────────────────────────────────────────────────────────────────────
// VERSION HISTORY
// ──────────────────────────────────────────────────────────────────────────────

export interface WorkflowVersionRead {
  id: string;
  version_number: number;
  name: string | null;
  total_steps: number | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  change_summary: string | null;
  steps_snapshot?: any[];
}

export const listWorkflowVersions = (workflowId: string, limit = 50) =>
  request<WorkflowVersionRead[]>({
    method: 'GET',
    url: `/process-recording/workflow/${workflowId}/versions`,
    params: { limit },
  });

export const getWorkflowVersion = (workflowId: string, versionId: string) =>
  request<WorkflowVersionRead>({
    method: 'GET',
    url: `/process-recording/workflow/${workflowId}/versions/${versionId}`,
  });

export const restoreWorkflowVersion = (workflowId: string, versionId: string) =>
  request<any>({
    method: 'POST',
    url: `/process-recording/workflow/${workflowId}/versions/${versionId}/restore`,
  });
