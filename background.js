importScripts('storage.js');
importScripts('context.js');

// Build configuration — change mode to 'cloud' for Chrome Web Store build
const BUILD_CONFIG = {
  mode: 'self-hosted', // 'self-hosted' or 'cloud'
  cloudApiUrl: 'https://app.ondoki.io/api/v1',
  defaultApiUrl: 'http://localhost:8000/api/v1',
};

const DEFAULT_API_BASE_URL = BUILD_CONFIG.mode === 'cloud'
  ? BUILD_CONFIG.cloudApiUrl
  : BUILD_CONFIG.defaultApiUrl;
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

// Active guide state for sidepanel sync
let activeGuideState = null; // { guide, currentIndex, tabId }

function notifyGuideStateUpdate() {
  // Send guide state to all extension views (sidepanel)
  chrome.runtime.sendMessage({
    type: 'GUIDE_STATE_UPDATE',
    guideState: activeGuideState,
  }).catch(() => {});
}

// Helper: inject guide-runtime and start guide on a tab that's already loaded
async function _injectGuideNow(tabId, guide, startIndex) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['guide-runtime.js'] });
  await new Promise(r => setTimeout(r, 200));
  await chrome.tabs.sendMessage(tabId, { type: 'START_GUIDE', guide, startIndex });
}

// Helper: wait for tab to finish loading, then inject guide
function _injectGuideAfterLoad(tabId, guide, startIndex) {
  const onCompleted = (details) => {
    if (details.tabId !== tabId || details.frameId !== 0) return;
    chrome.webNavigation.onCompleted.removeListener(onCompleted);
    // Wait extra for SPA hydration / JS frameworks to render
    setTimeout(async () => {
      try {
        await _injectGuideNow(tabId, guide, startIndex);
      } catch (e) { debugLog('Guide inject after load failed:', e); }
    }, 1500);
  };
  chrome.webNavigation.onCompleted.addListener(onCompleted);
}

// Context link matches for the current tab
let contextMatches = [];
let lastContextUrl = null;

// Pre-captured screenshot state — taken at pointerdown before click effects
let pendingPreCapture = null; // { dataUrl, timestamp }
let preCapturePromise = null; // In-flight pre-capture Promise (so CLICK_EVENT can await it)
const PRE_CAPTURE_MAX_AGE_MS = 2000; // Discard pre-captures older than 2s

// Streaming upload state — images upload in background during recording
let streamingSessionId = null;
let streamingUploaded = new Set(); // stepNumbers already uploaded
let streamingQueue = []; // { stepNumber, dataUrl } pending upload
let streamingDraining = false;
const STREAMING_CONCURRENCY = 2;

// Track whether initial auth restore is done
let authReady = false;
let authReadyPromise;
let authReadyResolve;
authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve;
});

// Initialize state from storage — restore ALL auth state
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
        const screenshots = await self.screenshotDB.getAllScreenshots();
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
    await self.screenshotDB.migrateFromChromeStorage().catch(() => {});

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
      const apiCheck = await new Promise((r) =>
        chrome.storage.local.get(['apiBaseUrl'], r),
      );
      if (!apiCheck.apiBaseUrl) {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
        chrome.action.setTitle({
          title: 'Ondoki — Please configure your API URL in settings',
        });
      }
    }

    authReady = true;
    authReadyResolve();

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

// Switch between popup (dock mode) and sidePanel (sidepanel mode)
async function applyDisplayMode() {
  const { displayMode } = await chrome.storage.local.get(['displayMode']);
  const mode = displayMode || 'sidepanel';
  if (mode === 'sidepanel') {
    // Clicking icon opens side panel
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    chrome.action.setPopup({ popup: '' }); // disable popup
  } else {
    // Clicking icon opens popup
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    chrome.action.setPopup({ popup: 'popup.html' });
  }
}

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
    isPaused: state.isPaused,
    recordingStartTime: state.recordingStartTime,
    stepCounter: state.stepCounter,
    selectedProjectId: state.selectedProjectId,
  });
}

// Helper to persist steps to storage (survives SW termination)
// Screenshots are stored in IndexedDB — only metadata goes to chrome.storage
async function persistSteps() {
  try {
    // Save screenshots to IndexedDB, keep only references in chrome.storage
    for (const step of state.steps) {
      if (step.screenshotDataUrl && !step.screenshotDataUrl.startsWith('idb:')) {
        const stepId = `step_${step.stepNumber}`;
        await self.screenshotDB.saveScreenshot(stepId, step.screenshotDataUrl).catch(() => {});
      }
    }

    const lightweight = state.steps.map((s) => ({
      ...s,
      screenshotDataUrl: s.screenshotDataUrl
        ? (s.screenshotDataUrl.startsWith('idb:') ? s.screenshotDataUrl : `idb:step_${s.stepNumber}`)
        : null,
    }));
    await chrome.storage.local.set({ persistedSteps: lightweight });
  } catch (e) {
    debugLog('Steps persistence failed:', e);
    const lightweight = state.steps.map((s) => ({
      ...s,
      screenshotDataUrl: null,
    }));
    await chrome.storage.local.set({ persistedSteps: lightweight }).catch(() => {});
  }
}

// Helper to clear persisted steps from storage
async function clearPersistedSteps() {
  await chrome.storage.local.remove('persistedSteps');
  await self.screenshotDB.clearAllScreenshots().catch(() => {});
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

  // Persist PKCE state to survive SW termination
  await chrome.storage.session.set({
    pkceCodeVerifier: state.codeVerifier,
    pkceAuthState: state.authState,
  });

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

  // Restore PKCE state from session storage if service worker restarted during auth flow
  // (common on Windows where SW is terminated aggressively after ~30s idle)
  if (!state.codeVerifier || !state.authState) {
    try {
      const pkce = await chrome.storage.session.get(['pkceCodeVerifier', 'pkceAuthState']);
      if (pkce.pkceCodeVerifier) state.codeVerifier = pkce.pkceCodeVerifier;
      if (pkce.pkceAuthState) state.authState = pkce.pkceAuthState;
      debugLog('Restored PKCE state from session storage after SW restart');
    } catch (e) {
      debugLog('Failed to restore PKCE state:', e);
    }
  }

  if (!state.codeVerifier) {
    throw new Error('PKCE code verifier lost — please try logging in again');
  }

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
  chrome.storage.session.remove(['pkceCodeVerifier', 'pkceAuthState']).catch(() => {});

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

    // Auth error (401/403) — token is invalid, clear auth
    if (response.status === 401 || response.status === 403) {
      debugLog('Auto-login auth rejected:', response.status);
      await chrome.storage.local.remove([
        'refreshToken',
        'accessToken',
        'currentUser',
        'userProjects',
      ]);
      state.refreshToken = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      return false;
    }

    // Other server error (500, etc) — keep tokens, don't logout
    debugLog('Auto-login server error:', response.status);
    return false;
  } catch (error) {
    // Network error (offline, DNS, timeout) — keep tokens intact
    debugLog('Auto-login network error:', error.message);
    return false;
  }
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

  await chrome.storage.local.remove([
    'refreshToken',
    'accessToken',
    'currentUser',
    'userProjects',
    'selectedProjectId',
  ]);
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
    const response = await chrome.tabs
      .sendMessage(tabId, { type: 'PING' })
      .catch(() => null);
    if (response && response.alive) return true;
  } catch (e) {
    // No content script, need to inject
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['vendor/rrweb-snapshot.min.js', 'redaction.js', 'content.js'],
    });
    // Small delay for script to initialize
    await new Promise((r) => setTimeout(r, 50));
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
  clearPersistedSteps();
  resetStreamingState();

  // Start streaming upload session in background (non-blocking)
  beginStreamingSession();

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
          chrome.tabs
            .sendMessage(tab.id, { type: 'START_RECORDING' })
            .catch(() => {});
        }
      }
    }
  });

  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#3ab08a' });

  // Open side panel or dock based on display mode
  chrome.storage.local.get(['displayMode'], (result) => {
    const mode = result.displayMode || 'sidepanel';
    if (mode === 'sidepanel') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
        }
      });
    } else {
      // Dock mode — show dock overlay in active tab
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]?.id) {
          await ensureContentScript(tabs[0].id);
          chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_DOCK' }).catch(() => {});
        }
      });
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
        chrome.tabs
          .sendMessage(tab.id, { type: 'HIDE_DOCK' })
          .catch(() => {});
        // Close Smart Blur popup and remove persistent redaction
        chrome.tabs
          .sendMessage(tab.id, { type: 'CLOSE_SMART_BLUR' })
          .catch(() => {});
        chrome.tabs
          .sendMessage(tab.id, { type: 'REMOVE_REDACTION' })
          .catch(() => {});
      }
    });
  });

  chrome.action.setBadgeText({ text: '' });
}

function pauseRecording() {
  state.isPaused = true;
  persistRecordingState();
  chrome.action.setBadgeText({ text: 'II' });
  chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });

  // Broadcast pause to all content scripts to stop capturing
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        chrome.tabs.sendMessage(tab.id, { type: 'PAUSE_RECORDING' }).catch(() => {});
      }
    });
  });
}

function resumeRecording() {
  state.isPaused = false;
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#3ab08a' });

  // Broadcast resume to all content scripts
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (
        tab.id &&
        tab.url &&
        (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
      ) {
        chrome.tabs
          .sendMessage(tab.id, { type: 'RESUME_RECORDING' })
          .catch(() => {});
      }
    });
  });
}

async function captureScreenshotRaw() {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(
      null,
      { format: 'jpeg', quality: 70 },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          debugLog(
            'Screenshot capture failed:',
            chrome.runtime.lastError.message,
          );
          resolve(null);
          return;
        }
        resolve(dataUrl);
      },
    );
  });
}

// Capture screenshot — redaction is now persistent on the page (Smart Blur),
// so we only need to hide the dock overlay temporarily.
async function captureScreenshot() {
  const activeTab = await new Promise(r =>
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => r(tabs[0])),
  );
  if (activeTab?.id) {
    await chrome.tabs.sendMessage(activeTab.id, { type: 'HIDE_DOCK_TEMP' }).catch(() => {});
    await new Promise(r => setTimeout(r, 50));
  }

  const screenshot = await captureScreenshotRaw();

  if (activeTab?.id) {
    await chrome.tabs.sendMessage(activeTab.id, { type: 'SHOW_DOCK_TEMP' }).catch(() => {});
  }

  return screenshot;
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

    const resultBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.7,
    });
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
    // MISS-C003: Notify popup/sidepanel that the step limit has been reached
    chrome.runtime
      .sendMessage({
        type: 'MAX_STEPS_REACHED',
        limit: MAX_STEPS,
      })
      .catch(() => {});
    return;
  }

  state.stepCounter++;

  // Only capture screenshot for click events, not navigations or typing
  let screenshot = null;
  const isClickAction =
    stepData.actionType && stepData.actionType.includes('Click');

  if (isClickAction) {
    // Wait for in-flight pre-capture if one is pending (race condition safety)
    if (preCapturePromise) {
      debugLog('Waiting for in-flight pre-capture to complete...');
      await preCapturePromise;
      preCapturePromise = null;
    }

    // Use pre-captured screenshot (taken at pointerdown, before click effects)
    if (pendingPreCapture && (Date.now() - pendingPreCapture.timestamp) < PRE_CAPTURE_MAX_AGE_MS) {
      screenshot = pendingPreCapture.dataUrl;
      pendingPreCapture = null; // Consume it
      debugLog('Using pre-captured screenshot (taken at pointerdown)');
    } else {
      // Fallback: capture now (e.g. if pre-capture failed or timed out)
      pendingPreCapture = null;
      debugLog('Pre-capture unavailable, falling back to post-click capture');
      try {
        screenshot = await captureScreenshot();
      } catch (e) {
        debugLog('Screenshot capture threw:', e);
        screenshot = null;
      }
    }
    // MISS-C002: Notify sidepanel when screenshot capture fails
    if (!screenshot) {
      chrome.runtime
        .sendMessage({
          type: 'SCREENSHOT_FAILED',
          stepNumber: state.stepCounter,
        })
        .catch(() => {});
    }
  }

  // Draw click marker on screenshot if we have click position and viewport size
  if (screenshot && isClickAction && stepData.clickPosition && stepData.viewportSize) {
    try {
      screenshot = await drawClickMarker(screenshot, stepData.clickPosition, stepData.viewportSize);
    } catch (e) {
      debugLog('Click marker drawing failed:', e);
    }
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

  persistSteps();

  // Stream-upload screenshot in background
  if (screenshot) {
    enqueueStreamingUpload(step.stepNumber, step.screenshotDataUrl || screenshot);
  }

  chrome.runtime
    .sendMessage({ type: 'STEP_ADDED', step: step })
    .catch(() => {});

  // Also notify content scripts (for dock step counter)
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        chrome.tabs.sendMessage(tab.id, { type: 'STEP_ADDED', step: step }).catch(() => {});
      }
    });
  });
}

function deleteStep(stepNumber) {
  // Remove screenshot from IndexedDB
  self.screenshotDB.deleteScreenshot(`step_${stepNumber}`).catch(() => {});

  state.steps = state.steps.filter((s) => s.stepNumber !== stepNumber);
  state.steps.forEach((step, index) => {
    step.stepNumber = index + 1;
  });
  state.stepCounter = state.steps.length;
  persistSteps();
}

// ------------------------------------------------------------------
// Streaming upload — upload images in background during recording
// ------------------------------------------------------------------

async function beginStreamingSession() {
  if (!state.accessToken || !state.selectedProjectId) return;

  try {
    const API_BASE_URL = await getApiBaseUrl();
    const response = await authedFetch(
      `${API_BASE_URL}/process-recording/session/create`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          client: 'OndokiChromeExtension',
          user_id: state.currentUser?.id,
          project_id: state.selectedProjectId,
        }),
      },
    );

    if (response.ok) {
      const data = await response.json();
      streamingSessionId = data.session_id || data.sessionId;
      debugLog('Streaming session created:', streamingSessionId);
    }
  } catch (e) {
    debugLog('Failed to create streaming session (will batch on upload):', e.message);
    streamingSessionId = null;
  }
}

function enqueueStreamingUpload(stepNumber, dataUrl) {
  if (!streamingSessionId || !dataUrl) return;
  streamingQueue.push({ stepNumber, dataUrl });
  drainStreamingQueue();
}

async function drainStreamingQueue() {
  if (streamingDraining || !streamingSessionId) return;
  streamingDraining = true;

  const API_BASE_URL = await getApiBaseUrl();

  while (streamingQueue.length > 0) {
    const batch = streamingQueue.splice(0, STREAMING_CONCURRENCY);
    await Promise.all(batch.map(async ({ stepNumber, dataUrl }) => {
      try {
        // Resolve IDB references
        let resolvedUrl = dataUrl;
        if (resolvedUrl.startsWith('idb:')) {
          const stepId = resolvedUrl.replace('idb:', '');
          resolvedUrl = await self.screenshotDB.getScreenshot(stepId).catch(() => null);
          if (!resolvedUrl) return;
        }

        const blob = await dataUrlToBlob(resolvedUrl);
        const formData = new FormData();
        formData.append('file', blob, `step_${stepNumber}.jpg`);
        formData.append('stepNumber', stepNumber.toString());

        const response = await authedFetch(
          `${API_BASE_URL}/process-recording/session/${streamingSessionId}/image`,
          { method: 'POST', body: formData },
        );

        if (response.ok) {
          streamingUploaded.add(stepNumber);
          debugLog(`Streamed step ${stepNumber} (${streamingUploaded.size} done)`);
          // Notify UI of progress
          chrome.runtime.sendMessage({
            type: 'UPLOAD_PROGRESS',
            uploaded: streamingUploaded.size,
            total: state.steps.length,
          }).catch(() => {});
        }
      } catch (e) {
        debugLog(`Stream upload failed for step ${stepNumber}:`, e.message);
        // Will be caught by batch upload on finalize
      }
    }));
  }

  streamingDraining = false;
}

function resetStreamingState() {
  streamingSessionId = null;
  streamingUploaded = new Set();
  streamingQueue = [];
  streamingDraining = false;
  domSnapshotQueue = [];
}

// DOM snapshot upload queue
let domSnapshotQueue = [];

function enqueueDomSnapshotUpload(stepNumber, snapshotJson) {
  domSnapshotQueue.push({ stepNumber, snapshotJson });
  drainDomSnapshotQueue();
}

async function drainDomSnapshotQueue() {
  if (domSnapshotQueue.length === 0) return;
  const API_BASE_URL = await getApiBaseUrl();

  while (domSnapshotQueue.length > 0) {
    const { stepNumber, snapshotJson } = domSnapshotQueue.shift();
    try {
      const blob = new Blob([snapshotJson], { type: 'application/json' });
      const formData = new FormData();
      formData.append('file', blob, `step_${stepNumber}_dom.json`);
      formData.append('stepNumber', stepNumber.toString());

      await authedFetch(
        `${API_BASE_URL}/process-recording/session/${streamingSessionId}/dom-snapshot`,
        { method: 'POST', body: formData }
      );
      debugLog(`DOM snapshot uploaded for step ${stepNumber}`);
    } catch (e) {
      debugLog(`DOM snapshot upload failed for step ${stepNumber}:`, e.message);
      // Non-critical — don't retry
    }
  }
}

// Cloud upload
async function uploadCapture() {
  if (!state.accessToken || state.steps.length === 0) {
    return { success: false, error: 'No steps to upload or not authenticated' };
  }

  const API_BASE_URL = await getApiBaseUrl();

  try {
    // Wait for any in-flight streaming uploads to finish
    let drainAttempts = 0;
    while (streamingDraining && drainAttempts < 50) {
      await new Promise((r) => setTimeout(r, 100));
      drainAttempts++;
    }

    // Use existing streaming session or create a new one
    let sessionId = streamingSessionId;
    if (!sessionId) {
      const sessionResponse = await authedFetch(
        `${API_BASE_URL}/process-recording/session/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

      const data = await sessionResponse.json();
      sessionId = data.session_id || data.sessionId;
    }

    // Upload metadata
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      },
    );

    if (!metadataResponse.ok) {
      throw new Error('Failed to upload metadata');
    }

    // Upload any images that weren't streamed yet
    for (const step of state.steps) {
      if (streamingUploaded.has(step.stepNumber)) continue; // Already uploaded
      if (!step.screenshotDataUrl) continue;

      let dataUrl = step.screenshotDataUrl;
      if (dataUrl.startsWith('idb:')) {
        const stepId = dataUrl.replace('idb:', '');
        const fromIdb = await self.screenshotDB.getScreenshot(stepId).catch(() => null);
        if (!fromIdb) {
          debugLog(`Skipping step ${step.stepNumber}: screenshot not found in IDB`);
          continue;
        }
        dataUrl = fromIdb;
      }

      const blob = await dataUrlToBlob(dataUrl);
      const formData = new FormData();
      formData.append('file', blob, `step_${step.stepNumber}.jpg`);
      formData.append('stepNumber', step.stepNumber.toString());

      const imageResponse = await authedFetch(
        `${API_BASE_URL}/process-recording/session/${sessionId}/image`,
        { method: 'POST', body: formData },
      );

      if (!imageResponse.ok) {
        throw new Error(`Failed to upload image for step ${step.stepNumber}`);
      }
    }

    // Finalize
    await authedFetch(
      `${API_BASE_URL}/process-recording/session/${sessionId}/finalize`,
      { method: 'POST' },
    );

    resetStreamingState();
    return { success: true, sessionId };
  } catch (error) {
    resetStreamingState();
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
          accessToken: state.accessToken,
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

      case 'PRE_CAPTURE': {
        // Capture screenshot immediately at pointerdown, before click effects propagate.
        // Uses captureScreenshotRaw() directly — no dock hide/show round-trip for speed.
        // Stores a Promise so CLICK_EVENT can await it if it arrives before capture completes.
        preCapturePromise = (async () => {
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
              pendingPreCapture = { dataUrl, timestamp: Date.now() };
            }
            return dataUrl;
          } catch (e) {
            debugLog('Pre-capture failed:', e);
            pendingPreCapture = null;
            return null;
          }
        })();
        preCapturePromise.then((dataUrl) => {
          sendResponse({ dataUrl: dataUrl || null });
          preCapturePromise = null;
        });
        break;
      }

      case 'CLICK_EVENT': {
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
          state.steps.forEach((s, i) => { s.step_number = i + 1; });
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
        // Authenticated GET request to any API endpoint
        try {
          const resp = await authedFetch(message.url, { method: message.method || 'GET' });
          if (resp.ok) {
            sendResponse(await resp.json());
          } else {
            sendResponse(null);
          }
        } catch (e) {
          debugLog('API_FETCH error:', e.message);
          sendResponse(null);
        }
        break;
      }

      case 'API_FETCH_BLOB': {
        // Authenticated GET that returns image as data URL
        try {
          // Resolve relative URLs against API base
          let fetchUrl = message.url;
          if (fetchUrl.startsWith('/api/')) {
            const API_BASE_URL = await getApiBaseUrl();
            const baseOrigin = new URL(API_BASE_URL).origin;
            fetchUrl = baseOrigin + fetchUrl;
          }
          const resp = await authedFetch(fetchUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            sendResponse({ dataUrl });
          } else {
            sendResponse(null);
          }
        } catch (e) {
          debugLog('API_FETCH_BLOB error:', e.message);
          sendResponse(null);
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
          enabled: true,
          formFields: true,
          emails: true,
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

      case 'SET_DISPLAY_MODE':
        await chrome.storage.local.set({ displayMode: message.displayMode });
        await applyDisplayMode();
        sendResponse({ success: true });
        break;

      case 'SHOW_DOCK':
        // Send message to active tab's content script to show dock
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (tabs[0]?.id) {
            await ensureContentScript(tabs[0].id);
            chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_DOCK' }).catch(() => {});
          }
        });
        sendResponse({ success: true });
        break;

      case 'HIDE_DOCK':
        // Send to all tabs to hide dock
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
        // Route to active tab's content script
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (tabs[0]?.id) {
            await ensureContentScript(tabs[0].id);
            const result = await chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_SMART_BLUR' }).catch(() => ({}));
            sendResponse({ success: true, isOpen: result?.isOpen });
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
        } catch (e) {
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
        } catch (e) {
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
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'START_GUIDE': {
        try {
          const guide = message.guide;
          const startIndex = message.startIndex || 0;
          const targetStep = guide.steps?.[startIndex];
          const targetUrl = targetStep?.expected_url;

          // Find or create the right tab for the guide
          let tabId = message.tabId;

          if (!tabId && targetUrl) {
            // Try to find an existing tab with a matching URL
            try {
              const expectedOrigin = new URL(targetUrl).origin;
              const expectedPath = new URL(targetUrl).pathname;
              const allTabs = await chrome.tabs.query({ currentWindow: true });
              const match = allTabs.find(t => {
                try {
                  const u = new URL(t.url);
                  return u.origin === expectedOrigin && u.pathname === expectedPath;
                } catch { return false; }
              });
              if (match) {
                tabId = match.id;
                await chrome.tabs.update(tabId, { active: true }); // focus the tab
              }
            } catch {}
          }

          if (!tabId) {
            // No matching tab — use active tab or create new
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            tabId = activeTab?.id;
          }

          if (!tabId) {
            sendResponse({ success: false, error: 'No active tab' });
            break;
          }

          // Track active guide state
          activeGuideState = { guide, currentIndex: startIndex, tabId };

          // Check if current tab URL matches the target
          let needsNavigation = false;
          if (targetUrl) {
            try {
              const tab = await chrome.tabs.get(tabId);
              const expected = new URL(targetUrl);
              const current = new URL(tab.url || '');
              needsNavigation = expected.origin !== current.origin || expected.pathname !== current.pathname;
            } catch { needsNavigation = true; }
          }

          if (needsNavigation && targetUrl) {
            // Navigate then inject after full page load
            await chrome.tabs.update(tabId, { url: targetUrl, active: true });
            _injectGuideAfterLoad(tabId, guide, startIndex);
          } else {
            await _injectGuideNow(tabId, guide, startIndex);
          }

          notifyGuideStateUpdate();
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'STOP_GUIDE': {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            await chrome.tabs.sendMessage(tab.id, { type: 'STOP_GUIDE' }).catch(() => {});
          }
          activeGuideState = null;
          notifyGuideStateUpdate();
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'GUIDE_STEP_CHANGED': {
        if (activeGuideState) {
          activeGuideState.currentIndex = message.currentIndex;
        }
        notifyGuideStateUpdate();
        sendResponse({ success: true });
        break;
      }

      case 'GUIDE_STOPPED': {
        activeGuideState = null;
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
          if (guide) {
            _injectGuideAfterLoad(tabId, guide, stepIndex);
          }
          sendResponse({ success: true });
        } catch (e) {
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
          activeGuideState.currentIndex = stepIndex;
          const guide = activeGuideState.guide;
          const tabId = activeGuideState.tabId;

          // Check if step requires navigation
          const targetStep = guide.steps?.[stepIndex];
          const targetUrl = targetStep?.expected_url;
          let needsNavigation = false;

          if (targetUrl && tabId) {
            try {
              const tab = await chrome.tabs.get(tabId);
              const expected = new URL(targetUrl);
              const current = new URL(tab.url);
              needsNavigation = expected.pathname !== current.pathname;
            } catch {}
          }

          if (needsNavigation && targetUrl) {
            await chrome.tabs.update(tabId, { url: targetUrl, active: true });
            _injectGuideAfterLoad(tabId, guide, stepIndex);
          } else {
            // Same page — just tell content to jump to step
            await chrome.tabs.update(tabId, { active: true });
            await _injectGuideNow(tabId, guide, stepIndex);
          }

          notifyGuideStateUpdate();
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case 'GET_GUIDE_STATE': {
        sendResponse({ guideState: activeGuideState });
        break;
      }

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
    if (
      !tab.url ||
      (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))
    )
      return;

    // Deduplicate: skip if same tab+url within 2 seconds (tab switch + navigation fire together)
    const now = Date.now();
    if (
      lastTrackedPage.tabId === tabId &&
      lastTrackedPage.url === tab.url &&
      now - lastTrackedPage.time < 2000
    )
      return;
    lastTrackedPage = { tabId, url: tab.url, time: now };

    // Suppress navigate step if the last step was a click or Enter within 3s
    // (the navigation was caused by that action, recording it is redundant)
    if (state.steps.length > 0) {
      const lastStep = state.steps[state.steps.length - 1];
      const lastStepAge = now - new Date(lastStep.timestamp).getTime();
      const wasUserAction =
        lastStep.actionType?.includes('Click') ||
        (lastStep.actionType === 'Key' &&
          lastStep.description?.includes('Enter'));
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

// Context link matching — query API for matched resources on current tab URL
async function checkContextLinks(tabUrl) {
  if (!state.isAuthenticated || !state.accessToken || !tabUrl) return;
  if (!tabUrl.startsWith('http://') && !tabUrl.startsWith('https://')) return;
  if (tabUrl === lastContextUrl) return;
  lastContextUrl = tabUrl;

  try {
    const API_BASE_URL = await getApiBaseUrl();
    const result = await fetchContextMatches(
      API_BASE_URL, state.accessToken, tabUrl, state.selectedProjectId,
    );
    contextMatches = result.matches || [];

    // Set badge count (only when not recording)
    if (!state.isRecording) {
      if (contextMatches.length > 0) {
        chrome.action.setBadgeText({ text: String(contextMatches.length) });
        chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
      } else {
        chrome.action.setBadgeText({ text: '' });
      }
    }

    // Notify sidepanel
    chrome.runtime.sendMessage({
      type: 'CONTEXT_MATCHES_UPDATED',
      matches: contextMatches,
      url: tabUrl,
    }).catch(() => {});
  } catch (e) {
    debugLog('Context link check failed:', e);
    contextMatches = [];
  }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  trackPageChange(activeInfo.tabId, 'tab-switch');

  // Check context links for active tab
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    checkContextLinks(tab.url);
  } catch (e) {}

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

  addStep({
    actionType: 'Navigate',
    pageTitle: 'New Tab',
    description: 'Open new tab',
    url: tab.url || 'chrome://newtab',
    windowSize: { width: 0, height: 0 },
    viewportSize: { width: 0, height: 0 },
  });

  // Inject content script into new tab once it loads
  if (tab.id) {
    const injectWhenReady = async (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(injectWhenReady);
        const injected = await ensureContentScript(tab.id);
        if (injected) {
          chrome.tabs
            .sendMessage(tab.id, { type: 'START_RECORDING' })
            .catch(() => {});
        }
      }
    };
    chrome.tabs.onUpdated.addListener(injectWhenReady);
  }
});

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return;
  trackPageChange(details.tabId, 'navigation');
  checkContextLinks(details.url);
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
