import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Type definitions
export interface CaptureArea {
  type: 'all-displays' | 'single-display' | 'window';
  displayId?: string;
  displayName?: string;
  windowHandle?: number;
  windowTitle?: string;
  bounds?: Rectangle;
}

export interface Rectangle { x: number; y: number; width: number; height: number; }
export interface Display { id: string; name: string; bounds: Rectangle; workArea: Rectangle; isPrimary: boolean; scaleFactor: number; }
export interface WindowInfo { handle: number; title: string; bounds: Rectangle; isVisible: boolean; processId: number; }
export interface RecordingState { isRecording: boolean; isPaused: boolean; startTime?: Date; stepCount: number; captureArea?: CaptureArea; }

export interface RecordedStep {
  stepNumber: number; timestamp: Date; actionType: string; windowTitle: string;
  description: string; screenshotPath?: string;
  globalMousePosition: { x: number; y: number };
  relativeMousePosition: { x: number; y: number };
  windowSize: { width: number; height: number };
  screenshotRelativeMousePosition: { x: number; y: number };
  screenshotSize: { width: number; height: number };
  textTyped?: string; scrollDelta?: number; elementName?: string;
}

export interface AuthStatus { isAuthenticated: boolean; user?: UserInfo; projects?: Project[]; }
export interface UserInfo { id: string; email: string; name: string; }
export interface Project { id: string; name: string; userId: string; role: string; }

export interface Settings {
  cloudEndpoint: string; chatApiUrl: string; apiKey: string;
  llmProvider: string; llmApiKey: string; llmModel: string; llmBaseUrl: string;
  autoAnnotateSteps: boolean; autoGenerateGuide: boolean; frontendUrl: string;
  minimizeOnRecord: boolean;
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; timestamp?: Date; }
export interface UploadResult { success: boolean; error?: string; url?: string; }

export interface ElectronAPI {
  // Recording
  startRecording: (captureArea: CaptureArea, projectId?: string) => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  getRecordingState: () => Promise<RecordingState>;

  // Screenshots
  takeScreenshot: (bounds?: Rectangle) => Promise<string>;
  getDisplays: () => Promise<Display[]>;
  getWindows: () => Promise<WindowInfo[]>;

  // Auth
  initiateLogin: () => Promise<void>;
  handleAuthCallback: (url: string) => Promise<boolean>;
  logout: () => Promise<void>;
  getAuthStatus: () => Promise<AuthStatus>;
  tryAutoLogin: () => Promise<boolean>;

  // Settings
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Partial<Settings>) => Promise<void>;
  resetSettings: () => Promise<void>;

  // Chat
  sendChatMessage: (messages: ChatMessage[], context?: string) => Promise<string>;

  // Cloud upload
  uploadRecording: (steps: RecordedStep[], projectId: string, userId: string) => Promise<UploadResult>;

  // Event listeners
  onStepRecorded: (callback: (step: RecordedStep) => void) => () => void;
  onRecordingStateChanged: (callback: (state: RecordingState) => void) => () => void;
  onAuthStatusChanged: (callback: (status: AuthStatus) => void) => () => void;
  onUploadStarted: (callback: () => void) => () => void;
  onUploadComplete: (callback: (result: UploadResult) => void) => () => void;
  onUploadError: (callback: (error: string) => void) => () => void;

  // Context watcher
  contextStart: (projectId: string) => Promise<any>;
  contextStop: () => Promise<any>;
  contextGetActive: () => Promise<{ windowTitle: string; appName: string; url?: string; appBundleId?: string } | null>;
  contextAddLink: (data: any) => Promise<any>;
  contextListLinks: (projectId?: string) => Promise<any[]>;
  contextDeleteLink: (linkId: string) => Promise<any>;
  getRunningApps: () => Promise<{ name: string; bundleId?: string }[]>;
  onContextMatches: (callback: (matches: any[], ctx: any) => void) => () => void;
  onContextNoMatches: (callback: (ctx: any) => void) => () => void;

  // Spotlight
  spotlightSearch: (query: string, projectId: string) => Promise<any>;
  spotlightSemanticSearch: (query: string, projectId: string) => Promise<any>;
  spotlightPreview: (resourceId: string, resourceType: string) => Promise<any>;
  spotlightDismiss: () => Promise<any>;
  spotlightResize: (height: number) => Promise<any>;
  onSpotlightShow: (callback: (projectId: string) => void) => () => void;

  // Settings window
  openSettingsWindow: () => Promise<any>;

  // Countdown
  showCountdown: () => Promise<any>;

  // Picker
  openPicker: () => Promise<CaptureArea | null>;
  pickerSelect: (captureArea: CaptureArea) => Promise<any>;
  pickerGetSources: () => Promise<{ screens: any[]; windows: any[] }>;

  // Recording state
  setRecordingStarting: (starting: boolean) => Promise<any>;

  // Recording toggle (from global shortcut)
  onToggleRecording: (callback: () => void) => () => void;

  // Utility
  openExternal: (url: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
}

const electronAPI: ElectronAPI = {
  // Recording
  startRecording: (captureArea, projectId?) => ipcRenderer.invoke('recording:start', captureArea, projectId),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  pauseRecording: () => ipcRenderer.invoke('recording:pause'),
  resumeRecording: () => ipcRenderer.invoke('recording:resume'),
  getRecordingState: () => ipcRenderer.invoke('recording:get-state'),

  // Screenshots
  takeScreenshot: (bounds?) => ipcRenderer.invoke('screenshot:take', bounds),
  getDisplays: () => ipcRenderer.invoke('screenshot:get-displays'),
  getWindows: () => ipcRenderer.invoke('screenshot:get-windows'),

  // Auth
  initiateLogin: () => ipcRenderer.invoke('auth:initiate-login'),
  handleAuthCallback: (url) => ipcRenderer.invoke('auth:handle-callback', url),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getAuthStatus: () => ipcRenderer.invoke('auth:get-status'),
  tryAutoLogin: () => ipcRenderer.invoke('auth:try-auto-login'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),

  // Chat
  sendChatMessage: (messages, context?) => ipcRenderer.invoke('chat:send-message', messages, context),

  // Cloud upload
  uploadRecording: (steps, projectId, userId) => ipcRenderer.invoke('cloud:upload', steps, projectId, userId),

  // Event listeners
  onStepRecorded: (callback) => {
    const handler = (_e: IpcRendererEvent, step: RecordedStep) => callback(step);
    ipcRenderer.on('step-recorded', handler);
    return () => ipcRenderer.removeListener('step-recorded', handler);
  },
  onRecordingStateChanged: (callback) => {
    const handler = (_e: IpcRendererEvent, state: RecordingState) => callback(state);
    ipcRenderer.on('recording-state-changed', handler);
    return () => ipcRenderer.removeListener('recording-state-changed', handler);
  },
  onAuthStatusChanged: (callback) => {
    const handler = (_e: IpcRendererEvent, status: AuthStatus) => callback(status);
    ipcRenderer.on('auth-status-changed', handler);
    return () => ipcRenderer.removeListener('auth-status-changed', handler);
  },
  onUploadStarted: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('upload:started', handler);
    return () => ipcRenderer.removeListener('upload:started', handler);
  },
  onUploadComplete: (callback) => {
    const handler = (_e: IpcRendererEvent, result: UploadResult) => callback(result);
    ipcRenderer.on('upload:complete', handler);
    return () => ipcRenderer.removeListener('upload:complete', handler);
  },
  onUploadError: (callback) => {
    const handler = (_e: IpcRendererEvent, error: string) => callback(error);
    ipcRenderer.on('upload:error', handler);
    return () => ipcRenderer.removeListener('upload:error', handler);
  },

  // Context watcher
  contextStart: (projectId) => ipcRenderer.invoke('context:start', projectId),
  contextStop: () => ipcRenderer.invoke('context:stop'),
  contextGetActive: () => ipcRenderer.invoke('context:get-active'),
  contextAddLink: (data) => ipcRenderer.invoke('context:add-link', data),
  contextListLinks: (projectId?) => ipcRenderer.invoke('context:list-links', projectId),
  contextDeleteLink: (linkId) => ipcRenderer.invoke('context:delete-link', linkId),
  getRunningApps: () => ipcRenderer.invoke('context:get-running-apps'),
  onContextMatches: (callback) => {
    const handler = (_e: IpcRendererEvent, matches: any[], ctx: any) => callback(matches, ctx);
    ipcRenderer.on('context:matches', handler);
    return () => ipcRenderer.removeListener('context:matches', handler);
  },
  onContextNoMatches: (callback) => {
    const handler = (_e: IpcRendererEvent, ctx: any) => callback(ctx);
    ipcRenderer.on('context:no-matches', handler);
    return () => ipcRenderer.removeListener('context:no-matches', handler);
  },

  // Spotlight
  spotlightSearch: (query, projectId) => ipcRenderer.invoke('spotlight:search', query, projectId),
  spotlightSemanticSearch: (query, projectId) => ipcRenderer.invoke('spotlight:semantic-search', query, projectId),
  spotlightPreview: (resourceId, resourceType) => ipcRenderer.invoke('spotlight:preview', resourceId, resourceType),
  spotlightDismiss: () => ipcRenderer.invoke('spotlight:dismiss'),
  spotlightResize: (height) => ipcRenderer.invoke('spotlight:resize', height),
  onSpotlightShow: (callback) => {
    const handler = (_e: IpcRendererEvent, projectId: string) => callback(projectId);
    ipcRenderer.on('spotlight:show', handler);
    return () => ipcRenderer.removeListener('spotlight:show', handler);
  },

  // Settings window
  openSettingsWindow: () => ipcRenderer.invoke('settings:open-window'),

  // Countdown
  showCountdown: () => ipcRenderer.invoke('countdown:show'),

  // Picker
  openPicker: () => ipcRenderer.invoke('picker:open'),
  pickerSelect: (captureArea) => ipcRenderer.invoke('picker:select', captureArea),
  pickerGetSources: () => ipcRenderer.invoke('picker:get-sources'),

  // Recording state
  setRecordingStarting: (starting) => ipcRenderer.invoke('recording:set-starting', starting),

  // Recording toggle (from global shortcut)
  onToggleRecording: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-recording', handler);
    return () => ipcRenderer.removeListener('toggle-recording', handler);
  },

  // Utility
  openExternal: (url) => ipcRenderer.invoke('utility:open-external', url),
  getAppVersion: () => ipcRenderer.invoke('utility:get-version'),
  getPlatform: () => ipcRenderer.invoke('utility:get-platform'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
contextBridge.exposeInMainWorld('platform', process.platform);
