import { apiClient } from '@/lib/apiClient';

export interface Comment {
  id: string;
  project_id: string;
  user_id: string;
  resource_type: 'document' | 'workflow';
  resource_id: string;
  parent_id: string | null;
  content: string;
  resolved: boolean;
  created_at: string;
  updated_at: string;
  user_display_name: string;
  user_email: string;
}

export async function listComments(
  projectId: string,
  resourceType: string,
  resourceId: string,
): Promise<Comment[]> {
  const params = new URLSearchParams({
    project_id: projectId,
    resource_type: resourceType,
    resource_id: resourceId,
  });
  const { data } = await apiClient.get<Comment[]>(`/comments?${params}`);
  return data;
}

export async function createComment(
  projectId: string,
  body: { resource_type: string; resource_id: string; content: string; parent_id?: string },
): Promise<Comment> {
  const { data } = await apiClient.post<Comment>(`/comments?project_id=${projectId}`, body);
  return data;
}

export async function updateComment(commentId: string, content: string): Promise<Comment> {
  const { data } = await apiClient.put<Comment>(`/comments/${commentId}`, { content });
  return data;
}

export async function deleteComment(commentId: string): Promise<void> {
  await apiClient.delete(`/comments/${commentId}`);
}

export async function toggleResolveComment(commentId: string): Promise<Comment> {
  const { data } = await apiClient.patch<Comment>(`/comments/${commentId}/resolve`);
  return data;
}
