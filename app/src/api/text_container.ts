// ────────────────────────────────────────────
// File: src/api/documents.ts
// ────────────────────────────────────────────
import { request } from '../lib/apiClient';
import type {
  TextContainerCreate,
  TextContainerRead,
  TextContainerUpdate,
} from '../types/openapi';

/** Get the (single) document for a table */
export const getTextContainer = (containerId: string) =>
  request<TextContainerRead>({
    method: 'GET',
    url: `/text_container/${containerId}`,
  });

export const getAllTextContainer = () =>
  request<TextContainerRead>({
    method: 'GET',
    url: `/text_container/`,
  });

/** Create a brand‑new document (only needed the first time) */
export const createTextContainer = (body: TextContainerCreate) =>
  request<TextContainerRead, TextContainerCreate>({
    method: 'POST',
    url: '/text_container/',
    data: body,
  });

/** Update / save an existing document */
export const saveTextContainer = (
  containerId: string,
  body: TextContainerUpdate
) =>
  request<TextContainerRead, TextContainerUpdate>({
    method: 'PUT',
    url: `/text_container/${containerId}`,
    data: body,
  });
