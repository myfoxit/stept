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
  [key: string]: any;
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
}
