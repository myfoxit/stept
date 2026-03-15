import { request } from '../lib/apiClient';

export interface ImportPreview {
  upload_id: string;
  preview: {
    columns: string[];
    rows: Record<string, any>[];
    total_rows: number;
  };
}

export interface ImportStatus {
  upload_id: string;
  status: 'idle' | 'preview' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  rows_processed?: number;
  total_rows?: number;
}

export const uploadExcel = (formData: FormData) =>
  request<ImportPreview>({
    method: 'POST',
    url: '/datatable/imports/upload',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

export const confirmColumnMapping = (uploadId: string, data: any) =>
  request({
    method: 'POST',
    url: `/datatable/imports/${uploadId}/confirm`,
    data,
  });

export const getImportStatus = (uploadId: string) =>
  request<ImportStatus>({
    method: 'GET',
    url: `/datatable/imports/${uploadId}/status`,
  });
