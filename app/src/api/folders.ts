import { apiClient } from '@/lib/apiClient';

export interface FolderTreeRead {
  id: string;
  name: string | null;
  icon: string | null;
  parent_id: string | null;
  path: string;
  depth: number;
  position: number;
  is_expanded: boolean;
  is_folder: boolean;
  is_workflow: boolean;
  is_private: boolean;
  owner_id: string | null;
  source_file_mime: string | null;
  children: FolderTreeRead[];
}

export interface FolderRead {
  id: string;
  name: string;
  project_id: string;
  parent_id: string | null;
  path: string;
  depth: number;
  position: number;
  is_expanded: boolean;
  icon: string | null;
  is_private: boolean;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export const getFolderTree = async (
  projectId: string,
  isPrivate?: boolean
): Promise<FolderTreeRead[]> => {
  const params: Record<string, string> = { project_id: projectId };
  if (isPrivate !== undefined) {
    params.is_private = String(isPrivate);
  }
  const { data } = await apiClient.get('/folders/tree', { params });
  return data;
};

export const createFolder = async (payload: {
  name: string;
  project_id: string;
  parent_id?: string;
  is_private?: boolean;
}): Promise<FolderRead> => {
  const { data } = await apiClient.post('/folders/', payload);
  return data;
};

export const updateFolder = async (
  folderId: string,
  payload: { name?: string; icon?: string; is_private?: boolean }
): Promise<FolderRead> => {
  const { data } = await apiClient.put(`/folders/${folderId}`, payload);
  return data;
};

export const moveFolder = async (
  folderId: string,
  parentId: string | null,
  position?: number,
  isPrivate?: boolean
): Promise<FolderRead> => {
  const { data } = await apiClient.put(`/folders/${folderId}/move`, {
    parent_id: parentId,
    position,
    is_private: isPrivate,
  });
  return data;
};

export const toggleFolderExpansion = async (
  folderId: string,
  isExpanded: boolean
): Promise<{ id: string; is_expanded: boolean }> => {
  const { data } = await apiClient.patch(
    `/folders/${folderId}/expand?is_expanded=${isExpanded}`
  );
  return data;
};

export const duplicateFolder = async (
  folderId: string,
  includeChildren: boolean = false
): Promise<FolderRead> => {
  const { data } = await apiClient.post(
    `/folders/${folderId}/duplicate?include_children=${includeChildren}`
  );
  return data;
};

export const deleteFolder = async (folderId: string): Promise<void> => {
  await apiClient.delete(`/folders/${folderId}`);
};
