import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Define the API interface that will be exposed to the renderer
export interface ElectronAPI {
  // Recording operations
  startRecording: (captureArea: CaptureArea, projectId?: string) => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  getRecordingState: () => Promise<RecordingState>;

  // Screenshot operations
  takeScreenshot: (bounds?: Rectangle) => Promise<string>;
  getDisplays: () => Promise<Display[]>;
  getWindows: () => Promise<WindowInfo[]>;

  // Authentication
  initiateLogin: () => Promise<void>;
  handleAuthCallback: (url: string) => Promise<boolean>;
  logout: () => Promise<void>;
  getAuthStatus: () => Promise<AuthStatus>;
  tryAutoLogin: () => Promise<boolean>;

  // Settings management
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Partial<Settings>) => Promise<void>;
  resetSettings: () => Promise<void>;

  // Chat and AI services
  sendChatMessage: (messages: ChatMessage[], context?: string) => Promise<string>;
  generateGuide: (steps: RecordedStep[]) => Promise<string>;
  annotateStep: (step: RecordedStep) => Promise<AnnotatedStep>;

  // Cloud upload
  uploadRecording: (steps: RecordedStep[], projectId: string, userId: string) => Promise<UploadResult>;

  // Event listeners
  onStepRecorded: (callback: (step: RecordedStep) => void) => () => void;
  onStepAnnotated: (callback: (step: any) => void) => () => void;
  onRecordingStateChanged: (callback: (state: RecordingState) => void) => () => void;
  onAuthStatusChanged: (callback: (status: AuthStatus) => void) => () => void;
  onProtocolUrl: (callback: (url: string) => void) => () => void;

  // Context watcher
  contextStart: (projectId: string) => Promise<any>;
  contextStop: () => Promise<any>;
  contextGetActive: () => Promise<{ windowTitle: string; appName: string; url?: string } | null>;
  contextAddLink: (data: { project_id: string; match_type: string; match_value: string; resource_type: string; resource_id: string; note?: string }) => Promise<any>;
  contextListLinks: (projectId?: string) => Promise<any[]>;
  contextDeleteLink: (linkId: string) => Promise<any>;
  onContextMatches: (callback: (matches: any[], ctx: any) => void) => () => void;
  onContextNoMatches: (callback: (ctx: any) => void) => () => void;
  onShowAddContextNote: (callback: () => void) => () => void;

  // Utility
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (path: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
}

// Type definitions
export interface CaptureArea {
  type: 'all-displays' | 'single-display' | 'window';
  displayId?: string;
  displayName?: string;
  windowHandle?: number;
  windowTitle?: string;
  bounds?: Rectangle;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Display {
  id: string;
  name: string;
  bounds: Rectangle;
  workArea: Rectangle;
  isPrimary: boolean;
  scaleFactor: number;
}

export interface WindowInfo {
  handle: number;
  title: string;
  bounds: Rectangle;
  isVisible: boolean;
  processId: number;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  startTime?: Date;
  stepCount: number;
  captureArea?: CaptureArea;
}

export interface RecordedStep {
  stepNumber: number;
  timestamp: Date;
  actionType: string;
  windowTitle: string;
  description: string;
  screenshotPath?: string;
  globalMousePosition: { x: number; y: number };
  relativeMousePosition: { x: number; y: number };
  windowSize: { width: number; height: number };
  screenshotRelativeMousePosition: { x: number; y: number };
  screenshotSize: { width: number; height: number };
  textTyped?: string;
  scrollDelta?: number;
  elementName?: string;
}

export interface AnnotatedStep extends RecordedStep {
  generatedTitle?: string;
  generatedDescription?: string;
  isAnnotated: boolean;
  cropRegion?: CropRegion;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  user?: UserInfo;
  projects?: Project[];
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  userId: string;
  role: string;
}

export interface Settings {
  cloudEndpoint: string;
  chatApiUrl: string;
  apiKey: string;
  llmProvider: string;
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl: string;
  autoAnnotateSteps: boolean;
  autoGenerateGuide: boolean;
  frontendUrl: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface UploadResult {
  success: boolean;
  error?: string;
  url?: string;
}

// Create the API object
const electronAPI: ElectronAPI = {
  // Recording operations
  startRecording: (captureArea: CaptureArea, projectId?: string) =>
    ipcRenderer.invoke('recording:start', captureArea, projectId),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  pauseRecording: () => ipcRenderer.invoke('recording:pause'),
  resumeRecording: () => ipcRenderer.invoke('recording:resume'),
  getRecordingState: () => ipcRenderer.invoke('recording:get-state'),

  // Screenshot operations
  takeScreenshot: (bounds?: Rectangle) => ipcRenderer.invoke('screenshot:take', bounds),
  getDisplays: () => ipcRenderer.invoke('screenshot:get-displays'),
  getWindows: () => ipcRenderer.invoke('screenshot:get-windows'),

  // Authentication
  initiateLogin: () => ipcRenderer.invoke('auth:initiate-login'),
  handleAuthCallback: (url: string) => ipcRenderer.invoke('auth:handle-callback', url),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getAuthStatus: () => ipcRenderer.invoke('auth:get-status'),
  tryAutoLogin: () => ipcRenderer.invoke('auth:try-auto-login'),

  // Settings management
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Partial<Settings>) => ipcRenderer.invoke('settings:save', settings),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),

  // Chat and AI services
  sendChatMessage: (messages: ChatMessage[], context?: string) =>
    ipcRenderer.invoke('chat:send-message', messages, context),
  generateGuide: (steps: RecordedStep[]) => ipcRenderer.invoke('guide:generate', steps),
  annotateStep: (step: RecordedStep) => ipcRenderer.invoke('annotation:annotate-step', step),

  // Cloud upload
  uploadRecording: (steps: RecordedStep[], projectId: string, userId: string) =>
    ipcRenderer.invoke('cloud:upload', steps, projectId, userId),

  // Event listeners
  onStepRecorded: (callback: (step: RecordedStep) => void) => {
    const handler = (_event: IpcRendererEvent, step: RecordedStep) => callback(step);
    ipcRenderer.on('step-recorded', handler);
    return () => ipcRenderer.removeListener('step-recorded', handler);
  },

  onStepAnnotated: (callback: (step: any) => void) => {
    const handler = (_event: IpcRendererEvent, step: any) => callback(step);
    ipcRenderer.on('step-annotated', handler);
    return () => ipcRenderer.removeListener('step-annotated', handler);
  },

  onRecordingStateChanged: (callback: (state: RecordingState) => void) => {
    const handler = (_event: IpcRendererEvent, state: RecordingState) => callback(state);
    ipcRenderer.on('recording-state-changed', handler);
    return () => ipcRenderer.removeListener('recording-state-changed', handler);
  },

  onAuthStatusChanged: (callback: (status: AuthStatus) => void) => {
    const handler = (_event: IpcRendererEvent, status: AuthStatus) => callback(status);
    ipcRenderer.on('auth-status-changed', handler);
    return () => ipcRenderer.removeListener('auth-status-changed', handler);
  },

  onProtocolUrl: (callback: (url: string) => void) => {
    const handler = (_event: IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('protocol-url', handler);
    return () => ipcRenderer.removeListener('protocol-url', handler);
  },

  // Context watcher
  contextStart: (projectId: string) => ipcRenderer.invoke('context:start', projectId),
  contextStop: () => ipcRenderer.invoke('context:stop'),
  contextGetActive: () => ipcRenderer.invoke('context:get-active'),
  contextAddLink: (data) => ipcRenderer.invoke('context:add-link', data),
  contextListLinks: (projectId?: string) => ipcRenderer.invoke('context:list-links', projectId),
  contextDeleteLink: (linkId: string) => ipcRenderer.invoke('context:delete-link', linkId),
  onContextMatches: (callback: (matches: any[], ctx: any) => void) => {
    const handler = (_event: IpcRendererEvent, matches: any[], ctx: any) => callback(matches, ctx);
    ipcRenderer.on('context:matches', handler);
    return () => ipcRenderer.removeListener('context:matches', handler);
  },
  onContextNoMatches: (callback: (ctx: any) => void) => {
    const handler = (_event: IpcRendererEvent, ctx: any) => callback(ctx);
    ipcRenderer.on('context:no-matches', handler);
    return () => ipcRenderer.removeListener('context:no-matches', handler);
  },
  onShowAddContextNote: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('show-add-context-note', handler);
    return () => ipcRenderer.removeListener('show-add-context-note', handler);
  },

  // Utility
  openExternal: (url: string) => ipcRenderer.invoke('utility:open-external', url),
  showItemInFolder: (path: string) => ipcRenderer.invoke('utility:show-in-folder', path),
  getAppVersion: () => ipcRenderer.invoke('utility:get-version'),
  getPlatform: () => ipcRenderer.invoke('utility:get-platform'),
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Also expose some Node.js globals that might be needed
contextBridge.exposeInMainWorld('platform', process.platform);
contextBridge.exposeInMainWorld('versions', process.versions);