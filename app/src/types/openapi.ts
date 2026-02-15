/**
 * Minimal type definitions for the Ondoki API.
 * These replace the auto-generated openapi.ts from Ondoki.
 * Regenerate from the OpenAPI schema when needed.
 */

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginIn {
  email: string;
  password: string;
}

export interface RegisterIn {
  name: string;
  email: string;
  password: string;
}

export interface TokenRead {
  access_token: string;
  token_type: string;
}

export interface PasswordResetRequestIn {
  email: string;
}

export interface PasswordResetConfirmIn {
  token: string;
  new_password: string;
}

// ── Users ────────────────────────────────────────────────────────────────────

export interface UserRead {
  id: string;
  name: string;
  email: string;
  is_verified?: boolean;
}

export interface UserCreate {
  name: string;
  email: string;
  password: string;
}

// ── Projects ─────────────────────────────────────────────────────────────────

export interface ProjectRead {
  id: string;
  name: string;
  owner_id: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  created_by_name?: string;
}

export interface ProjectCreate {
  name: string;
}

// ── Documents ────────────────────────────────────────────────────────────────

export interface DocumentRead {
  id: string;
  name?: string;
  content: Record<string, any>;
  page_layout?: string;
  project_id: string;
  folder_id?: string | null;
  position?: number;
  is_private?: boolean;
  owner_id?: string | null;
  version?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentCreate {
  name?: string;
  content?: Record<string, any>;
  project_id: string;
  folder_id?: string | null;
  page_layout?: string;
  is_private?: boolean;
}

export interface DocumentUpdate {
  name?: string;
  content?: Record<string, any>;
  page_layout?: string;
  is_private?: boolean;
  version?: number;
}

export interface DocumentLinkCreate {
  table_id: string;
  row_id: number;
}

export interface DocumentLinkRead {
  linked_table_id: string | null;
  linked_row_id: number | null;
}

export interface DocumentTreeRead {
  id: string;
  name?: string;
  type: 'folder' | 'document' | 'workflow';
  parent_id?: string | null;
  position?: number;
  children?: DocumentTreeRead[];
}

// ── Text Container ───────────────────────────────────────────────────────────

export interface TextContainerRead {
  id: string;
  name?: string;
  content: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface TextContainerCreate {
  name?: string;
  content?: Record<string, any>;
}

export interface TextContainerUpdate {
  name?: string;
  content?: Record<string, any>;
}

// ── Process Recording / Workflows ────────────────────────────────────────────

export interface ProcessRecordingSession {
  id: string;
  user_id?: string;
  client_name?: string;
  status: string;
  name?: string;
  project_id?: string;
  folder_id?: string | null;
  position?: number;
  is_private?: boolean;
  owner_id?: string | null;
  icon_type?: string;
  icon_value?: string;
  icon_color?: string;
  total_steps?: number;
  total_files?: number;
  storage_type?: string;
  storage_path?: string;
  created_at?: string;
  updated_at?: string;
  finalized_at?: string;
}

export type WorkflowRead = ProcessRecordingSession;

// ── Errors ───────────────────────────────────────────────────────────────────

export interface HTTPValidationError {
  detail?: Array<{
    loc: (string | number)[];
    msg: string;
    type: string;
  }>;
}

// ── Deprecated / Removed ─────────────────────────────────────────────────────
// The following type is referenced by legacy editor code but the underlying
// table/column system has been removed. Keeping a minimal stub to avoid
// breaking imports.

export interface ColumnRead {
  id: string;
  name: string;
  display_name?: string;
  ui_type?: string;
  [key: string]: any;
}
