export interface SpotlightResult {
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ContextInfo {
  windowTitle?: string;
  appName?: string;
  url?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user?: { id: string; email: string; name: string } | null;
  projects: { id: string; name: string; userId: string; role: string }[];
}

export interface RecState {
  isRecording: boolean;
  isPaused: boolean;
  stepCount: number;
}

export type SpotMode = 'search' | 'ai';
