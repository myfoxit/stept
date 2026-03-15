/**
 * Minimal type definitions for the Stept API.
 * These replace the auto-generated openapi.ts from Stept.
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
  ai_enabled?: boolean;
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
  source_file_mime?: string | null;
  source_file_name?: string | null;
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
  session_id?: string;
  user_id?: string;
  client_name?: string;
  status: string;
  name?: string;
  title?: string;
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

// ── DataTable: Tables ───────────────────────────────────────────────────────

export interface TableCreate {
  name: string;
  project_id: number;
}

export interface TableRead {
  id: number;
  name: string;
  physical_name: string;
  project_id: number;
}

// ── DataTable: Columns ──────────────────────────────────────────────────────

export interface ColumnCreate {
  table_id: string;
  name: string;
  ui_type: string;
  referencee_column_id?: string;
  position?: string;
}

export interface ColumnRead {
  id: number;
  table_id: number;
  name: string;
  display_name: string;
  ui_type: string;
  column_type: string;
  relations_table_id?: string;
  relation_id?: string;
  allowed_operations?: string[];
  active_filters?: Array<{
    id: string;
    name: string;
    operation: string;
    value?: any;
  }>;
  [key: string]: any;
}

export interface ColumnUpdate {
  name?: string;
  default_value?: any;
  settings?: Record<string, any>;
}

// ── DataTable: Fields / Rows ────────────────────────────────────────────────

export interface FieldCreate {
  table_id: string;
  data: Record<string, unknown>;
}

export type FieldRead = Record<string, unknown>;

// ── DataTable: Relations ────────────────────────────────────────────────────

export interface RelationCreate {
  left_table_id: string;
  right_table_id: string;
  relation_type: 'one_to_one' | 'one_to_many' | 'many_to_many';
  display_name?: string;
}

export interface RelationRead {
  id: string;
  left_table_id: string;
  right_table_id: string;
  relation_type: 'one_to_one' | 'one_to_many' | 'many_to_many';
  display_name: string;
}

export interface RelationAssign {
  left_item_id: number;
  right_item_id: number;
}

// ── DataTable: Select Options ───────────────────────────────────────────────

export interface SelectOption {
  id: string;
  name: string;
  color?: string | null;
  order: number;
}

export interface SelectColumnCreate {
  table_id: string;
  name: string;
  options: Array<{
    id?: string;
    name: string;
    color?: string | null;
  }>;
}

// ── DataTable: Lookup Columns ───────────────────────────────────────────────

export interface LookUpColumnCreate {
  relation_column_id: string;
  lookup_column_id: string;
  custom_name?: string | null;
}

// ── DataTable: Formulas ─────────────────────────────────────────────────────

export interface FormulaCreate {
  table_id: string;
  display_name: string;
  formula: string;
  formula_raw: string;
}

export interface FormulaRead {
  id: string;
  column_id: string;
  display_name: string;
  formula: string;
  formula_raw: string;
}

// ── DataTable: Rollups ──────────────────────────────────────────────────────

export interface RollupBase {
  table_id: string;
  relation_column_id: string;
  aggregate_func: string;
  rollup_column_id?: string | null;
  precision?: number | null;
  show_thousands_sep?: boolean;
}

export interface RollupCreate extends RollupBase {
  display_name: string;
}

export interface RollupUpdate {
  relation_column_id?: string;
  rollup_column_id?: string | null;
  aggregate_func?: string;
  precision?: number | null;
  show_thousands_sep?: boolean;
}

export interface RollupRead extends RollupBase {
  id: string;
  column_id: string;
  display_name: string;
  show_thousands_sep: boolean;
}

// ── DataTable: Filters ──────────────────────────────────────────────────────

export interface FilterCreate {
  name: string;
  table_id: string;
  column_id: string;
  operation: string;
  value?: any;
  is_reusable?: boolean;
}

export interface FilterUpdate {
  name?: string;
  operation?: string;
  value?: any;
  is_reusable?: boolean;
  is_active?: boolean;
}

export interface FilterRead {
  id: string;
  name: string;
  table_id: string;
  user_id: string;
  column_id: string;
  operation: string;
  value?: any;
  is_reusable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── DataTable: Column Visibility ────────────────────────────────────────────

export interface ColumnVisibilityRead {
  id: string;
  table_id: string;
  column_id: string;
  is_visible: boolean;
}

export interface ColumnVisibilityCreate {
  table_id: string;
  column_id: string;
  is_visible: boolean;
}

export interface ColumnVisibilityBulkUpdate {
  table_id: string;
  updates: Array<{
    column_id: string;
    is_visible: boolean;
  }>;
}
