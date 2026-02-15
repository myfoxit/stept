// ────────────────────────────────────────────
// File: src/api/documents.ts
// ────────────────────────────────────────────
import { apiClient } from '@/lib/apiClient';
import type {
  DocumentRead,
  DocumentCreate,
  DocumentUpdate,
  DocumentLinkCreate,
  DocumentLinkRead,
  DocumentTreeRead, // Add this
} from '../types/openapi';

/** Get a document by its id */
export const getDocument = async (docId: string): Promise<DocumentRead> => {
  const { data } = await apiClient.get(`/documents/${docId}`);
  return data;
};

/** Create a brand-new document */
export const createDocument = async (payload: {
  name?: string;
  project_id: string;
  folder_id?: string | null;
  content?: Record<string, any>;
  page_layout?: string;
  is_private?: boolean;
}): Promise<DocumentRead> => {
  const { data } = await apiClient.post('/documents/', payload);
  return data;
};

/** Update / save an existing document */
export const saveDocument = async (
  docId: string,
  content: any,
  version?: number
): Promise<DocumentRead> => {
  const payload = { ...content };
  if (version !== undefined) {
    payload.version = version;
  }
  const { data } = await apiClient.put(`/documents/${docId}`, payload);
  return data;
};

/** ➊ List all documents */
export const listDocuments = async (): Promise<DocumentRead[]> => {
  const { data } = await apiClient.get('/documents/');
  return data;
};

/** Update a document's single table-row link */
export const linkDocument = async (
  docId: string,
  payload: { table_id: string | null; row_id: number | null }
): Promise<DocumentRead> => {
  const { data } = await apiClient.put(`/documents/${docId}/link`, payload);
  return data;
};

/** Remove a document's table-row link */
export const unlinkDocument = async (docId: string): Promise<DocumentRead> => {
  const { data } = await apiClient.delete(`/documents/${docId}/link`);
  return data;
};

/** Get documents by table row */
export const getDocumentsByTableRow = (tableId: string, rowId: number) =>
  request<DocumentRead[]>({
    method: 'GET',
    url: `/documents/by-table/${tableId}/row/${rowId}`,
  });

/** Delete a document */
export const deleteDocument = async (docId: string): Promise<void> => {
  await apiClient.delete(`/documents/${docId}`);
};

/** Get document by process recording session ID */
export const getDocumentBySession = (sessionId: string) =>
  request<DocumentRead>({
    method: 'GET',
    url: `/documents/by-session/${sessionId}`,
  });

/** Get document tree for a project */
export const getDocumentTree = (
  projectId: string,
  parentId?: string,
  depthLimit?: number
) =>
  request<DocumentTreeRead[]>({
    method: 'GET',
    url: '/documents/tree',
    params: {
      project_id: projectId,
      parent_id: parentId,
      depth_limit: depthLimit,
    },
  });

/** Move a document to a new parent/position */
export const moveDocument = async (
  docId: string,
  parentId: string | null,
  position?: number,
  isPrivate?: boolean
): Promise<DocumentRead> => {
  const { data } = await apiClient.put(`/documents/${docId}/move`, {
    parent_id: parentId,
    position,
    is_private: isPrivate,
  });
  return data;
};

/** Toggle document expansion state */
export const toggleDocumentExpansion = (docId: string, isExpanded: boolean) =>
  request<{ id: string; is_expanded: boolean }>({
    method: 'PATCH',
    url: `/documents/${docId}/expand`,
    params: { is_expanded: isExpanded },
  });

/** Duplicate a document */
export const duplicateDocument = async (
  docId: string,
  includeChildren: boolean = false
): Promise<DocumentRead> => {
  const { data } = await apiClient.post(
    `/documents/${docId}/duplicate?include_children=${includeChildren}`
  );
  return data;
};

/** Get filtered documents with sorting */
export const getFilteredDocuments = async (
  projectId: string,
  folderId?: string,
  sortBy: string = 'created_at',
  sortOrder: string = 'desc'
): Promise<DocumentRead[]> => {
  const params: Record<string, string> = {
    project_id: projectId,
    sort_by: sortBy,
    sort_order: sortOrder,
  };
  if (folderId) {
    params.folder_id = folderId;
  }
  const { data } = await apiClient.get('/documents/filtered', { params });
  return data;
};

// ──────────────────────────────────────────────────────────────────────────────
// EXPORT FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

export type DocumentExportFormat = 'pdf' | 'html' | 'markdown' | 'docx';

export interface ExportOptions {
  pageLayout?: string;
}

export async function exportDocument(
  docId: string,
  format: DocumentExportFormat,
  options?: ExportOptions
): Promise<void> {
  const params: Record<string, string> = {};
  if (options?.pageLayout) {
    params.page_layout = options.pageLayout;
  }

  // Use the correct endpoint path: /documents/{doc_id}/export/{format}
  const response = await apiClient.get(`/documents/${docId}/export/${format}`, {
    params,
    responseType: 'blob',
  });

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers['content-disposition'];
  let filename = `document.${format === 'markdown' ? 'md' : format}`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
    if (match) filename = match[1];
  }

  // Download the file
  const blob = new Blob([response.data], {
    type: response.headers['content-type'] || 'application/octet-stream',
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
