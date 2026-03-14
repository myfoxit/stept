// ── API Routes ──────────────────────────────────────────────

export const API_VERSION = 'v1';

export const API_ROUTES = {
  login: `/api/${API_VERSION}/auth/login`,
  register: `/api/${API_VERSION}/auth/register`,
  logout: `/api/${API_VERSION}/auth/logout`,
  me: `/api/${API_VERSION}/auth/me`,
  projects: `/api/${API_VERSION}/projects`,
  project: (id: string) => `/api/${API_VERSION}/projects/${id}`,
  workflows: (projectId: string) =>
    `/api/${API_VERSION}/projects/${projectId}/workflows`,
  workflow: (projectId: string, id: string) =>
    `/api/${API_VERSION}/projects/${projectId}/workflows/${id}`,
  documents: (projectId: string) =>
    `/api/${API_VERSION}/projects/${projectId}/documents`,
  document: (projectId: string, id: string) =>
    `/api/${API_VERSION}/projects/${projectId}/documents/${id}`,
  search: (projectId: string) =>
    `/api/${API_VERSION}/projects/${projectId}/search`,
  processRecording: `/api/${API_VERSION}/process-recording`,
} as const;

// ── Defaults ────────────────────────────────────────────────

export const DEFAULT_API_BASE = 'http://localhost:8000';
export const CLOUD_API_BASE = 'https://app.stept.ai';

// ── Extension / Desktop ─────────────────────────────────────

export const RECORDING_EVENTS = {
  START: 'recording:start',
  STOP: 'recording:stop',
  PAUSE: 'recording:pause',
  RESUME: 'recording:resume',
  STEP_CAPTURED: 'recording:step-captured',
} as const;
