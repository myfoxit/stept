// ── User & Auth ──────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user?: User | null;
  projects: Project[];
}

// ── Projects ─────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  userId: string;
  role: string;
}

// ── Workflows / Process Recordings ──────────────────────────

export interface WorkflowStep {
  id: string;
  order: number;
  action: string;
  description: string;
  screenshot_path?: string;
  url?: string;
  element_selector?: string;
  element_xpath?: string;
  click_x_pct?: number;
  click_y_pct?: number;
  original_width?: number;
  original_height?: number;
}

export interface Workflow {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  steps: WorkflowStep[];
  created_at: string;
  updated_at: string;
  created_by: string;
}

// ── Documents / Pages ───────────────────────────────────────

export interface Document {
  id: string;
  project_id: string;
  title: string;
  content?: string;
  parent_id?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Interactive Guides ──────────────────────────────────────

export interface GuideStep {
  id: string;
  order: number;
  action: string;
  description: string;
  element_selector?: string;
  element_xpath?: string;
  url?: string;
}

export interface InteractiveGuide {
  id: string;
  workflow_id: string;
  title: string;
  steps: GuideStep[];
}

// ── Search ──────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  type: string;
  resource_type?: string;
  name: string;
  resource_name?: string;
  preview?: string;
  summary?: string;
  resource_summary?: string;
  note?: string;
  updated_at?: string;
  word_count?: number;
  step_count?: number;
}

// ── Recording ───────────────────────────────────────────────

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  stepCount: number;
}
