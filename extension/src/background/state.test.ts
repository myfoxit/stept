jest.mock('@/shared/storage', () => ({
  saveScreenshot: jest.fn(),
  clearAllScreenshots: jest.fn(),
}));

import * as screenshotDB from '@/shared/storage';
import {
  PRE_CAPTURE_MAX_AGE_MS,
  activeGuideState,
  authReady,
  clearPersistedSteps,
  domSnapshotQueue,
  lastUserActionTime,
  markUserAction,
  notifyGuideStateUpdate,
  persistAuth,
  persistRecordingState,
  persistSteps,
  resetStreamingState,
  setActiveGuideState,
  setAuthReady,
  setDomSnapshotQueue,
  setLastUserActionTime,
  setStreamingDraining,
  setStreamingQueue,
  setStreamingSessionId,
  setStreamingUploaded,
  state,
  streamingDraining,
  streamingQueue,
  streamingSessionId,
  streamingUploaded,
} from './state';

describe('background/state', () => {
  const localSet = jest.fn().mockResolvedValue(undefined);
  const localRemove = jest.fn().mockResolvedValue(undefined);
  const sessionSet = jest.fn().mockResolvedValue(undefined);
  const sessionRemove = jest.fn().mockResolvedValue(undefined);
  const sendMessage = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(screenshotDB.saveScreenshot).mockResolvedValue(undefined);
    jest.mocked(screenshotDB.clearAllScreenshots).mockResolvedValue(undefined);
    (globalThis as any).chrome = {
      storage: {
        local: { set: localSet, remove: localRemove },
        session: { set: sessionSet, remove: sessionRemove },
      },
      runtime: { sendMessage },
    };

    state.accessToken = 'access';
    state.refreshToken = 'refresh';
    state.currentUser = { id: 'user_1' };
    state.userProjects = [{ id: 'proj_1' }];
    state.isRecording = true;
    state.isPaused = false;
    state.recordingStartTime = 1234;
    state.stepCounter = 2;
    state.selectedProjectId = 'proj_1';
    state.steps = [];

    setActiveGuideState(null);
    setStreamingSessionId('session_1');
    setStreamingUploaded(new Set([1, 2]));
    setStreamingQueue([{ stepNumber: 3, dataUrl: 'data:image/png;base64,abc' }]);
    setStreamingDraining(true);
    setDomSnapshotQueue([{ stepNumber: 1, snapshotJson: '{}' }]);
    setAuthReady(false);
    setLastUserActionTime(0);
  });

  it('persists auth state to chrome local storage', async () => {
    await persistAuth();

    expect(localSet).toHaveBeenCalledWith({
      accessToken: 'access',
      refreshToken: 'refresh',
      currentUser: { id: 'user_1' },
      userProjects: [{ id: 'proj_1' }],
    });
  });

  it('persists recording state fields without mutating them', async () => {
    await persistRecordingState();

    expect(localSet).toHaveBeenCalledWith({
      isRecording: true,
      isPaused: false,
      recordingStartTime: 1234,
      stepCounter: 2,
      selectedProjectId: 'proj_1',
    });
  });

  it('stores screenshots in IDB and persists lightweight step references', async () => {
    state.steps = [
      { stepNumber: 1, screenshotDataUrl: 'data:image/png;base64,aaa', description: 'one' },
      { stepNumber: 2, screenshotDataUrl: 'idb:step_2', description: 'two' },
      { stepNumber: 3, screenshotDataUrl: null, description: 'three' },
    ];

    await persistSteps();

    expect(screenshotDB.saveScreenshot).toHaveBeenCalledTimes(1);
    expect(screenshotDB.saveScreenshot).toHaveBeenCalledWith('step_1', 'data:image/png;base64,aaa');
    expect(localSet).toHaveBeenCalledWith({
      persistedSteps: [
        { stepNumber: 1, screenshotDataUrl: 'idb:step_1', description: 'one' },
        { stepNumber: 2, screenshotDataUrl: 'idb:step_2', description: 'two' },
        { stepNumber: 3, screenshotDataUrl: null, description: 'three' },
      ],
    });
  });

  it('falls back to metadata-only persistence when final storage write fails', async () => {
    state.steps = [
      { stepNumber: 7, screenshotDataUrl: 'data:image/png;base64,broken', description: 'broken' },
    ];
    localSet.mockRejectedValueOnce(new Error('quota exceeded')).mockResolvedValueOnce(undefined);

    await persistSteps();

    expect(localSet).toHaveBeenLastCalledWith({
      persistedSteps: [
        { stepNumber: 7, screenshotDataUrl: null, description: 'broken' },
      ],
    });
  });

  it('clears persisted steps from both chrome storage and indexeddb', async () => {
    await clearPersistedSteps();

    expect(localRemove).toHaveBeenCalledWith('persistedSteps');
    expect(screenshotDB.clearAllScreenshots).toHaveBeenCalled();
  });

  it('notifies guide progress updates and mirrors state into session storage', () => {
    setActiveGuideState({
      guide: { id: 'guide_1', steps: [] } as any,
      currentIndex: 4,
      tabId: 99,
    });

    notifyGuideStateUpdate();

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'GUIDE_STATE_UPDATE',
      guideState: activeGuideState,
    });
    expect(sessionSet).toHaveBeenCalledWith({
      guideProgress: {
        guideId: 'guide_1',
        guide: activeGuideState?.guide,
        currentIndex: 4,
        tabId: 99,
      },
    });
  });

  it('removes session guide progress when guide state is cleared', () => {
    notifyGuideStateUpdate();

    expect(sessionRemove).toHaveBeenCalledWith('guideProgress');
  });

  it('resets streaming-related module state', () => {
    resetStreamingState();

    expect(authReady).toBe(false);
    expect(PRE_CAPTURE_MAX_AGE_MS).toBe(2000);
    expect(Array.from(streamingUploaded)).toEqual([]);
    expect(streamingSessionId).toBeNull();
    expect(streamingQueue).toEqual([]);
    expect(streamingDraining).toBe(false);
    expect(domSnapshotQueue).toEqual([]);
  });

  it('marks user activity with the current timestamp', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-28T10:00:00Z'));

    markUserAction();

    expect(lastUserActionTime).toBe(new Date('2026-03-28T10:00:00Z').getTime());
    jest.useRealTimers();
  });
});
