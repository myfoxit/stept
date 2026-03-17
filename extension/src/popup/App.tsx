import React, { useEffect, useState, useRef } from 'react';
import { sendToBackground } from '@/shared/messages';

interface AppState {
  isAuthenticated: boolean;
  isRecording: boolean;
  isPaused: boolean;
  currentUser: { name?: string; email?: string } | null;
  userProjects: { id: string; name: string }[];
  selectedProjectId: string | null;
  stepCount: number;
  recordingStartTime: number | null;
}

interface Settings {
  apiBaseUrl: string;
  frontendUrl: string;
  displayMode: string;
  buildMode: string;
}

type View = 'idle' | 'recording' | 'upload';

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [selectedProject, setSelectedProject] = useState('');
  const [view, setView] = useState<View>('idle');
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [displayMode, setDisplayMode] = useState('sidepanel');
  const [apiUrl, setApiUrl] = useState('');
  const [frontendUrl, setFrontendUrl] = useState('');
  const [apiSaved, setApiSaved] = useState(false);
  const [frontendSaved, setFrontendSaved] = useState(false);
  const [buildMode, setBuildMode] = useState('');
  const [timer, setTimer] = useState('00:00');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadSettings();
    refreshState();

    const listener = (message: any) => {
      if (message.type === 'STEP_ADDED' || message.type === 'RECORDING_STATE_CHANGED') {
        refreshState();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    if (state?.isRecording && state.recordingStartTime && !state.isPaused) {
      const update = () => {
        const elapsed = Date.now() - state.recordingStartTime!;
        const m = Math.floor(elapsed / 60000);
        const s = Math.floor((elapsed % 60000) / 1000);
        setTimer(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      };
      update();
      timerRef.current = setInterval(update, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [state?.isRecording, state?.recordingStartTime, state?.isPaused]);

  async function loadSettings() {
    const settings = await sendToBackground<Settings>({ type: 'GET_SETTINGS' });
    if (settings.apiBaseUrl) setApiUrl(settings.apiBaseUrl);
    if (settings.frontendUrl) setFrontendUrl(settings.frontendUrl);
    setDisplayMode(settings.displayMode || 'sidepanel');
    setBuildMode(settings.buildMode || '');
  }

  async function refreshState() {
    const s = await sendToBackground<AppState>({ type: 'GET_STATE' });
    setState(s);
    if (s.selectedProjectId) setSelectedProject(s.selectedProjectId);
    if (s.isRecording) {
      setView('recording');
    } else {
      setView('idle');
    }
  }

  async function handleLogin() {
    setLoginLoading(true);
    setLoginError('');
    try {
      const result = await sendToBackground<{ success: boolean; error?: string }>({ type: 'LOGIN' });
      if (result.success) {
        await refreshState();
      } else {
        const err = result.error || 'Unknown error';
        if (err.includes('net::') || err.includes('NetworkError') || err.includes('Failed to fetch')) {
          setLoginError('Cannot connect to stept server. Check your API URL in settings.');
        } else {
          setLoginError('Login failed: ' + err);
        }
      }
    } catch (e: any) {
      setLoginError('Login failed: ' + e.message);
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await sendToBackground({ type: 'LOGOUT' });
    await refreshState();
  }

  async function handleStart() {
    if (!selectedProject) return;
    await sendToBackground({ type: 'START_RECORDING', projectId: selectedProject } as any);
    if (displayMode === 'sidepanel') {
      await sendToBackground({ type: 'OPEN_SIDE_PANEL' });
    } else {
      await sendToBackground({ type: 'SHOW_DOCK' });
    }
    window.close();
  }

  async function handlePause() {
    if (!state) return;
    if (state.isPaused) {
      await sendToBackground({ type: 'RESUME_RECORDING' });
    } else {
      await sendToBackground({ type: 'PAUSE_RECORDING' });
    }
    await refreshState();
  }

  async function handleDelete() {
    if (confirm('Are you sure you want to delete this capture?')) {
      await sendToBackground({ type: 'STOP_RECORDING' });
      await sendToBackground({ type: 'CLEAR_STEPS' });
      await refreshState();
    }
  }

  async function handleComplete() {
    await sendToBackground({ type: 'STOP_RECORDING' });
    setView('upload');
    setUploadProgress(0);
    setUploadStatus('Starting upload...');

    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (progress <= 90) setUploadProgress(progress);
    }, 500);

    const result = await sendToBackground<{ success: boolean; error?: string }>({ type: 'UPLOAD' });
    clearInterval(interval);
    setUploadProgress(100);

    if (result.success) {
      setUploadStatus('Upload complete!');
      await sendToBackground({ type: 'CLEAR_STEPS' });
      window.close();
    } else {
      setUploadStatus('Upload failed: ' + (result.error || 'Unknown error'));
    }
  }

  async function handleSetMode(mode: string) {
    setDisplayMode(mode);
    await sendToBackground({ type: 'SET_DISPLAY_MODE', displayMode: mode } as any);
  }

  async function handleSaveApi() {
    if (apiUrl.trim()) {
      await sendToBackground({ type: 'SET_SETTINGS', apiBaseUrl: apiUrl.trim() } as any);
      setApiSaved(true);
      setTimeout(() => setApiSaved(false), 1500);
    }
  }

  async function handleSaveFrontend() {
    if (frontendUrl.trim()) {
      await sendToBackground({ type: 'SET_SETTINGS', frontendUrl: frontendUrl.trim() } as any);
      setFrontendSaved(true);
      setTimeout(() => setFrontendSaved(false), 1500);
    }
  }

  if (!state) return null;

  const displayName = state.currentUser?.name || state.currentUser?.email || 'User';

  return (
    <div className="container">
      {/* Logo */}
      <div className="logo">
        <svg width="38" height="36" viewBox="0 0 38 36">
          <rect x="0" y="4" width="32" height="32" rx="9" fill="#3AB08A" />
          <rect x="7" y="11" width="10" height="3.5" rx="1.75" fill="white" />
          <rect x="7" y="17.5" width="18" height="3.5" rx="1.75" fill="white" />
          <rect x="7" y="24" width="14" height="3.5" rx="1.75" fill="white" />
          <path d="M33 0 L34.5 4.5 L38 6 L34.5 7.5 L33 12 L31.5 7.5 L28 6 L31.5 4.5 Z" fill="#3AB08A" />
        </svg>
      </div>

      {/* Login Panel */}
      {!state.isAuthenticated && (
        <div className="panel" style={{ alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={handleLogin} disabled={loginLoading}>
            {loginLoading ? 'Signing in...' : 'Sign In'}
          </button>
          {loginError && <div className="inline-error">{loginError}</div>}
          <p className="version">version 1.0.1</p>
        </div>
      )}

      {/* User Panel */}
      {state.isAuthenticated && (
        <div className="panel">
          <p className="greeting">Hello, {displayName}!</p>

          {/* Idle State */}
          {view === 'idle' && (
            <div>
              <button
                className="btn btn-primary"
                disabled={!selectedProject || (state.isRecording && displayMode === 'dock')}
                onClick={handleStart}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
                </svg>
                {state.isRecording && displayMode === 'dock' ? 'Recording in progress...' : 'Start Capture'}
              </button>
            </div>
          )}

          {/* Project Selector */}
          <label className="select-label">Project</label>
          <select
            className="select"
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
          >
            <option value="">Select project</option>
            {state.userProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Settings */}
          <details className="settings-details">
            <summary className="settings-toggle">&#9881; Settings</summary>
            <div className="settings-content">
              <label className="settings-label">Display Mode</label>
              <div className="mode-selector">
                <button
                  className={`mode-btn ${displayMode === 'sidepanel' ? 'active' : ''}`}
                  onClick={() => handleSetMode('sidepanel')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                  </svg>
                  Side Panel
                </button>
                <button
                  className={`mode-btn ${displayMode === 'dock' ? 'active' : ''}`}
                  onClick={() => handleSetMode('dock')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="6" width="6" height="12" rx="1" />
                    <rect x="10" y="3" width="12" height="18" rx="2" strokeDasharray="3 3" />
                  </svg>
                  Dock
                </button>
              </div>
              {buildMode !== 'cloud' && (
                <div>
                  <label className="settings-label" htmlFor="apiUrlInput">API URL</label>
                  <input
                    id="apiUrlInput"
                    className="settings-input"
                    type="url"
                    placeholder="https://app.stept.ai/api/v1"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                  />
                  <button className="btn btn-outline btn-sm" onClick={handleSaveApi}>
                    {apiSaved ? 'Saved!' : 'Save'}
                  </button>

                  <label className="settings-label" htmlFor="frontendUrlInput" style={{ marginTop: 8 }}>Frontend URL</label>
                  <input
                    id="frontendUrlInput"
                    className="settings-input"
                    type="url"
                    placeholder="http://localhost:5173"
                    value={frontendUrl}
                    onChange={(e) => setFrontendUrl(e.target.value)}
                  />
                  <button className="btn btn-outline btn-sm" onClick={handleSaveFrontend}>
                    {frontendSaved ? 'Saved!' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          </details>

          {/* Recording State */}
          {view === 'recording' && state.isRecording && (
            <div>
              <div className="status">
                <div className={`recording-dot ${state.isPaused ? 'paused' : ''}`} />
                <span>{state.isPaused ? 'Paused' : 'Capturing...'}</span>
              </div>
              <p className="step-count">{state.stepCount} steps recorded</p>
              <p className="recording-time">{timer}</p>
              <div className="btn-group">
                <button className="btn btn-outline btn-sm" onClick={handlePause}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {state.isPaused ? (
                      <polygon points="5 3 19 12 5 21 5 3" />
                    ) : (
                      <>
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </>
                    )}
                  </svg>
                  <span>{state.isPaused ? 'Resume' : 'Pause'}</span>
                </button>
                <button className="btn btn-outline btn-sm btn-danger" onClick={handleDelete}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Delete
                </button>
              </div>
              <button className="btn btn-complete" onClick={handleComplete}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Complete Capture
              </button>
            </div>
          )}

          {/* Upload Panel */}
          {view === 'upload' && (
            <div>
              <h3>Uploading...</h3>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p>{uploadStatus}</p>
            </div>
          )}

          {/* Logout */}
          <button className="btn btn-outline btn-sm logout-btn" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
