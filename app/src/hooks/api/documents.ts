import { getDocument, saveDocument, linkDocument, unlinkDocument, moveDocument, deleteDocument, listDocuments, createDocument, duplicateDocument, getFilteredDocuments, getDocumentLock, acquireDocumentLock, releaseDocumentLock, type DocumentLockStatus } from '@/api/documents';
import { getTextContainer, getAllTextContainer, saveTextContainer, createTextContainer } from '@/api/text_container';
import type { PageLayout } from '@/components/page-layout-selector';
import { apiClient, type ApiError } from '@/lib/apiClient';
import  { queryKeys } from '@/lib/queryKeys';
import type { DocumentRead } from '@/types/openapi';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

export const useDocument = (docId: string) =>
  useQuery({
    queryKey: queryKeys.document(docId),
    queryFn: () => getDocument(docId),
  
    retry: false,
  });

  export const useDocuments = () =>
  useQuery<DocumentRead[], ApiError>({
    queryKey: ['documents'],
    queryFn: listDocuments,
  });

export const useSaveDocument = (docId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => {
      const { version, ...content } = payload;
      return saveDocument(docId, content, version);
    },
    onSuccess: (data) => {
      // Update cache with new version from server
      qc.setQueryData(queryKeys.document(docId), (old: any) => ({
        ...old,
        ...data,
      }));
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['folderTree'] });
    },
  });
};


export const useLinkDocument = () => {
  const qc = useQueryClient();
  return useMutation<
    DocumentRead,
    ApiError,
    { docId: string; tableId: string | null; rowId: number | null }
  >({
    mutationFn: ({ docId, tableId, rowId }) =>
      linkDocument(docId, { table_id: tableId, row_id: rowId }),
    onSuccess: (_data, { docId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.document(docId) });
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};

export const useUnlinkDocument = () => {
  const qc = useQueryClient();
  return useMutation<DocumentRead, ApiError, { docId: string }>({
    mutationFn: ({ docId }) => unlinkDocument(docId),
    onSuccess: (_data, { docId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.document(docId) });
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};

export const useMoveDocument = () => {
  const qc = useQueryClient();
  return useMutation<
    DocumentRead,
    ApiError,
    {
      docId: string;
      parentId: string | null;
      position?: number;
      projectId: string;
      isPrivate?: boolean;
    }
  >({
    mutationFn: ({ docId, parentId, position, isPrivate }) =>
      moveDocument(docId, parentId, position, isPrivate),
    onSuccess: (_data, { projectId }) => {
      // Invalidate both shared and private trees
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, false] });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, true] });
      qc.invalidateQueries({
        queryKey: ['documents'],
        refetchType: 'active',
      });
    },
  });
};

export const useDeleteDocument = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { docId: string; projectId: string }>({
    mutationFn: ({ docId }) => deleteDocument(docId),
    onSuccess: (_data, { docId, projectId }) => {
      // Invalidate both shared and private trees
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, false] });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, true] });
      qc.invalidateQueries({
        queryKey: ['documents'],
        refetchType: 'active',
      });
      qc.removeQueries({
        queryKey: queryKeys.document(docId),
        exact: true,
      });
    },
  });
};

export const useTextContainer = (containerId: string) =>
  useQuery({
    queryKey: queryKeys.text_container(containerId),
    queryFn: () => getTextContainer(containerId),
    
    retry: false,
  });

export const useAllTextContainer = () =>
  useQuery({
    queryKey: queryKeys.text_container(),
    queryFn: () => getAllTextContainer(),

    retry: false,
  });

export const useSaveTextContainer = (containerId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: any) => saveTextContainer(containerId, content),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.text_container(containerId) }),
  });
};

export const useCreateTextContainer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => createTextContainer(payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.text_container() }),
  });
};

export const useCreateDocument = () => {
  const qc = useQueryClient();
  return useMutation<
    DocumentRead,
    ApiError,
    {
      title: string;
      projectId: string;
      parentId?: string | null;
      docType?: 'document' | 'workflow';
      folderId?: string | null;
      isPrivate?: boolean;
    }
  >({
    mutationFn: ({
      title,
      projectId,
      parentId,
      docType = 'document',
      folderId,
      isPrivate,
    }) =>
      createDocument({
        name: title,
        project_id: projectId,
        folder_id: folderId || parentId,
        is_private: isPrivate,
      } as any),
    onSuccess: (_data, { projectId }) => {
      // Invalidate both shared and private trees
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, false] });
      qc.invalidateQueries({ queryKey: ['folderTree', projectId, true] });
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};

export const useDuplicateDocument = () => {
  const qc = useQueryClient();
  return useMutation<
    DocumentRead,
    ApiError,
    { docId: string; includeChildren?: boolean }
  >({
    mutationFn: ({ docId, includeChildren = false }) =>
      duplicateDocument(docId, includeChildren),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documentTree'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};


export const useFilteredDocuments = (
  projectId?: string,
  filterType: 'all' | 'pages' | 'workflows' = 'all',
  sortBy: 'created_at' | 'updated_at' | 'name' = 'created_at',
  sortOrder: 'asc' | 'desc' = 'desc'
) =>
  useQuery({
    queryKey: [
      'documents',
      'filtered',
      projectId,
      filterType,
      sortBy,
      sortOrder,
    ],
    queryFn: () =>
      getFilteredDocuments(projectId!, undefined, sortBy, sortOrder),
    enabled: !!projectId,
  });


  export const useUpdateDocumentLayout = (docId: string) => {
  const qc = useQueryClient();
  return useMutation<any, ApiError, PageLayout>({
    mutationFn: async (layout) => {
      const { data } = await apiClient.put(`/documents/${docId}`, {
        page_layout: layout,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.document(docId) });
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};

// ──────────────────────────────────────────────────────────────────────────────
// DOCUMENT LOCKING HOOKS
// ──────────────────────────────────────────────────────────────────────────────

export const useDocumentLock = (docId: string) =>
  useQuery<DocumentLockStatus>({
    queryKey: [...queryKeys.document(docId), 'lock'],
    queryFn: () => getDocumentLock(docId),
    refetchInterval: 30_000,
    enabled: !!docId,
  });

export const useAcquireDocumentLock = (docId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force?: boolean) => acquireDocumentLock(docId, force),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...queryKeys.document(docId), 'lock'] });
    },
  });
};

export const useReleaseDocumentLock = (docId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => releaseDocumentLock(docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...queryKeys.document(docId), 'lock'] });
    },
  });
};
