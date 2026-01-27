const API_BASE_URL = 'http://localhost:8000/api/v1';

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

// Initialize state from storage
chrome.storage.local.get(
  ['refreshToken', 'selectedProjectId'],
  async (result) => {
    if (result.refreshToken) {
      state.refreshToken = result.refreshToken;
      await tryAutoLogin();
    }
    if (result.selectedProjectId) {
      state.selectedProjectId = result.selectedProjectId;
    }
  },
);

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

// Authentication
async function initiateLogin() {
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

  // Store refresh token
  await chrome.storage.local.set({ refreshToken: state.refreshToken });

  // Clear PKCE state
  state.codeVerifier = null;
  state.authState = null;

  // Fetch user info and projects
  await fetchUserInfo();
  await fetchUserProjects();

  return true;
}

async function tryAutoLogin() {
  if (!state.refreshToken) return false;

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

      await chrome.storage.local.set({ refreshToken: state.refreshToken });
      await fetchUserInfo();
      await fetchUserProjects();
      return true;
    }
  } catch (error) {
    console.error('Auto-login failed:', error);
  }

  // Clear invalid token
  await chrome.storage.local.remove('refreshToken');
  state.refreshToken = null;
  return false;
}

async function logout() {
  try {
    if (state.refreshToken) {
      await fetch(`${API_BASE_URL}/auth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: state.refreshToken }),
      });
    }
  } catch (error) {
    console.error('Revoke error:', error);
  }

  state.isAuthenticated = false;
  state.accessToken = null;
  state.refreshToken = null;
  state.currentUser = null;
  state.userProjects = [];
  state.selectedProjectId = null;

  await chrome.storage.local.remove(['refreshToken', 'selectedProjectId']);
}

async function fetchUserInfo() {
  if (!state.accessToken) return;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${state.accessToken}` },
    });

    if (response.ok) {
      state.currentUser = await response.json();
    }
  } catch (error) {
    console.error('Failed to fetch user info:', error);
  }
}

async function fetchUserProjects() {
  if (!state.accessToken || !state.currentUser) return;

  try {
    const response = await fetch(
      `${API_BASE_URL}/projects/${state.currentUser.id}`,
      {
        headers: { Authorization: `Bearer ${state.accessToken}` },
      },
    );

    if (response.ok) {
      state.userProjects = await response.json();
    }
  } catch (error) {
    console.error('Failed to fetch projects:', error);
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

  // Notify all tabs to start capturing
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      // Only send to http/https pages
      if (
        tab.id &&
        tab.url &&
        (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
      ) {
        chrome.tabs
          .sendMessage(tab.id, { type: 'START_RECORDING' })
          .catch(() => {});
      }
    });
  });

  // Update badge
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });

  // Open side panel
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
    }
  });
}

function stopRecording() {
  state.isRecording = false;
  state.isPaused = false;

  // Notify all tabs to stop capturing
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

  // Clear badge
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
  chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
}

async function captureScreenshot() {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error(
          'Screenshot capture failed:',
          chrome.runtime.lastError.message,
        );
        resolve(null);
        return;
      }
      resolve(dataUrl);
    });
  });
}

async function addStep(stepData) {
  if (!state.isRecording || state.isPaused) {
    console.log('Not recording or paused, skipping step');
    return;
  }

  state.stepCounter++;

  // Capture screenshot
  const screenshot = await captureScreenshot();

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
  console.log('Step added:', step.stepNumber, step.actionType);

  // Notify popup and side panel of new step
  chrome.runtime
    .sendMessage({ type: 'STEP_ADDED', step: step })
    .catch(() => {});
}

function deleteStep(stepNumber) {
  state.steps = state.steps.filter((s) => s.stepNumber !== stepNumber);
  // Renumber remaining steps
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

  try {
    // Create session
    const sessionResponse = await fetch(
      `${API_BASE_URL}/process-recording/session/create`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          client: 'SnaprowChromeExtension',
          user_id: state.currentUser?.id,
          project_id: state.selectedProjectId,
        }),
      },
    );

    if (!sessionResponse.ok) {
      throw new Error('Failed to create upload session');
    }

    const { sessionId } = await sessionResponse.json();

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

    const metadataResponse = await fetch(
      `${API_BASE_URL}/process-recording/session/${sessionId}/metadata`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!metadataResponse.ok) {
      throw new Error('Failed to upload metadata');
    }

    // Upload images
    for (const step of state.steps) {
      if (step.screenshotDataUrl) {
        const blob = await dataUrlToBlob(step.screenshotDataUrl);
        const formData = new FormData();
        formData.append('file', blob, `step_${step.stepNumber}.png`);
        formData.append('stepNumber', step.stepNumber.toString());

        const imageResponse = await fetch(
          `${API_BASE_URL}/process-recording/session/${sessionId}/image`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${state.accessToken}`,
            },
            body: formData,
          },
        );

        if (!imageResponse.ok) {
          throw new Error(`Failed to upload image for step ${step.stepNumber}`);
        }
      }
    }

    // Finalize
    await fetch(
      `${API_BASE_URL}/process-recording/session/${sessionId}/finalize`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.accessToken}`,
        },
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

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  return true; // Keep channel open for async response
});

// Listen for tab updates to inject content script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    state.isRecording &&
    tab.url &&
    (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
  ) {
    chrome.tabs
      .sendMessage(tabId, {
        type: state.isPaused ? 'PAUSE_RECORDING' : 'START_RECORDING',
      })
      .catch(() => {});
  }
});
