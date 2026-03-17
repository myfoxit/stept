import type { ActiveGuideState, ContextMatch } from '@/shared/types';
import { DEBUG } from '@/shared/constants';
import * as screenshotDB from '@/shared/storage';

export function debugLog(...args: any[]) {
  if (DEBUG) console.log('[Stept]', ...args);
}

// State object — exact same shape as background.js lines 31-45
export const state = {
  isAuthenticated: false,
  isRecording: false,
  isPaused: false,
  accessToken: null as string | null,
  refreshToken: null as string | null,
  currentUser: null as any,
  userProjects: [] as any[],
  selectedProjectId: null as string | null,
  steps: [] as any[],
  stepCounter: 0,
  recordingStartTime: null as number | null,
  codeVerifier: null as string | null,
  authState: null as string | null,
};

// Module-level variables
export let activeGuideState: ActiveGuideState | null = null;
export let healthBatch: any[] = [];
export let healthBatchWorkflowId: string | null = null;
export let contextMatches: ContextMatch[] = [];
export let lastContextUrl: string | null = null;

export let pendingPreCapture: { dataUrl: string; timestamp: number } | null = null;
export let preCapturePromise: Promise<string | null> | null = null;
export const PRE_CAPTURE_MAX_AGE_MS = 2000;

export let streamingSessionId: string | null = null;
export let streamingUploaded = new Set<number>();
export let streamingQueue: { stepNumber: number; dataUrl: string }[] = [];
export let streamingDraining = false;

export let authReady = false;
export let authReadyPromise: Promise<void>;
export let authReadyResolve: () => void;
authReadyPromise = new Promise<void>((resolve) => {
  authReadyResolve = resolve;
});

export let domSnapshotQueue: { stepNumber: number; snapshotJson: string }[] = [];

export let lastTrackedPage = { tabId: null as number | null, url: null as string | null, time: 0 };
export let lastUserActionTime = 0;

// Setter functions for module-level lets
export function setActiveGuideState(gs: ActiveGuideState | null) { activeGuideState = gs; }
export function setHealthBatch(b: any[]) { healthBatch = b; }
export function setHealthBatchWorkflowId(id: string | null) { healthBatchWorkflowId = id; }
export function setContextMatches(m: ContextMatch[]) { contextMatches = m; }
export function setLastContextUrl(u: string | null) { lastContextUrl = u; }
export function setPendingPreCapture(p: { dataUrl: string; timestamp: number } | null) { pendingPreCapture = p; }
export function setPreCapturePromise(p: Promise<string | null> | null) { preCapturePromise = p; }
export function setStreamingSessionId(id: string | null) { streamingSessionId = id; }
export function setStreamingUploaded(s: Set<number>) { streamingUploaded = s; }
export function setStreamingQueue(q: { stepNumber: number; dataUrl: string }[]) { streamingQueue = q; }
export function setStreamingDraining(d: boolean) { streamingDraining = d; }
export function setAuthReady(r: boolean) { authReady = r; }
export function setDomSnapshotQueue(q: { stepNumber: number; snapshotJson: string }[]) { domSnapshotQueue = q; }
export function setLastTrackedPage(p: { tabId: number | null; url: string | null; time: number }) { lastTrackedPage = p; }
export function setLastUserActionTime(t: number) { lastUserActionTime = t; }

// Persistence functions — exact copies from background.js
export async function persistAuth(): Promise<void> {
  await chrome.storage.local.set({
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    currentUser: state.currentUser,
    userProjects: state.userProjects,
  });
}

export async function persistRecordingState(): Promise<void> {
  await chrome.storage.local.set({
    isRecording: state.isRecording,
    isPaused: state.isPaused,
    recordingStartTime: state.recordingStartTime,
    stepCounter: state.stepCounter,
    selectedProjectId: state.selectedProjectId,
  });
}

export async function persistSteps(): Promise<void> {
  try {
    for (const step of state.steps) {
      if (step.screenshotDataUrl && !step.screenshotDataUrl.startsWith('idb:')) {
        const stepId = `step_${step.stepNumber}`;
        await screenshotDB.saveScreenshot(stepId, step.screenshotDataUrl).catch(() => {});
      }
    }

    const lightweight = state.steps.map((s: any) => ({
      ...s,
      screenshotDataUrl: s.screenshotDataUrl
        ? (s.screenshotDataUrl.startsWith('idb:') ? s.screenshotDataUrl : `idb:step_${s.stepNumber}`)
        : null,
    }));
    await chrome.storage.local.set({ persistedSteps: lightweight });
  } catch (e) {
    debugLog('Steps persistence failed:', e);
    const lightweight = state.steps.map((s: any) => ({
      ...s,
      screenshotDataUrl: null,
    }));
    await chrome.storage.local.set({ persistedSteps: lightweight }).catch(() => {});
  }
}

export async function clearPersistedSteps(): Promise<void> {
  await chrome.storage.local.remove('persistedSteps');
  await screenshotDB.clearAllScreenshots().catch(() => {});
}

export function notifyGuideStateUpdate(): void {
  chrome.runtime.sendMessage({
    type: 'GUIDE_STATE_UPDATE',
    guideState: activeGuideState,
  }).catch(() => {});

  if (activeGuideState) {
    chrome.storage.session.set({
      guideProgress: {
        guideId: activeGuideState.guide?.id,
        guide: activeGuideState.guide,
        currentIndex: activeGuideState.currentIndex,
        tabId: activeGuideState.tabId,
      },
    }).catch(() => {});
  } else {
    chrome.storage.session.remove('guideProgress').catch(() => {});
  }
}

export function resetStreamingState(): void {
  streamingSessionId = null;
  streamingUploaded = new Set();
  streamingQueue = [];
  streamingDraining = false;
  domSnapshotQueue = [];
}

export function markUserAction(): void {
  lastUserActionTime = Date.now();
}
