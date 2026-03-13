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

// ──────────────────────────────────────────────────────────────────────────────
// DOCUMENT LOCKING
// ──────────────────────────────────────────────────────────────────────────────

export interface DocumentLockStatus {
  locked: boolean;
  locked_by: string | null;
  locked_by_name: string | null;
  locked_at: string | null;
  is_mine: boolean;
}

export const getDocumentLock = async (docId: string): Promise<DocumentLockStatus> => {
  const { data } = await apiClient.get(`/documents/${docId}/lock`);
  return data;
};

export const acquireDocumentLock = async (docId: string, force = false): Promise<DocumentLockStatus> => {
  const { data } = await apiClient.post(`/documents/${docId}/lock`, null, { params: force ? { force: true } : {} });
  return data;
};

export const releaseDocumentLock = async (docId: string): Promise<{ locked: boolean }> => {
  const { data } = await apiClient.post(`/documents/${docId}/unlock`);
  return data;
};

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

/**
 * Export document as PDF using captured browser DOM HTML.
 * This sends the actual rendered HTML to the server for pixel-perfect PDF generation.
 */
export async function exportDocumentPdfDom(
  docId: string,
  capturedHtml: string,
  options?: ExportOptions
): Promise<void> {
  const params: Record<string, string> = {};
  if (options?.pageLayout) {
    params.page_layout = options.pageLayout;
  }

  const response = await apiClient.post(
    `/documents/${docId}/export/pdf-dom`,
    { html: capturedHtml },
    { params, responseType: 'blob' }
  );

  const contentDisposition = response.headers['content-disposition'];
  let filename = 'document.pdf';
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
    if (match) filename = match[1];
  }

  const blob = new Blob([response.data], {
    type: response.headers['content-type'] || 'application/pdf',
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

// ──────────────────────────────────────────────────────────────────────────────
// TRASH / SOFT DELETE
// ──────────────────────────────────────────────────────────────────────────────

/** Get all soft-deleted documents for a project */
export const getDeletedDocuments = async (projectId: string): Promise<DocumentRead[]> => {
  const { data } = await apiClient.get(`/documents/trash/${projectId}`);
  return data;
};

/** Restore a soft-deleted document */
export const restoreDocument = async (docId: string): Promise<DocumentRead> => {
  const { data } = await apiClient.post(`/documents/${docId}/restore`);
  return data;
};

/** Permanently delete a document (no recovery) */
export const permanentDeleteDocument = async (docId: string): Promise<void> => {
  await apiClient.delete(`/documents/${docId}/permanent`);
};

// ──────────────────────────────────────────────────────────────────────────────
// VERSION HISTORY
// ──────────────────────────────────────────────────────────────────────────────

export interface DocumentVersionRead {
  id: string;
  version_number: number;
  name: string | null;
  byte_size: number | null;
  created_by: string | null;
  created_at: string;
  content?: Record<string, any>;
}

export const listDocumentVersions = async (docId: string, limit = 50): Promise<DocumentVersionRead[]> => {
  const { data } = await apiClient.get(`/documents/${docId}/versions`, { params: { limit } });
  return data;
};

export const getDocumentVersion = async (docId: string, versionId: string): Promise<DocumentVersionRead> => {
  const { data } = await apiClient.get(`/documents/${docId}/versions/${versionId}`);
  return data;
};

export const restoreDocumentVersion = async (docId: string, versionId: string): Promise<DocumentRead> => {
  const { data } = await apiClient.post(`/documents/${docId}/restore/${versionId}`);
  return data;
};
