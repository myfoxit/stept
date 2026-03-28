import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, Function>();
const shellOpenExternal = vi.fn().mockResolvedValue(undefined);
const appOn = vi.fn();
const appGetVersion = vi.fn().mockReturnValue('1.2.3');

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: Function) => handlers.set(channel, fn)),
  },
  shell: {
    openExternal: shellOpenExternal,
  },
  app: {
    on: appOn,
    emit: vi.fn(),
    getVersion: appGetVersion,
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
  Notification: {
    isSupported: vi.fn().mockReturnValue(false),
  },
  webContents: {
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

const authServiceInstance = {
  getAccessToken: vi.fn().mockReturnValue('token_1'),
  getStatus: vi.fn().mockResolvedValue({ user: { id: 'user_1' } }),
  initiateLogin: vi.fn().mockResolvedValue(undefined),
  handleCallback: vi.fn().mockResolvedValue(true),
  logout: vi.fn().mockResolvedValue(undefined),
  tryAutoLogin: vi.fn().mockResolvedValue(true),
  on: vi.fn(),
};

const settingsManagerInstance = {
  getSettings: vi.fn().mockReturnValue({
    cloudEndpoint: 'https://api.stept.ai/api/v1',
    chatApiUrl: 'https://api.stept.ai/api/v1',
  }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  resetSettings: vi.fn().mockResolvedValue(undefined),
  isLlmConfigured: vi.fn().mockReturnValue(false),
};

vi.mock('../src/main/auth', () => ({ AuthService: vi.fn(() => authServiceInstance) }));
vi.mock('../src/main/settings', () => ({ SettingsManager: vi.fn(() => settingsManagerInstance) }));
vi.mock('../src/main/recording', () => ({ RecordingService: vi.fn(() => ({ dispose: vi.fn(), removeAllListeners: vi.fn(), on: vi.fn(), setIgnoredShortcuts: vi.fn(), startRecording: vi.fn(), stopRecording: vi.fn(), pauseRecording: vi.fn(), resumeRecording: vi.fn(), getState: vi.fn().mockReturnValue({}) })) }));
vi.mock('../src/main/screenshot', () => ({ ScreenshotService: vi.fn(() => ({ dispose: vi.fn(), takeScreenshot: vi.fn(), getDisplays: vi.fn(), getWindows: vi.fn() })) }));
vi.mock('../src/main/chat', () => ({ ChatService: vi.fn(() => ({ sendMessage: vi.fn() })) }));
vi.mock('../src/main/cloud-upload', () => ({ CloudUploadService: vi.fn(() => ({ beginSession: vi.fn(), on: vi.fn(), enqueueImage: vi.fn(), setAudioPath: vi.fn(), finishUpload: vi.fn(), uploadRecording: vi.fn() })) }));
vi.mock('../src/main/context-watcher', () => ({ ContextWatcherService: vi.fn(() => ({ getActiveContext: vi.fn().mockResolvedValue(null), getLastActiveContext: vi.fn().mockReturnValue(null), configure: vi.fn(), removeAllListeners: vi.fn(), on: vi.fn(), start: vi.fn(), stop: vi.fn(), forceMatchCheck: vi.fn() })) }));
vi.mock('../src/main/smart-annotation', () => ({ SmartAnnotationService: vi.fn(() => ({ clearQueue: vi.fn(), annotateWorkflow: vi.fn() })) }));
vi.mock('../src/main/audio-capture', () => ({ AudioCaptureService: vi.fn(() => ({ dispose: vi.fn(), getDevices: vi.fn().mockResolvedValue([]), startCapture: vi.fn(), stopCapture: vi.fn(), getIsCapturing: vi.fn().mockReturnValue(false), pauseCapture: vi.fn(), resumeCapture: vi.fn() })) }));
vi.mock('../src/main/transcription', () => ({ TranscriptionService: vi.fn(() => ({ dispose: vi.fn(), transcribe: vi.fn(), alignToSteps: vi.fn() })) }));

describe('setupIpcHandlers', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  it('wires auth callback/logout handlers and forwards auth status changes', async () => {
    const { setupIpcHandlers } = await import('../src/main/ipc-handlers');
    setupIpcHandlers(authServiceInstance as any, settingsManagerInstance as any);

    const sender = { send: vi.fn() };
    const authCallback = handlers.get('auth:handle-callback');
    const logout = handlers.get('auth:logout');

    await expect(authCallback?.({ sender }, 'stept://callback?code=abc')).resolves.toBe(true);
    await expect(logout?.({ sender })).resolves.toEqual({ success: true });

    expect(authServiceInstance.handleCallback).toHaveBeenCalledWith('stept://callback?code=abc');
    expect(authServiceInstance.logout).toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledWith('auth-status-changed', { user: { id: 'user_1' } });
  });

  it('rejects unsafe external URLs and opens allowed ones', async () => {
    const { setupIpcHandlers } = await import('../src/main/ipc-handlers');
    setupIpcHandlers(authServiceInstance as any, settingsManagerInstance as any);

    const openExternal = handlers.get('utility:open-external');

    await expect(openExternal?.({}, 'https://stept.ai/docs')).resolves.toEqual({ success: true });
    await expect(openExternal?.({}, 'javascript:alert(1)')).rejects.toThrow(
      'Failed to open external URL: Protocol javascript: is not allowed. Only https: and mailto: are permitted.',
    );

    expect(shellOpenExternal).toHaveBeenCalledTimes(1);
    expect(shellOpenExternal).toHaveBeenCalledWith('https://stept.ai/docs');
  });

  it('exposes utility metadata handlers', async () => {
    const { setupIpcHandlers } = await import('../src/main/ipc-handlers');
    setupIpcHandlers(authServiceInstance as any, settingsManagerInstance as any);

    expect(await handlers.get('utility:get-version')?.()).toBe('1.2.3');
    expect(await handlers.get('utility:get-platform')?.()).toBe(process.platform);
  });
});
