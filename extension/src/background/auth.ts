import { state, persistAuth, debugLog } from './state';
import { getApiBaseUrl } from './settings';

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function base64UrlEncode(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...array));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function refreshAccessToken(): Promise<boolean> {
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

    if (response.status === 401 || response.status === 403) {
      debugLog('Token refresh rejected:', response.status);
      state.isAuthenticated = false;
      state.accessToken = null;
      state.refreshToken = null;
      state.currentUser = null;
      state.userProjects = [];
      await chrome.storage.local.remove([
        'refreshToken',
        'accessToken',
        'currentUser',
        'userProjects',
      ]);
      return false;
    }
  } catch (error) {
    debugLog('Token refresh failed:', error);
  }
  return false;
}

export async function authedFetch(url: string, options: any = {}): Promise<Response> {
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

export async function initiateLogin(): Promise<boolean> {
  const API_BASE_URL = await getApiBaseUrl();
  state.codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(state.codeVerifier);
  state.authState = generateState();

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
    chrome.tabs.create({ url: authUrl }, (tab) => {
      const tabId = tab.id!;
      const onUpdated = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo,
      ) => {
        if (updatedTabId !== tabId || !changeInfo.url) return;
        if (!changeInfo.url.startsWith(redirectUrl)) return;

        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.remove(tabId).catch(() => {});

        handleAuthCallback(changeInfo.url).then(resolve).catch(reject);
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

async function handleAuthCallback(callbackUrl: string): Promise<boolean> {
  const API_BASE_URL = await getApiBaseUrl();

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

export async function tryAutoLogin(): Promise<boolean> {
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

    debugLog('Auto-login server error:', response.status);
    return false;
  } catch (error: any) {
    debugLog('Auto-login network error:', error.message);
    return false;
  }
}

export async function logout(): Promise<void> {
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

export async function fetchUserInfo(): Promise<void> {
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

// Periodic auth check — verifies the session is still valid every 5 minutes
const AUTH_CHECK_ALARM = 'stept-auth-check';

export function startAuthCheck(): void {
  chrome.alarms.create(AUTH_CHECK_ALARM, { periodInMinutes: 5 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== AUTH_CHECK_ALARM) return;
  if (!state.isAuthenticated || !state.refreshToken) return;

  const refreshed = await refreshAccessToken();
  if (!refreshed && !state.refreshToken) {
    // Session expired — notify sidepanel so it can update UI
    chrome.runtime.sendMessage({ type: 'RECORDING_STATE_CHANGED' }).catch(() => {});
  }
});

export async function fetchUserProjects(): Promise<void> {
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
