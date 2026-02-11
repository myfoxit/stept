export type WorkflowStep = {
  step_number: number;
  step_type?: 'screenshot' | 'text' | 'header' | 'tip' | 'alert' | 'capture' | 'gif';
  window_title?: string | null;
  description?: string | null;
  content?: string | null;
  relative_position?: { x: number; y: number };
  window_size?: { width: number; height: number };
  screenshot_relative_position?: { x: number; y: number };
  screenshot_size?: { width: number; height: number };
  // AI annotation fields
  step_id?: string;
  generated_title?: string | null;
  generated_description?: string | null;
  ui_element?: string | null;
  step_category?: string | null;
  is_annotated?: boolean;
  [key: string]: unknown;
};

export interface ZoomState {
  stepNumber: number;
  zoomLevel: number;
  translateX: number;
  translateY: number;
}

export interface Workflow {
  id: string;
  title?: string;
  description?: string;
  total_steps?: number;
  duration_seconds?: number;
  created_by?: {
    name: string;
  };
  metadata?: WorkflowStep[];
  // AI processing fields
  generated_title?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  estimated_time?: string | null;
  difficulty?: string | null;
  is_processed?: boolean;
  guide_markdown?: string | null;
}
