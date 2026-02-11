import { getFolderTree, createFolder, updateFolder, moveFolder, toggleFolderExpansion, duplicateFolder, deleteFolder, type FolderTreeRead, type FolderRead } from '@/api/folders';
import type { ApiError } from '@/lib/apiClient';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

export type { FolderTreeRead, FolderRead };

export const useFolderTree = (projectId?: string | null, isPrivate?: boolean) =>
  useQuery<FolderTreeRead[], ApiError>({
    queryKey: ['folderTree', projectId, isPrivate],
    queryFn: () => getFolderTree(projectId!, isPrivate),
    enabled: !!projectId,
  });

export const useCreateFolder = () => {
  const qc = useQueryClient();
  return useMutation<
    FolderRead,
    ApiError,
    {
      name: string;
      projectId: string;
      parentId?: string;
      isPrivate?: boolean;
    }
  >({
    mutationFn: ({ name, projectId, parentId, isPrivate }) =>
      createFolder({
        name,
        project_id: projectId,
        parent_id: parentId,
        is_private: isPrivate,
      }),
    onSuccess: (_data, { projectId }) => {
      // Invalidate both shared and private trees
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, false] });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, true] });
    },
  });
};

export const useUpdateFolder = () => {
  const qc = useQueryClient();
  return useMutation<FolderRead, ApiError, { folderId: string; name?: string; isPrivate?: boolean }>({
    mutationFn: ({ folderId, name, isPrivate }) => updateFolder(folderId, { name, is_private: isPrivate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folderTree'] });
    },
  });
};

export const useMoveFolder = () => {
  const qc = useQueryClient();
  return useMutation<
    FolderRead,
    ApiError,
    {
      folderId: string;
      parentId: string | null;
      position?: number;
      projectId: string;
      isPrivate?: boolean;
    }
  >({
    mutationFn: ({ folderId, parentId, position, isPrivate }) =>
      moveFolder(folderId, parentId, position, isPrivate),
    onSuccess: (_data, { projectId }) => {
      // Invalidate both shared and private trees
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, false] });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, true] });
    },
  });
};

export const useToggleFolderExpansion = () => {
  const qc = useQueryClient();
  return useMutation<
    { id: string; is_expanded: boolean },
    ApiError,
    { folderId: string; isExpanded: boolean }
  >({
    mutationFn: ({ folderId, isExpanded }) =>
      toggleFolderExpansion(folderId, isExpanded),
    onSuccess: (_data, vars) => {
      // Update the cache optimistically instead of refetching
      qc.setQueriesData(
        { queryKey: ['folderTree'], exact: false },
        (oldData: any) => {
          if (!oldData) return oldData;

          const updateNode = (nodes: any[]): any[] => {
            return nodes.map((node) => {
              if (node.id === vars.folderId) {
                return { ...node, is_expanded: vars.isExpanded };
              }
              if (node.children && node.children.length > 0) {
                return { ...node, children: updateNode(node.children) };
              }
              return node;
            });
          };

          return updateNode(oldData);
        }
      );
    },
  });
};

export const useDuplicateFolder = () => {
  const qc = useQueryClient();
  return useMutation<
    FolderRead,
    ApiError,
    { folderId: string; includeChildren?: boolean }
  >({
    mutationFn: ({ folderId, includeChildren = false }) =>
      duplicateFolder(folderId, includeChildren),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folderTree'] });
    },
  });
};

export const useDeleteFolder = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { folderId: string; projectId: string }>({
    mutationFn: ({ folderId }) => deleteFolder(folderId),
    onSuccess: (_data, { projectId }) => {
      // Invalidate both shared and private trees
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, false] });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, true] });
    },
  });
};