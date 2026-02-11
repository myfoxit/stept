export interface UserCreate {
  name: string;
}
export interface UserRead {
  id: number;
  name: string;
}

export interface ProjectCreate {
  name: string;
  user_id: number;
}
export interface ProjectRead {
  id: number;
  name: string;
  userId: string;
}

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
  allowed_operations?: string[]; // NEW
  active_filters?: Array<{
    // NEW
    id: string;
    name: string;
    operation: string;
    value?: any;
  }>;
}

export interface FieldCreate {
  table_id: string;
  data: Record<string, unknown>;
}
export type FieldRead = Record<string, unknown>;

export interface ValidationError {
  loc: Array<string | number>;
  msg: string;
  type: string;
}

export interface HTTPValidationError {
  detail: ValidationError[];
}

/* ───────────────────────────────────────────
 * Relations
 * ─────────────────────────────────────────── */

/** Payload to create a new relation between two tables */
export interface RelationCreate {
  left_table_id: string;
  right_table_id: string;
  /** One-to-one, one-to-many or many-to-many, etc. - make this match the enum you use server-side */
  relation_type: 'one_to_one' | 'one_to_many' | 'many_to_many';
  /** Optional friendly label shown in the UI */
  display_name?: string;
}

/** Relation record returned from the API */
export interface RelationRead {
  id: string; // UUID in your DB
  left_table_id: string;
  right_table_id: string;
  relation_type: 'one_to_one' | 'one_to_many' | 'many_to_many';
  display_name: string;
}

/** Body used when linking two existing row items through a relation */
export interface RelationAssign {
  left_item_id: number;
  right_item_id: number;
}

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

// Lookup Columns – creation payload
export interface LookUpColumnCreate {
  relation_column_id: string;
  lookup_column_id: string;
  custom_name?: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DocumentBase {
  table_id: string;
  name?: string | null;
  content: Record<string, any>; // TipTap JSON
}

export interface DocumentCreate extends DocumentBase {}

export interface DocumentUpdate {
  name?: string | null;
  content?: Record<string, any>;
  doc_type?: string;
  nav_config?: Record<string, any>;
}

export interface DocumentRead extends DocumentBase {
  id: string;
}

export interface TextContainerBase {
  container_id: string;
  name?: string | null;
  content: Record<string, any>; // TipTap JSON
}

export interface TextContainerCreate extends DocumentBase {}

export interface TextContainerUpdate {
  name?: string | null;
  content?: Record<string, any>;
}

export interface TextContainerRead extends TextContainerBase {
  id: string;
}

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

// ────────────────────────────────────────────
// Auth DTOs
// ────────────────────────────────────────────
export interface LoginIn {
  email: string;
  password: string;
}

export interface RegisterIn {
  email: string;
  password: string;
  name?: string | null;
}

export interface TokenRead {
  access_token: string;
}

export interface PasswordResetRequestIn {
  email: string;
}

export interface PasswordResetConfirmIn {
  token: string;
  new_password: string;
}

export interface VerifyIn {
  token: string;
}

// minimal shape – extend as needed
export interface UserRead {
  id: string;
  email: string;
  name?: string | null;
  is_verified?: boolean;
}

// ────────────────────────────────────────────
// Store-Views
// ────────────────────────────────────────────
export interface StoreViewCreate {
  name: string;

  buyer_table_id?: string | null;
  cart_table_id?: string | null;
  article_table_id?: string | null;

  /** list of ColumnMeta IDs that act as calc-fields */
  calc_field_ids?: string[];
}

export interface StoreViewRead extends StoreViewCreate {
  id: string;
}

/* ───────────────────────────────────────────
 * Rollups
 * ─────────────────────────────────────────── */
export interface RollupBase {
  table_id: string;
  relation_column_id: string;
  aggregate_func: string;
  rollup_column_id?: string | null;
  precision?: number | null;
  show_thousands_sep?: boolean;
}

/** Payload when creating a new rollup column */
export interface RollupCreate extends RollupBase {
  display_name: string;
}

/** Partial update */
export interface RollupUpdate {
  relation_column_id?: string;
  rollup_column_id?: string | null;
  aggregate_func?: string;
  precision?: number | null;
  show_thousands_sep?: boolean;
}

/** Response coming back from the API */
export interface RollupRead extends RollupBase {
  id: string;
  column_id: string;
  display_name: string;
  show_thousands_sep: boolean;
}

/* ───────────────────────────────────────────
 * Process Recording
 * ─────────────────────────────────────────── */

export interface ProcessRecordingSession {
  session_id: string;
  name?: string;
  status: string;
  created_at: string;
  total_steps: number;
  total_files: number;
  files_uploaded: number;
  metadata: any[];
  storage_type: string;
  storage_path: string;
}

export interface WorkflowRead {
  id: string;
  name: string;
  project_id: string;
  folder_id?: string | null;
  position: number;
  status: string;
  created_at: string;
  updated_at: string;
  total_steps?: number;
  total_files?: number;
  metadata?: any[];
}

/* ───────────────────────────────────────────
 * Filters
 * ─────────────────────────────────────────── */

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
