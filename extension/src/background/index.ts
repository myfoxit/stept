import { BUILD_CONFIG, DEFAULT_API_BASE_URL } from '@/shared/constants';
import * as screenshotDB from '@/shared/storage';
import {
  state, debugLog,
  activeGuideState, setActiveGuideState,
  healthBatch, setHealthBatch,
  healthBatchWorkflowId, setHealthBatchWorkflowId,
  contextMatches, setContextMatches,
  pendingPreCapture, setPendingPreCapture,
  preCapturePromise, setPreCapturePromise,
  streamingSessionId,
  authReady, authReadyPromise, authReadyResolve,
  setAuthReady,
  notifyGuideStateUpdate, persistSteps, clearPersistedSteps, resetStreamingState, markUserAction,
} from './state';
import { getApiBaseUrl, applyDisplayMode } from './settings';
import { initiateLogin, logout, tryAutoLogin, authedFetch, fetchUserInfo, fetchUserProjects, startAuthCheck } from './auth';
import {
  ensureContentScript, startRecording, stopRecording,
  pauseRecording, resumeRecording, captureScreenshotRaw,
  addStep, deleteStep,
} from './recording';
import { uploadCapture, beginStreamingSession, enqueueStreamingUpload, enqueueDomSnapshotUpload } from './upload';
import { getReplayStartIndex, broadcastGuideState, computePaused, advanceStepIndex, isNavigateLikeStep, urlMatchesStep } from './guides';
import { trackPageChange, checkContextLinks } from './navigation';

function createGuideSessionId(): string {
  return `guide_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function guideTargetUrl(guide: any, stepIndex: number): string | null {
  return guide?.steps?.[stepIndex]?.expected_url || null;
}

// ──────────────────────────────────────────────────────────────
// Initialize state from storage — restore ALL auth state
// ──────────────────────────────────────────────────────────────
chrome.storage.local.get(
  [
    'accessToken',
    'refreshToken',
    'currentUser',
    'userProjects',
    'selectedProjectId',
    'isRecording',
    'isPaused',
    'recordingStartTime',
    'stepCounter',
    'persistedSteps',
  ],
  async (result) => {
    // Restore PKCE state from session storage (survives SW restart, clears on browser close)
    try {
      const pkce = await chrome.storage.session.get(['pkceCodeVerifier', 'pkceAuthState']);
      if (pkce.pkceCodeVerifier) state.codeVerifier = pkce.pkceCodeVerifier;
      if (pkce.pkceAuthState) state.authState = pkce.pkceAuthState;
    } catch (e) {
      debugLog('Failed to restore PKCE state:', e);
    }

    // Feature 7: Restore guide progress from session storage
    try {
      const gp = await chrome.storage.session.get(['guideProgress']);
      if (gp.guideProgress && gp.guideProgress.guide) {
        setActiveGuideState({
          guide: gp.guideProgress.guide,
          currentIndex: gp.guideProgress.currentIndex || 0,
          tabId: gp.guideProgress.tabId,
        });
        debugLog('Restored guide progress:', activeGuideState);
      }
    } catch (e) {
      debugLog('Failed to restore guide progress:', e);
    }

    if (result.selectedProjectId) {
      state.selectedProjectId = result.selectedProjectId;
    }
    if (result.isRecording) {
      state.isRecording = true;
      state.isPaused = result.isPaused || false;
      state.recordingStartTime = result.recordingStartTime || Date.now();
      state.stepCounter = result.stepCounter || 0;
      if (state.isPaused) {
        chrome.action.setBadgeText({ text: 'II' });
        chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
      } else {
        chrome.action.setBadgeText({ text: 'REC' });
        chrome.action.setBadgeBackgroundColor({ color: '#3ab08a' });
      }
    }

    // Restore persisted steps (survives SW restarts)
    if (result.persistedSteps && Array.isArray(result.persistedSteps)) {
      state.steps = result.persistedSteps;
      state.stepCounter = Math.max(state.stepCounter, state.steps.length);

      // Restore screenshots from IndexedDB
      try {
        const screenshots = await screenshotDB.getAllScreenshots();
        for (const step of state.steps) {
          if (step.screenshotDataUrl && step.screenshotDataUrl.startsWith('idb:')) {
            const stepId = step.screenshotDataUrl.replace('idb:', '');
            if (screenshots[stepId]) {
              step.screenshotDataUrl = screenshots[stepId];
            }
          }
        }
      } catch (e) {
        debugLog('Failed to restore screenshots from IDB:', e);
      }
    }

    // Migrate any old screenshots from chrome.storage to IndexedDB
    await screenshotDB.migrateFromChromeStorage().catch(() => {});

    if (result.refreshToken) {
      state.refreshToken = result.refreshToken;
      state.accessToken = result.accessToken || null;
      state.currentUser = result.currentUser || null;
      state.userProjects = result.userProjects || [];

      if (state.accessToken && state.currentUser) {
        // We have cached auth — assume valid, will refresh on 401
        state.isAuthenticated = true;
        debugLog('Auth restored from storage');
      } else {
        // Only have refresh token — do a full refresh
        await tryAutoLogin();
      }
    }

    // BUG-C001: First-run check — prompt user to configure API URL if not set (self-hosted only)
    if (BUILD_CONFIG.mode === 'self-hosted') {
      const apiCheck = await new Promise<any>((r) =>
        chrome.storage.local.get(['apiBaseUrl'], r),
      );
      if (!apiCheck.apiBaseUrl) {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
        chrome.action.setTitle({
          title: 'Stept — Please configure your API URL in settings',
        });
      }
    }

    setAuthReady(true);
    authReadyResolve();

    // Start periodic auth check to detect expired sessions
    if (state.isAuthenticated) {
      startAuthCheck();
    }

    // Apply display mode on startup
    await applyDisplayMode();

    // Re-inject content scripts into tabs that were being recorded (SW restart recovery)
    if (state.isRecording) {
      chrome.tabs.query({}, async (tabs) => {
        for (const tab of tabs) {
          if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
            const injected = await ensureContentScript(tab.id);
            if (injected) {
              chrome.tabs.sendMessage(tab.id, {
                type: state.isPaused ? 'PAUSE_RECORDING' : 'START_RECORDING',
              }).catch(() => {});

              // Restore dock if in dock mode
              const { displayMode } = await chrome.storage.local.get(['displayMode']);
              if ((displayMode || 'sidepanel') === 'dock') {
                chrome.tabs.sendMessage(tab.id, { type: 'SHOW_DOCK' }).catch(() => {});
              }
            }
          }
        }
      });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// Message handling
// ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'GET_STATE':
        // Wait for auth restore to complete before responding
        if (!authReady) await authReadyPromise;
        sendResponse({
          isAuthenticated: state.isAuthenticated,
          isRecording: state.isRecording,
          isPaused: state.isPaused,
          currentUser: state.currentUser,
          userProjects: state.userProjects,
          selectedProjectId: state.selectedProjectId,
          stepCount: state.steps.length,
          recordingStartTime: state.recordingStartTime,
          accessToken: state.accessToken,
        });
        break;

      case 'LOGIN':
        try {
          const success = await initiateLogin();
          sendResponse({ success });
        } catch (error: any) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'LOGOUT':
        await logout();
        sendResponse({ success: true });
        break;

      case 'START_RECORDING':
        startRecording(message.projectId);
        sendResponse({ success: true });
        break;

      case 'STOP_RECORDING':
        stopRecording();
        sendResponse({ success: true });
        break;

      case 'PAUSE_RECORDING':
        pauseRecording();
        sendResponse({ success: true });
        break;

      case 'RESUME_RECORDING':
        resumeRecording();
        sendResponse({ success: true });
        break;

      case 'PRE_CAPTURE': {
        // Capture screenshot immediately at pointerdown, before click effects propagate.
        // Uses captureScreenshotRaw() directly — no dock hide/show round-trip for speed.
        // Stores a Promise so CLICK_EVENT can await it if it arrives before capture completes.
        const promise = (async () => {
          try {
            // Temporarily hide dock inline (sync CSS, no message round-trip)
            if (sender.tab?.id) {
              chrome.tabs.sendMessage(sender.tab.id, { type: 'HIDE_DOCK_TEMP' }).catch(() => {});
            }
            const dataUrl = await captureScreenshotRaw();
            if (sender.tab?.id) {
              chrome.tabs.sendMessage(sender.tab.id, { type: 'SHOW_DOCK_TEMP' }).catch(() => {});
            }
            if (dataUrl) {
              setPendingPreCapture({ dataUrl, timestamp: Date.now() });
            }
            return dataUrl;
          } catch (e) {
            debugLog('Pre-capture failed:', e);
            setPendingPreCapture(null);
            return null;
          }
        })();
        setPreCapturePromise(promise);
        promise.then((dataUrl) => {
          sendResponse({ dataUrl: dataUrl || null });
          setPreCapturePromise(null);
        });
        break;
      }

      case 'CLICK_EVENT': {
        markUserAction();
        // Extract domSnapshot before addStep (too large for step storage)
        const domSnapshot = message.data?.domSnapshot;
        delete message.data.domSnapshot;
        await addStep(message.data);
        // Queue snapshot for upload alongside the screenshot
        if (domSnapshot && streamingSessionId) {
          enqueueDomSnapshotUpload(state.stepCounter, domSnapshot);
        }
        sendResponse({ success: true });
        break;
      }

      case 'TYPE_EVENT': {
        // Enter/Tab can trigger navigations (form submits, link activation)
        if (message.data?.actionType === 'Key' && /Enter|Tab/.test(message.data.description || '')) {
          markUserAction();
        }
        // Extract domSnapshot before addStep (too large for step storage)
        const typeDomSnapshot = message.data?.domSnapshot;
        delete message.data?.domSnapshot;
        // For Type actions with typed text, capture a screenshot showing the result
        // This makes typing steps visual (like click steps) instead of text-only
        if (message.data?.actionType === 'Type' && message.data.textTyped) {
          try {
            const screenshot = await captureScreenshotRaw();
            if (screenshot) {
              // Promote from text step to visual step with screenshot
              message.data._typeScreenshot = screenshot;
              // Use element center as the relative position if we have elementRect
              const ei = message.data.elementInfo;
              if (ei?.elementRect && message.data.windowSize) {
                message.data.clickPosition = {
                  x: ei.elementRect.x + ei.elementRect.width / 2,
                  y: ei.elementRect.y + ei.elementRect.height / 2,
                };
                message.data.viewportSize = {
                  width: message.data.windowSize.width,
                  height: message.data.windowSize.height,
                };
              }
            }
          } catch (e) {
            debugLog('Type screenshot failed:', e);
          }
        }
        await addStep(message.data);
        // Queue DOM snapshot for upload alongside the screenshot
        if (typeDomSnapshot && streamingSessionId) {
          enqueueDomSnapshotUpload(state.stepCounter, typeDomSnapshot);
        }
        sendResponse({ success: true });
        break;
      }

      case 'GET_STEPS':
        sendResponse({ steps: state.steps });
        break;

      case 'UPLOAD': {
        const result = await uploadCapture();
        sendResponse(result);
        break;
      }

      case 'CLEAR_STEPS':
        state.steps = [];
        state.stepCounter = 0;
        clearPersistedSteps();
        resetStreamingState();
        sendResponse({ success: true });
        break;

      case 'DELETE_STEP':
        deleteStep(message.stepNumber);
        sendResponse({ success: true });
        break;

      case 'SET_STEP_DESCRIPTION':
        if (message.stepIndex >= 0 && message.stepIndex < state.steps.length) {
          state.steps[message.stepIndex].description = message.description;
          persistSteps();
        }
        sendResponse({ success: true });
        break;

      case 'REORDER_STEPS': {
        const { fromIndex, toIndex } = message;
        if (fromIndex >= 0 && fromIndex < state.steps.length && toIndex >= 0 && toIndex < state.steps.length) {
          const [moved] = state.steps.splice(fromIndex, 1);
          state.steps.splice(toIndex, 0, moved);
          // Renumber step_number fields
          state.steps.forEach((s: any, i: number) => { s.step_number = i + 1; });
          persistSteps();
        }
        sendResponse({ steps: state.steps });
        break;
      }

      case 'OPEN_SIDE_PANEL':
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
          }
        });
        sendResponse({ success: true });
        break;

      case 'GET_SETTINGS':
        chrome.storage.local.get(['apiBaseUrl', 'frontendUrl', 'displayMode', 'autoUpload'], (result) => {
          const apiBase = result.apiBaseUrl || DEFAULT_API_BASE_URL;
          const defaultFrontend = apiBase.replace('/api/v1', '');
          sendResponse({
            apiBaseUrl: apiBase,
            frontendUrl: result.frontendUrl || defaultFrontend,
            displayMode: result.displayMode || 'sidepanel',
            autoUpload: result.autoUpload !== false,
            buildMode: BUILD_CONFIG.mode,
          });
        });
        return; // keep channel open

      case 'API_FETCH': {
        try {
          const resp = await authedFetch(message.url, { method: message.method || 'GET' });
          if (resp.ok) {
            sendResponse(await resp.json());
          } else {
            sendResponse(null);
          }
        } catch (e: any) {
          debugLog('API_FETCH error:', e.message);
          sendResponse(null);
        }
        break;
      }

      case 'API_FETCH_BLOB': {
        try {
          let fetchUrl = message.url;
          if (fetchUrl.startsWith('/api/') || fetchUrl.startsWith('/v1/')) {
            const API_BASE_URL = await getApiBaseUrl();
            const baseOrigin = new URL(API_BASE_URL).origin;
            fetchUrl = baseOrigin + fetchUrl;
          }
          debugLog('API_FETCH_BLOB fetching:', fetchUrl);
          const resp = await authedFetch(fetchUrl, { redirect: 'follow' });
          debugLog('API_FETCH_BLOB status:', resp.status, resp.statusText);
          if (resp.ok) {
            const blob = await resp.blob();
            debugLog('API_FETCH_BLOB blob size:', blob.size, 'type:', blob.type);
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            sendResponse({ dataUrl });
          } else {
            debugLog('API_FETCH_BLOB failed:', resp.status, await resp.text().catch(() => ''));
            sendResponse({ error: `HTTP ${resp.status}` });
          }
        } catch (e: any) {
          debugLog('API_FETCH_BLOB error:', e.message);
          sendResponse({ error: e.message });
        }
        break;
      }

      case 'SET_SETTINGS':
        if (message.apiBaseUrl) {
          await chrome.storage.local.set({ apiBaseUrl: message.apiBaseUrl });
          // BUG-C001: Clear the first-run badge once API URL is configured
          if (!state.isRecording) {
            chrome.action.setBadgeText({ text: '' });
            chrome.action.setTitle({ title: '' });
          }
        }
        if (message.autoUpload !== undefined) {
          await chrome.storage.local.set({ autoUpload: message.autoUpload });
        }
        if (message.frontendUrl !== undefined) {
          await chrome.storage.local.set({ frontendUrl: message.frontendUrl });
        }
        sendResponse({ success: true });
        break;

      case 'GET_REDACTION_SETTINGS': {
        const stored = await chrome.storage.local.get(['redactionSettings']);
        sendResponse(stored.redactionSettings || {
          enabled: false,
          formFields: false,
          emails: false,
          names: false,
          numbers: false,
        });
        break;
      }

      case 'SET_REDACTION_SETTINGS':
        await chrome.storage.local.set({ redactionSettings: message.settings });
        sendResponse({ success: true });
        break;

      case 'GET_CONTEXT_MATCHES':
        sendResponse({ matches: contextMatches });
        break;

      case 'CHECK_CONTEXT_LINKS':
        await checkContextLinks(message.url);
        sendResponse({ matches: contextMatches });
        break;

      case 'OPEN_RESOURCE': {
        const settings = await chrome.storage.local.get(['frontendUrl', 'apiBaseUrl']);
        const baseUrl = settings.frontendUrl || (settings.apiBaseUrl || '').replace('/api/v1', '') || 'http://localhost:5173';
        const path = message.resourceType === 'workflow' ? 'workflow' : 'documents';
        chrome.tabs.create({ url: `${baseUrl}/${path}/${message.resourceId}` });
        sendResponse({ success: true });
        break;
      }

      case 'SET_DISPLAY_MODE':
        await chrome.storage.local.set({ displayMode: message.displayMode });
        await applyDisplayMode();
        sendResponse({ success: true });
        break;

      case 'SHOW_DOCK':
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (tabs[0]?.id) {
            await ensureContentScript(tabs[0].id);
            chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_DOCK' }).catch(() => {});
          }
        });
        sendResponse({ success: true });
        break;

      case 'HIDE_DOCK':
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
              chrome.tabs.sendMessage(tab.id, { type: 'HIDE_DOCK' }).catch(() => {});
            }
          });
        });
        sendResponse({ success: true });
        break;

      case 'TOGGLE_SMART_BLUR':
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (tabs[0]?.id) {
            await ensureContentScript(tabs[0].id);
            const result = await chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_SMART_BLUR' }).catch(() => ({}));
            sendResponse({ success: true, isOpen: (result as any)?.isOpen });
          } else {
            sendResponse({ success: false });
          }
        });
        return; // keep channel open for async response

      // ── Interactive Guides ──────────────────────────────────

      case 'FETCH_GUIDES': {
        try {
          const API_BASE_URL = await getApiBaseUrl();
          const resp = await authedFetch(
            `${API_BASE_URL}/guides?project_id=${encodeURIComponent(message.projectId)}`,
          );
          if (resp.ok) {
            sendResponse({ success: true, guides: await resp.json() });
          } else {
            sendResponse({ success: false, error: 'Failed to fetch guides' });
          }
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'FETCH_GUIDE': {
        try {
          const API_BASE_URL = await getApiBaseUrl();
          const resp = await authedFetch(`${API_BASE_URL}/guides/${message.guideId}`);
          if (resp.ok) {
            sendResponse({ success: true, guide: await resp.json() });
          } else {
            sendResponse({ success: false, error: 'Guide not found' });
          }
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'FETCH_WORKFLOW_GUIDE': {
        try {
          const API_BASE_URL = await getApiBaseUrl();
          const resp = await authedFetch(
            `${API_BASE_URL}/process-recording/workflow/${encodeURIComponent(message.workflowId)}/interactive-guide`,
          );
          if (resp.ok) {
            sendResponse({ success: true, guide: await resp.json() });
          } else {
            sendResponse({ success: false, error: 'No guide found for this workflow' });
          }
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'START_GUIDE': {
        try {
          setHealthBatch([]);
          setHealthBatchWorkflowId(null);

          const guide = message.guide;
          const requestedIndex = message.startIndex || 0;
          const replayStartIndex = getReplayStartIndex(guide, requestedIndex);
          const targetUrl = guideTargetUrl(guide, replayStartIndex);
          const sessionId = createGuideSessionId();

          let tabId: number | null = null;

          if (targetUrl) {
            try {
              const expected = new URL(targetUrl);
              const allTabs = await chrome.tabs.query({ currentWindow: true });
              const match = allTabs.find((t) => {
                try {
                  const u = new URL(t.url || '');
                  return u.origin === expected.origin && u.pathname === expected.pathname;
                } catch { return false; }
              });
              if (match?.id) {
                tabId = match.id;
                await chrome.tabs.update(tabId, { active: true });
              }
            } catch {}
          }

          if (!tabId) {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            tabId = activeTab?.id ?? null;
          }

          if (!tabId && targetUrl) {
            const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
            tabId = newTab.id ?? null;
          }

          if (!tabId) {
            sendResponse({ success: false, error: 'No active tab' });
            break;
          }

          setActiveGuideState({ guide, currentIndex: replayStartIndex, tabId, sessionId, targetUrl, paused: false });

          let needsNavigation = false;
          if (targetUrl) {
            try {
              const tab = await chrome.tabs.get(tabId);
              const expected = new URL(targetUrl);
              const current = new URL(tab.url || '');
              needsNavigation = expected.origin !== current.origin || expected.pathname !== current.pathname || expected.search !== current.search;
            } catch {
              needsNavigation = true;
            }
          }

          if (needsNavigation && targetUrl) {
            await chrome.tabs.update(tabId, { url: targetUrl, active: true });
            // Navigation will trigger onCompleted → broadcastGuideState via GUIDE_RUNTIME_READY
          } else {
            await chrome.tabs.update(tabId, { active: true }).catch(() => {});
            broadcastGuideState(tabId);
          }

          notifyGuideStateUpdate();
          sendResponse({ success: true, sessionId, tabId, startIndex: replayStartIndex });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'STOP_GUIDE': {
        try {
          const tabId = activeGuideState?.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
          setActiveGuideState(null);
          broadcastGuideState(tabId);
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'GUIDE_STEP_HEALTH': {
        // Staleness detection: collect step health data during guide replay
        if (!healthBatchWorkflowId && message.workflowId) {
          setHealthBatchWorkflowId(message.workflowId);
        }
        healthBatch.push({
          stepNumber: message.stepNumber,
          elementFound: message.elementFound,
          finderMethod: message.finderMethod,
          finderConfidence: message.finderConfidence,
          expectedUrl: message.expectedUrl,
          actualUrl: message.actualUrl,
          urlMatched: message.urlMatched,
          timestamp: message.timestamp,
        });
        sendResponse({ success: true });
        break;
      }

      case 'GUIDE_STEP_COMPLETED': {
        if (!activeGuideState || (message.sessionId && message.sessionId !== activeGuideState.sessionId)) {
          sendResponse({ success: true });
          break;
        }

        const nextIdx = advanceStepIndex(activeGuideState.guide, activeGuideState.currentIndex + 1);
        if (nextIdx === -1) {
          // Guide complete — flush health batch
          if (healthBatch.length > 0) {
            const batch = [...healthBatch];
            const workflowId = healthBatchWorkflowId || activeGuideState.guide?.workflow_id || activeGuideState.guide?.workflowId || activeGuideState.guide?.id;
            setHealthBatch([]);
            setHealthBatchWorkflowId(null);
            if (workflowId) {
              (async () => {
                try {
                  const API_BASE_URL = await getApiBaseUrl();
                  await authedFetch(`${API_BASE_URL}/workflows/${encodeURIComponent(workflowId)}/health-check`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ steps: batch, source: 'guide_replay' }),
                  });
                } catch (e: any) {
                  debugLog('Health check POST failed (non-fatal):', e.message);
                }
              })();
            }
          }
          const completedTabId = activeGuideState.tabId;
          setActiveGuideState(null);
          broadcastGuideState(completedTabId);
          sendResponse({ success: true });
          break;
        }

        // Check if next step needs navigation
        const nextStep = activeGuideState.guide.steps?.[nextIdx];
        const nextTargetUrl = nextStep?.expected_url;
        let paused = false;

        if (nextTargetUrl) {
          try {
            const tab = await chrome.tabs.get(activeGuideState.tabId);
            paused = !urlMatchesStep(tab.url || '', nextStep);
          } catch {
            paused = true;
          }
        }

        setActiveGuideState({
          ...activeGuideState,
          currentIndex: nextIdx,
          stepStatus: 'active',
          targetUrl: nextTargetUrl || null,
          paused,
        });

        if (paused && nextTargetUrl) {
          // Navigate to the target URL; onCompleted/GUIDE_RUNTIME_READY will broadcast
          await chrome.tabs.update(activeGuideState.tabId, { url: nextTargetUrl, active: true }).catch(() => {});
        } else {
          broadcastGuideState(activeGuideState.tabId);
        }

        notifyGuideStateUpdate();
        sendResponse({ success: true });
        break;
      }

      case 'GUIDE_STEP_CHANGED': {
        // Legacy: still accept step-changed from old runners for backwards compat
        if (activeGuideState && (!message.sessionId || message.sessionId === activeGuideState.sessionId)) {
          setActiveGuideState({
            ...activeGuideState,
            currentIndex: message.currentIndex,
            stepStatus: message.stepStatus || 'active',
            targetUrl: guideTargetUrl(activeGuideState.guide, message.currentIndex),
          });
        }
        notifyGuideStateUpdate();
        sendResponse({ success: true });
        break;
      }

      case 'GUIDE_STOPPED': {
        // Staleness detection: flush health batch to backend (fire-and-forget)
        if (healthBatch.length > 0) {
          const batch = [...healthBatch];
          const workflowId = healthBatchWorkflowId || activeGuideState?.guide?.workflow_id || activeGuideState?.guide?.workflowId || activeGuideState?.guide?.id;
          setHealthBatch([]);
          setHealthBatchWorkflowId(null);
          if (workflowId) {
            (async () => {
              try {
                const API_BASE_URL = await getApiBaseUrl();
                await authedFetch(`${API_BASE_URL}/workflows/${encodeURIComponent(workflowId)}/health-check`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ steps: batch, source: 'guide_replay' }),
                });
              } catch (e: any) {
                debugLog('Health check POST failed (non-fatal):', e.message);
              }
            })();
          }
        }
        setActiveGuideState(null);
        notifyGuideStateUpdate();
        sendResponse({ success: true });
        break;
      }

      case 'GUIDE_NAVIGATE': {
        try {
          const tabId = activeGuideState?.tabId;
          if (!tabId || !message.url) {
            sendResponse({ success: false, error: 'No active guide tab or URL' });
            break;
          }
          const guide = activeGuideState?.guide;
          const stepIndex = message.stepIndex || activeGuideState?.currentIndex || 0;
          await chrome.tabs.update(tabId, { url: message.url, active: true });
          // Navigation listeners will call _injectGuideNow when the page loads
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'GUIDE_GO_TO_STEP': {
        try {
          if (!activeGuideState) {
            sendResponse({ success: false, error: 'No active guide' });
            break;
          }
          const stepIndex = message.stepIndex;
          const guide = activeGuideState.guide;
          const tabId = activeGuideState.tabId;

          const targetStep = guide.steps?.[stepIndex];
          const targetUrl = targetStep?.expected_url;
          let needsNavigation = false;

          if (targetUrl && tabId) {
            try {
              const tab = await chrome.tabs.get(tabId);
              needsNavigation = !urlMatchesStep(tab.url || '', targetStep);
            } catch {}
          }

          setActiveGuideState({
            ...activeGuideState,
            currentIndex: stepIndex,
            paused: needsNavigation,
          });

          if (needsNavigation && targetUrl) {
            await chrome.tabs.update(tabId, { url: targetUrl, active: true });
            // Navigation → GUIDE_RUNTIME_READY → broadcastGuideState
          } else {
            await chrome.tabs.update(tabId, { active: true }).catch(() => {});
            broadcastGuideState(tabId);
          }

          notifyGuideStateUpdate();
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'GUIDE_SHOW_IMAGE': {
        try {
          const tabId = activeGuideState?.tabId;
          if (tabId) {
            await chrome.tabs.sendMessage(tabId, {
              type: 'GUIDE_SHOW_IMAGE',
              dataUrl: message.dataUrl,
            });
          }
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'GUIDE_FIND_IN_FRAMES': {
        // Feature 4: Broadcast element search to all frames of a tab
        try {
          const tabId = message.tabId || activeGuideState?.tabId;
          if (!tabId) { sendResponse({ found: false }); break; }
          const frames = await chrome.webNavigation.getAllFrames({ tabId });
          const results: any[] = [];
          for (const frame of frames!) {
            if (frame.frameId === 0) continue; // skip top frame
            try {
              const resp = await chrome.tabs.sendMessage(tabId, {
                type: 'GUIDE_FIND_IN_FRAME',
                step: message.step,
              }, { frameId: frame.frameId });
              if (resp && (resp as any).found) {
                results.push(resp);
              }
            } catch {} // frame may not have listener
          }
          // Pick best match by confidence
          if (results.length > 0) {
            results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
            sendResponse(results[0]);
          } else {
            sendResponse({ found: false });
          }
        } catch (e) {
          sendResponse({ found: false });
        }
        break;
      }

      case 'GUIDE_RUNTIME_READY': {
        try {
          if (activeGuideState && sender.tab?.id === activeGuideState.tabId) {
            // Compute paused from current URL
            const url = message.url || '';
            const paused = computePaused(url, activeGuideState.guide, activeGuideState.currentIndex);
            setActiveGuideState({ ...activeGuideState, paused });
            broadcastGuideState(sender.tab.id);
          }
          sendResponse({ success: true });
        } catch (e: any) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'GET_GUIDE_STATE': {
        sendResponse({ guideState: activeGuideState });
        break;
      }

      case 'GUIDE_RECOVER_ELEMENT': {
        try {
          const API_BASE_URL = await getApiBaseUrl();
          const baseOrigin = new URL(API_BASE_URL).origin;
          const resp = await authedFetch(`${baseOrigin}/api/v1/guide/recover-element`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              target: message.target,
              page_elements: message.pageElements,
              workflow_id: message.workflowId,
              step_index: message.stepIndex,
            }),
          });
          if (resp.ok) {
            sendResponse(await resp.json());
          } else {
            sendResponse({ error: `Recovery API failed: ${resp.status}` });
          }
        } catch (e: any) {
          debugLog('GUIDE_RECOVER_ELEMENT error:', e.message);
          sendResponse({ error: e.message });
        }
        break;
      }

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  return true;
});

// ──────────────────────────────────────────────────────────────
// Event listeners
// ──────────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  trackPageChange(activeInfo.tabId, 'tab-switch');

  // Check context links for active tab
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    checkContextLinks(tab.url!);
  } catch (e) {}

  // Broadcast guide state when switching to the guide tab
  if (activeGuideState?.tabId === activeInfo.tabId && activeGuideState?.guide) {
    broadcastGuideState(activeInfo.tabId);
  }

  // Show dock on switched-to tab in dock mode
  if (state.isRecording) {
    const { displayMode } = await chrome.storage.local.get(['displayMode']);
    if ((displayMode || 'sidepanel') === 'dock') {
      await ensureContentScript(activeInfo.tabId);
      chrome.tabs.sendMessage(activeInfo.tabId, { type: 'SHOW_DOCK' }).catch(() => {});
    }
  }
});

// Detect new tab creation
chrome.tabs.onCreated.addListener((tab) => {
  if (!state.isRecording || state.isPaused) return;

  // Never record "Open new tab" -- it adds no value to guides and causes
  // problems in interactive replay (no element to highlight, no screenshot).
  // The subsequent Navigate step captures where the user actually went.

  // Inject content script into new tab once it loads
  if (tab.id) {
    const tabId = tab.id;
    const injectWhenReady = async (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(injectWhenReady);
        const injected = await ensureContentScript(tabId);
        if (injected) {
          chrome.tabs
            .sendMessage(tabId, { type: 'START_RECORDING' })
            .catch(() => {});
        }
      }
    };
    chrome.tabs.onUpdated.addListener(injectWhenReady);
  }
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  trackPageChange(details.tabId, 'navigation');
  if (details.url) checkContextLinks(details.url);

  if (activeGuideState?.tabId === details.tabId && activeGuideState?.guide) {
    const paused = computePaused(details.url || '', activeGuideState.guide, activeGuideState.currentIndex);
    setActiveGuideState({ ...activeGuideState, paused });
    broadcastGuideState(details.tabId);
  }
});

chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return;
  trackPageChange(details.tabId, 'history');
  if (details.url) checkContextLinks(details.url);

  if (activeGuideState?.tabId === details.tabId && activeGuideState?.guide) {
    const paused = computePaused(details.url || '', activeGuideState.guide, activeGuideState.currentIndex);
    setActiveGuideState({ ...activeGuideState, paused });
    broadcastGuideState(details.tabId);
  }
});

// Broadcast guide state when the window regains focus
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  if (!activeGuideState?.tabId || !activeGuideState?.guide) return;
  try {
    const tab = await chrome.tabs.get(activeGuideState.tabId);
    if (tab.windowId === windowId) {
      broadcastGuideState(activeGuideState.tabId);
    }
  } catch {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    state.isRecording &&
    tab.url &&
    (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
  ) {
    const injected = await ensureContentScript(tabId);
    if (injected) {
      chrome.tabs
        .sendMessage(tabId, {
          type: state.isPaused ? 'PAUSE_RECORDING' : 'START_RECORDING',
        })
        .catch(() => {});

      // Re-apply active redaction on the new page
      chrome.tabs.sendMessage(tabId, { type: 'APPLY_REDACTION' }).catch(() => {});

      // Show dock on newly loaded tabs in dock mode
      const { displayMode } = await chrome.storage.local.get(['displayMode']);
      if ((displayMode || 'sidepanel') === 'dock') {
        chrome.tabs.sendMessage(tabId, { type: 'SHOW_DOCK' }).catch(() => {});
      }
    }
  }
});

// Keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-recording') {
    if (state.isRecording) {
      stopRecording();
    } else if (state.selectedProjectId) {
      startRecording(state.selectedProjectId);
    } else {
      debugLog('Cannot start recording — no project selected');
    }
  } else if (command === 'pause-recording') {
    if (state.isRecording) {
      if (state.isPaused) {
        resumeRecording();
      } else {
        pauseRecording();
      }
    }
  }
});
