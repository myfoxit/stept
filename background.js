const DEFAULT_API_BASE_URL = 'http://localhost:8000/api/v1';
const MAX_STEPS = 100;
const DEBUG = false;

function debugLog(...args) {
  if (DEBUG) console.log('[Ondoki]', ...args);
}

// Get API base URL from storage
async function getApiBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiBaseUrl'], (result) => {
      resolve(result.apiBaseUrl || DEFAULT_API_BASE_URL);
    });
  });
}

// State management
let state = {
  isAuthenticated: false,
  isRecording: false,
  isPaused: false,
  accessToken: null,
  refreshToken: null,
  currentUser: null,
  userProjects: [],
  selectedProjectId: null,
  steps: [],
  stepCounter: 0,
  recordingStartTime: null,
  codeVerifier: null,
  authState: null,
};

// Track whether initial auth restore is done
let authReady = false;
let authReadyPromise;
let authReadyResolve;
authReadyPromise = new Promise(resolve => { authReadyResolve = resolve; });

// Initialize state from storage — restore ALL auth state
chrome.storage.local.get(
  ['accessToken', 'refreshToken', 'currentUser', 'userProjects', 'selectedProjectId', 'isRecording', 'recordingStartTime', 'stepCounter'],
  async (result) => {
    if (result.selectedProjectId) {
      state.selectedProjectId = result.selectedProjectId;
    }
    if (result.isRecording) {
      state.isRecording = true;
      state.recordingStartTime = result.recordingStartTime || Date.now();
      state.stepCounter = result.stepCounter || 0;
      chrome.action.setBadgeText({ text: 'REC' });
      chrome.action.setBadgeBackgroundColor({ color: '#D94F3D' });
    }

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

    authReady = true;
    authReadyResolve();
  },
);

// Helper to persist auth state
async function persistAuth() {
  await chrome.storage.local.set({
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    currentUser: state.currentUser,
    userProjects: state.userProjects,
  });
}

// Helper to persist recording state
async function persistRecordingState() {
  await chrome.storage.local.set({
    isRecording: state.isRecording,
    recordingStartTime: state.recordingStartTime,
    stepCounter: state.stepCounter,
    selectedProjectId: state.selectedProjectId,
  });
}

// PKCE helpers
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

function generateState() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function base64UrlEncode(array) {
  const base64 = btoa(String.fromCharCode(...array));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Token refresh helper
async function refreshAccessToken() {
  if (!state.refreshToken) return false;
  const API_BASE_URL = await getApiBaseUrl();

  try {
    const response = await fetch(`${API_BASE_URL}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: state.refreshToken,
      }),
    });

    if (response.ok) {
      const tokenData = await response.json();
      state.accessToken = tokenData.access_token;
      state.refreshToken = tokenData.refresh_token;
      state.isAuthenticated = true;
      await persistAuth();
      return true;
    }
  } catch (error) {
    debugLog('Token refresh failed:', error);
  }
  return false;
}

// Authenticated fetch with automatic token refresh on 401
async function authedFetch(url, options = {}) {
  // Ensure we have a token before making the request
  if (!state.accessToken && state.refreshToken) {
    await refreshAccessToken();
  }
  if (!state.accessToken) {
    throw new Error('Not authenticated');
  }

  options.headers = options.headers || {};
  options.headers['Authorization'] = `Bearer ${state.accessToken}`;

  let response = await fetch(url, options);

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      options.headers['Authorization'] = `Bearer ${state.accessToken}`;
      response = await fetch(url, options);
    }
  }

  return response;
}

// Authentication
async function initiateLogin() {
  const API_BASE_URL = await getApiBaseUrl();
  state.codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(state.codeVerifier);
  state.authState = generateState();

  const redirectUrl = chrome.identity.getRedirectURL('callback');

  const authUrl =
    `${API_BASE_URL}/auth/authorize?` +
    `response_type=code&` +
    `code_challenge=${encodeURIComponent(codeChallenge)}&` +
    `code_challenge_method=S256&` +
    `redirect_uri=${encodeURIComponent(redirectUrl)}&` +
    `state=${encodeURIComponent(state.authState)}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        try {
          const success = await handleAuthCallback(responseUrl);
          resolve(success);
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

async function handleAuthCallback(callbackUrl) {
  const API_BASE_URL = await getApiBaseUrl();
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  if (returnedState !== state.authState) {
    throw new Error('State mismatch - possible CSRF attack');
  }

  if (!code) {
    throw new Error('No authorization code received');
  }

  const redirectUrl = chrome.identity.getRedirectURL('callback');

  const response = await fetch(`${API_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      code_verifier: state.codeVerifier,
      redirect_uri: redirectUrl,
    }),
  });

  if (!response.ok) {
    throw new Error('Token exchange failed');
  }

  const tokenData = await response.json();
  state.accessToken = tokenData.access_token;
  state.refreshToken = tokenData.refresh_token;
  state.isAuthenticated = true;

  state.codeVerifier = null;
  state.authState = null;

  await fetchUserInfo();
  await fetchUserProjects();
  await persistAuth();

  return true;
}

async function tryAutoLogin() {
  if (!state.refreshToken) return false;

  try {
    const API_BASE_URL = await getApiBaseUrl();
    const response = await fetch(`${API_BASE_URL}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: state.refreshToken,
      }),
    });

    if (response.ok) {
      const tokenData = await response.json();
      state.accessToken = tokenData.access_token;
      state.refreshToken = tokenData.refresh_token;
      state.isAuthenticated = true;

      await fetchUserInfo();
      await fetchUserProjects();
      await persistAuth();
      return true;
    }
  } catch (error) {
    debugLog('Auto-login failed:', error);
  }

  await chrome.storage.local.remove(['refreshToken', 'accessToken', 'currentUser', 'userProjects']);
  state.refreshToken = null;
  state.accessToken = null;
  state.isAuthenticated = false;
  return false;
}

async function logout() {
  try {
    if (state.refreshToken) {
      const API_BASE_URL = await getApiBaseUrl();
      await fetch(`${API_BASE_URL}/auth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: state.refreshToken }),
      });
    }
  } catch (error) {
    debugLog('Revoke error:', error);
  }

  state.isAuthenticated = false;
  state.accessToken = null;
  state.refreshToken = null;
  state.currentUser = null;
  state.userProjects = [];
  state.selectedProjectId = null;

  await chrome.storage.local.remove(['refreshToken', 'accessToken', 'currentUser', 'userProjects', 'selectedProjectId']);
}

async function fetchUserInfo() {
  if (!state.accessToken) return;

  try {
    const API_BASE_URL = await getApiBaseUrl();
    const response = await authedFetch(`${API_BASE_URL}/auth/me`);

    if (response.ok) {
      state.currentUser = await response.json();
    }
  } catch (error) {
    debugLog('Failed to fetch user info:', error);
  }
}

async function fetchUserProjects() {
  if (!state.accessToken || !state.currentUser) return;

  try {
    const API_BASE_URL = await getApiBaseUrl();
    const response = await authedFetch(
      `${API_BASE_URL}/projects/${state.currentUser.id}`,
    );

    if (response.ok) {
      state.userProjects = await response.json();
    }
  } catch (error) {
    debugLog('Failed to fetch projects:', error);
  }
}

// Ensure content script is injected and alive in a tab
async function ensureContentScript(tabId) {
  try {
    // First try pinging the existing content script
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' }).catch(() => null);
    if (response && response.alive) return true;
  } catch (e) {
    // No content script, need to inject
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    // Small delay for script to initialize
    await new Promise(r => setTimeout(r, 50));
    return true;
  } catch (e) {
    debugLog('Failed to inject content script into tab', tabId, e);
    return false;
  }
}

// Recording functions
function startRecording(projectId) {
  state.isRecording = true;
  state.isPaused = false;
  state.selectedProjectId = projectId;
  state.steps = [];
  state.stepCounter = 0;
  state.recordingStartTime = Date.now();

  chrome.storage.local.set({ selectedProjectId: projectId });
  persistRecordingState();

  // Inject content script into ALL open http/https tabs
  chrome.tabs.query({}, async (tabs) => {
    for (const tab of tabs) {
      if (
        tab.id &&
        tab.url &&
        (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
      ) {
        const injected = await ensureContentScript(tab.id);
        if (injected) {
          chrome.tabs.sendMessage(tab.id, { type: 'START_RECORDING' }).catch(() => {});
        }
      }
    }
  });

  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#D94F3D' });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
    }
  });
}

function stopRecording() {
  state.isRecording = false;
  state.isPaused = false;
  persistRecordingState();

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (
        tab.id &&
        tab.url &&
        (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
      ) {
        chrome.tabs
          .sendMessage(tab.id, { type: 'STOP_RECORDING' })
          .catch(() => {});
      }
    });
  });

  chrome.action.setBadgeText({ text: '' });
}

function pauseRecording() {
  state.isPaused = true;
  chrome.action.setBadgeText({ text: 'II' });
  chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
}

function resumeRecording() {
  state.isPaused = false;
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#D94F3D' });
}

async function captureScreenshot() {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 70 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        debugLog('Screenshot capture failed:', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(dataUrl);
    });
  });
}

// Draw a coral click marker on the screenshot at the given position
async function drawClickMarker(screenshotDataUrl, clickPos, viewportSize) {
  try {
    const response = await fetch(screenshotDataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);

    // Scale click position from viewport to actual image size
    const scaleX = bitmap.width / viewportSize.width;
    const scaleY = bitmap.height / viewportSize.height;
    const x = clickPos.x * scaleX;
    const y = clickPos.y * scaleY;

    // Green click marker matching ondoki-web style
    const radius = 16 * scaleX;

    // Outer glow
    ctx.beginPath();
    ctx.arc(x, y, radius + 8 * scaleX, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
    ctx.fill();

    // Outer ring
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
    ctx.fill();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2 * scaleX;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(x, y, 4 * scaleX, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();

    const resultBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(resultBlob);
    });
  } catch (e) {
    debugLog('Failed to draw click marker:', e);
    return screenshotDataUrl;
  }
}

async function addStep(stepData) {
  if (!state.isRecording || state.isPaused) return;

  if (state.steps.length >= MAX_STEPS) {
    debugLog(`Max steps (${MAX_STEPS}) reached, ignoring new step`);
    return;
  }

  state.stepCounter++;

  // Only capture screenshot for click events, not navigations or typing
  let screenshot = null;
  const isClickAction = stepData.actionType && stepData.actionType.includes('Click');

  if (isClickAction) {
    screenshot = await captureScreenshot();
  }

  const step = {
    stepNumber: state.stepCounter,
    timestamp: new Date().toISOString(),
    actionType: stepData.actionType,
    windowTitle: stepData.pageTitle,
    description: stepData.description,
    screenshotDataUrl: screenshot,
    globalMousePosition: stepData.globalPosition,
    relativeMousePosition: stepData.relativePosition,
    windowSize: stepData.windowSize,
    screenshotRelativeMousePosition: stepData.clickPosition,
    screenshotSize: stepData.viewportSize,
    textTyped: stepData.textTyped,
    url: stepData.url,
    elementInfo: stepData.elementInfo,
  };

  state.steps.push(step);
  debugLog('Step added:', step.stepNumber, step.actionType);

  chrome.runtime
    .sendMessage({ type: 'STEP_ADDED', step: step })
    .catch(() => {});
}

function deleteStep(stepNumber) {
  state.steps = state.steps.filter((s) => s.stepNumber !== stepNumber);
  state.steps.forEach((step, index) => {
    step.stepNumber = index + 1;
  });
  state.stepCounter = state.steps.length;
}

// Cloud upload
async function uploadCapture() {
  if (!state.accessToken || state.steps.length === 0) {
    return { success: false, error: 'No steps to upload or not authenticated' };
  }

  const API_BASE_URL = await getApiBaseUrl();

  try {
    const sessionResponse = await authedFetch(
      `${API_BASE_URL}/process-recording/session/create`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          client: 'OndokiChromeExtension',
          user_id: state.currentUser?.id,
          project_id: state.selectedProjectId,
        }),
      },
    );

    if (!sessionResponse.ok) {
      throw new Error('Failed to create upload session');
    }

    const { sessionId } = await sessionResponse.json();

    const metadata = state.steps.map((s) => ({
      stepNumber: s.stepNumber,
      timestamp: s.timestamp,
      actionType: s.actionType,
      windowTitle: s.windowTitle,
      description: s.description,
      globalPosition: s.globalMousePosition,
      relativePosition: s.relativeMousePosition,
      windowSize: s.windowSize,
      screenshotRelativePosition: s.screenshotRelativeMousePosition,
      screenshotSize: s.screenshotSize,
      textTyped: s.textTyped,
      url: s.url,
      elementInfo: s.elementInfo,
    }));

    const metadataResponse = await authedFetch(
      `${API_BASE_URL}/process-recording/session/${sessionId}/metadata`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!metadataResponse.ok) {
      throw new Error('Failed to upload metadata');
    }

    for (const step of state.steps) {
      if (step.screenshotDataUrl) {
        const blob = await dataUrlToBlob(step.screenshotDataUrl);
        const formData = new FormData();
        formData.append('file', blob, `step_${step.stepNumber}.png`);
        formData.append('stepNumber', step.stepNumber.toString());

        const imageResponse = await authedFetch(
          `${API_BASE_URL}/process-recording/session/${sessionId}/image`,
          {
            method: 'POST',
            body: formData,
          },
        );

        if (!imageResponse.ok) {
          throw new Error(`Failed to upload image for step ${step.stepNumber}`);
        }
      }
    }

    await authedFetch(
      `${API_BASE_URL}/process-recording/session/${sessionId}/finalize`,
      {
        method: 'POST',
      },
    );

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

// Message handling
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
        });
        break;

      case 'LOGIN':
        try {
          const success = await initiateLogin();
          sendResponse({ success });
        } catch (error) {
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

      case 'CLICK_EVENT':
        await addStep(message.data);
        sendResponse({ success: true });
        break;

      case 'TYPE_EVENT':
        await addStep(message.data);
        sendResponse({ success: true });
        break;

      case 'GET_STEPS':
        sendResponse({ steps: state.steps });
        break;

      case 'UPLOAD':
        const result = await uploadCapture();
        sendResponse(result);
        break;

      case 'CLEAR_STEPS':
        state.steps = [];
        state.stepCounter = 0;
        sendResponse({ success: true });
        break;

      case 'DELETE_STEP':
        deleteStep(message.stepNumber);
        sendResponse({ success: true });
        break;

      case 'OPEN_SIDE_PANEL':
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
          }
        });
        sendResponse({ success: true });
        break;

      case 'GET_SETTINGS':
        chrome.storage.local.get(['apiBaseUrl'], (result) => {
          sendResponse({ apiBaseUrl: result.apiBaseUrl || DEFAULT_API_BASE_URL });
        });
        return; // keep channel open

      case 'SET_SETTINGS':
        if (message.apiBaseUrl) {
          await chrome.storage.local.set({ apiBaseUrl: message.apiBaseUrl });
        }
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  return true;
});

// Unified page tracking — covers tab switches and navigations, deduplicates
let lastTrackedPage = { tabId: null, url: null, time: 0 };

async function trackPageChange(tabId, reason) {
  if (!state.isRecording || state.isPaused) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) return;

    // Deduplicate: skip if same tab+url within 2 seconds (tab switch + navigation fire together)
    const now = Date.now();
    if (lastTrackedPage.tabId === tabId && lastTrackedPage.url === tab.url && now - lastTrackedPage.time < 2000) return;
    lastTrackedPage = { tabId, url: tab.url, time: now };

    // Suppress navigate step if the last step was a click or Enter within 3s
    // (the navigation was caused by that action, recording it is redundant)
    if (state.steps.length > 0) {
      const lastStep = state.steps[state.steps.length - 1];
      const lastStepAge = now - new Date(lastStep.timestamp).getTime();
      const wasUserAction = lastStep.actionType?.includes('Click') ||
        (lastStep.actionType === 'Key' && lastStep.description?.includes('Enter'));
      if (wasUserAction && lastStepAge < 3000) {
        debugLog('Suppressing navigate step (caused by recent user action)');
        return;
      }
    }

    await addStep({
      actionType: 'Navigate',
      pageTitle: tab.title || '',
      description: `Navigate to "${tab.title || tab.url}"`,
      url: tab.url,
      windowSize: { width: 0, height: 0 },
      viewportSize: { width: 0, height: 0 },
    });
  } catch (e) {
    debugLog('Page tracking failed:', e);
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  trackPageChange(activeInfo.tabId, 'tab-switch');
});

// Detect new tab creation
chrome.tabs.onCreated.addListener((tab) => {
  if (!state.isRecording || state.isPaused) return;

  state.stepCounter++;
  const step = {
    stepNumber: state.stepCounter,
    timestamp: new Date().toISOString(),
    actionType: 'Navigate',
    windowTitle: 'New Tab',
    description: 'Open new tab',
    screenshotDataUrl: null,
    url: tab.url || 'chrome://newtab',
  };
  state.steps.push(step);
  chrome.runtime.sendMessage({ type: 'STEP_ADDED', step }).catch(() => {});

  // Inject content script into new tab once it loads
  if (tab.id) {
    const injectWhenReady = async (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(injectWhenReady);
        const injected = await ensureContentScript(tab.id);
        if (injected) {
          chrome.tabs.sendMessage(tab.id, { type: 'START_RECORDING' }).catch(() => {});
        }
      }
    };
    chrome.tabs.onUpdated.addListener(injectWhenReady);
  }
});

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return;
  trackPageChange(details.tabId, 'navigation');
});

// Listen for tab updates to inject content script into newly loaded pages
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    state.isRecording &&
    tab.url &&
    (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
  ) {
    const injected = await ensureContentScript(tabId);
    if (injected) {
      chrome.tabs.sendMessage(tabId, {
        type: state.isPaused ? 'PAUSE_RECORDING' : 'START_RECORDING',
      }).catch(() => {});
    }
  }
});

// ─── WebSocket context reporting to Ondoki desktop app ───────────────────────

const WS_URL = 'ws://localhost:18789';
const WS_RECONNECT_INTERVAL = 3000;
const WS_HEARTBEAT_INTERVAL = 5000;

let ws = null;
let wsReconnectTimer = null;
let wsHeartbeatTimer = null;

function sendContext() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      const url = new URL(tab.url);
      ws.send(JSON.stringify({
        type: 'context',
        url: tab.url,
        title: tab.title || '',
        hostname: url.hostname,
      }));
    } catch (e) {
      debugLog('WebSocket sendContext error:', e);
    }
  });
}

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  try {
    ws = new WebSocket(WS_URL);

    ws.addEventListener('open', () => {
      debugLog('WebSocket connected to desktop app');
      sendContext();
    });

    ws.addEventListener('close', () => {
      ws = null;
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // Silently handle — desktop app may not be running
      try { ws.close(); } catch (_) {}
    });
  } catch (e) {
    ws = null;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (wsReconnectTimer) return;
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    connectWebSocket();
  }, WS_RECONNECT_INTERVAL);
}

// Tab change → send context
chrome.tabs.onActivated.addListener(() => {
  sendContext();
});

// URL change → send context
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    sendContext();
  }
});

// Start WebSocket connection and heartbeat
connectWebSocket();
wsHeartbeatTimer = setInterval(sendContext, WS_HEARTBEAT_INTERVAL);
