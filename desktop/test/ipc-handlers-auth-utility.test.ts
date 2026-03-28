
const handlers = new Map<string, Function>();
const shellOpenExternal = jest.fn().mockResolvedValue(undefined);
const appOn = jest.fn();
const appGetVersion = jest.fn().mockReturnValue('1.2.3');

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel: string, fn: Function) => handlers.set(channel, fn)),
  },
  shell: {
    openExternal: shellOpenExternal,
  },
  app: {
    on: appOn,
    emit: jest.fn(),
    getVersion: appGetVersion,
  },
  BrowserWindow: {
    getAllWindows: jest.fn().mockReturnValue([]),
  },
  Notification: {
    isSupported: jest.fn().mockReturnValue(false),
  },
  webContents: {
    getAllWebContents: jest.fn().mockReturnValue([]),
  },
}));

const authServiceInstance = {
  getAccessToken: jest.fn().mockReturnValue('token_1'),
  getStatus: jest.fn().mockResolvedValue({ user: { id: 'user_1' } }),
  initiateLogin: jest.fn().mockResolvedValue(undefined),
  handleCallback: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  tryAutoLogin: jest.fn().mockResolvedValue(true),
  on: jest.fn(),
};

const settingsManagerInstance = {
  getSettings: jest.fn().mockReturnValue({
    cloudEndpoint: 'https://api.stept.ai/api/v1',
    chatApiUrl: 'https://api.stept.ai/api/v1',
  }),
  saveSettings: jest.fn().mockResolvedValue(undefined),
  resetSettings: jest.fn().mockResolvedValue(undefined),
  isLlmConfigured: jest.fn().mockReturnValue(false),
};

jest.mock('../src/main/auth', () => ({ AuthService: jest.fn(() => authServiceInstance) }));
jest.mock('../src/main/settings', () => ({ SettingsManager: jest.fn(() => settingsManagerInstance) }));
jest.mock('../src/main/recording', () => ({ RecordingService: jest.fn(() => ({ dispose: jest.fn(), removeAllListeners: jest.fn(), on: jest.fn(), setIgnoredShortcuts: jest.fn(), startRecording: jest.fn(), stopRecording: jest.fn(), pauseRecording: jest.fn(), resumeRecording: jest.fn(), getState: jest.fn().mockReturnValue({}) })) }));
jest.mock('../src/main/screenshot', () => ({ ScreenshotService: jest.fn(() => ({ dispose: jest.fn(), takeScreenshot: jest.fn(), getDisplays: jest.fn(), getWindows: jest.fn() })) }));
jest.mock('../src/main/chat', () => ({ ChatService: jest.fn(() => ({ sendMessage: jest.fn() })) }));
jest.mock('../src/main/cloud-upload', () => ({ CloudUploadService: jest.fn(() => ({ beginSession: jest.fn(), on: jest.fn(), enqueueImage: jest.fn(), setAudioPath: jest.fn(), finishUpload: jest.fn(), uploadRecording: jest.fn() })) }));
jest.mock('../src/main/context-watcher', () => ({ ContextWatcherService: jest.fn(() => ({ getActiveContext: jest.fn().mockResolvedValue(null), getLastActiveContext: jest.fn().mockReturnValue(null), configure: jest.fn(), removeAllListeners: jest.fn(), on: jest.fn(), start: jest.fn(), stop: jest.fn(), forceMatchCheck: jest.fn() })) }));
jest.mock('../src/main/smart-annotation', () => ({ SmartAnnotationService: jest.fn(() => ({ clearQueue: jest.fn(), annotateWorkflow: jest.fn() })) }));
jest.mock('../src/main/audio-capture', () => ({ AudioCaptureService: jest.fn(() => ({ dispose: jest.fn(), getDevices: jest.fn().mockResolvedValue([]), startCapture: jest.fn(), stopCapture: jest.fn(), getIsCapturing: jest.fn().mockReturnValue(false), pauseCapture: jest.fn(), resumeCapture: jest.fn() })) }));
jest.mock('../src/main/transcription', () => ({ TranscriptionService: jest.fn(() => ({ dispose: jest.fn(), transcribe: jest.fn(), alignToSteps: jest.fn() })) }));

describe('setupIpcHandlers', () => {
  beforeEach(() => {
    handlers.clear();
    jest.clearAllMocks();
  });

  it('wires auth callback/logout handlers and forwards auth status changes', async () => {
    const { setupIpcHandlers } = await import('../src/main/ipc-handlers');
    setupIpcHandlers(authServiceInstance as any, settingsManagerInstance as any);

    const sender = { send: jest.fn() };
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
