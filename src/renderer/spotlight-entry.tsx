import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

import { theme } from './components/spotlight/theme';
import { OndokiLogo } from './components/spotlight/OndokiLogo';
import { SpotlightHeader } from './components/spotlight/SpotlightHeader';
import { SearchBar } from './components/spotlight/SearchBar';
import { RecordingControls } from './components/spotlight/RecordingControls';
import { ResultsList } from './components/spotlight/ResultsList';
import { ChatPanel } from './components/spotlight/ChatPanel';
import { ContextBar } from './components/spotlight/ContextBar';
import { Footer } from './components/spotlight/Footer';
import type {
  SpotlightResult,
  ChatMessage,
  ContextInfo,
  AuthState,
  RecState,
  SpotMode,
} from './components/spotlight/types';

// ─── Spotlight App ──────────────────────────────────────────────────────────

const SpotlightApp: React.FC = () => {
  // Auth
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    projects: [],
  });
  const [authLoading, setAuthLoading] = useState(true);

  // Spotlight state
  const [mode, setMode] = useState<SpotMode>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotlightResult[]>([]);
  const [contextResults, setContextResults] = useState<SpotlightResult[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  // AI chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Recording
  const [rec, setRec] = useState<RecState>({
    isRecording: false,
    isPaused: false,
    stepCount: 0,
  });
  const [duration, setDuration] = useState(0);
  const [showCaptureSelector, setShowCaptureSelector] = useState(false);
  const [captureDisplays, setCaptureDisplays] = useState<
    { id: string; name: string; bounds: any; isPrimary: boolean }[]
  >([]);
  const [captureWindows, setCaptureWindows] = useState<
    { handle: number; title: string; bounds: any; processId: number }[]
  >([]);
  const [captureLoading, setCaptureLoading] = useState(false);

  // Upload toast
  const [uploadStatus, setUploadStatus] = useState<
    'idle' | 'uploading' | 'success' | 'error'
  >('idle');
  const [uploadError, setUploadError] = useState('');

  // Context
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const [contextMatchCount, setContextMatchCount] = useState(0);

  // Project
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Init ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      setAuthLoading(false);
      return;
    }

    // Get auth status
    api
      .getAuthStatus()
      .then((status: any) => {
        if (status?.isAuthenticated) {
          setAuth({
            isAuthenticated: true,
            user: status.user,
            projects: status.projects || [],
          });
          const pid = status.projects?.[0]?.id || '';
          setSelectedProjectId(pid);
          if (pid) api.contextStart?.(pid);
        }
        setAuthLoading(false);
      })
      .catch(() => setAuthLoading(false));

    // Auth changes
    const unsubAuth = api.onAuthStatusChanged?.((status: any) => {
      setAuth({
        isAuthenticated: status.isAuthenticated,
        user: status.user ?? null,
        projects: status.projects ?? [],
      });
      if (status.isAuthenticated && status.projects?.[0]?.id) {
        setSelectedProjectId((prev) => prev || status.projects[0].id);
        api.contextStart?.(status.projects[0].id);
      }
    });

    // Spotlight show
    const unsubShow = api.onSpotlightShow?.((pid: string) => {
      if (pid) setSelectedProjectId(pid);
      setQuery('');
      setResults([]);
      setHighlightIndex(0);
      setChatMessages([]);
      setTimeout(() => inputRef.current?.focus(), 50);
      api.contextForceMatch?.();
    });

    // Context matches
    const unsubCtx = api.onContextMatches?.((matches, ctx) => {
      setContextInfo({
        windowTitle: ctx?.windowTitle,
        appName: ctx?.appName,
        url: ctx?.url,
      });
      setContextMatchCount(matches?.length || 0);
      setContextResults(
        matches?.map((m: any) => ({
          id: m.resource_id || m.id,
          type: m.resource_type || 'workflow',
          name: m.resource_name || m.name || 'Untitled',
          step_count: m.step_count,
          updated_at: m.updated_at,
        })) || [],
      );
    });
    const unsubNoCtx = api.onContextNoMatches?.(() => {
      setContextInfo(null);
      setContextMatchCount(0);
      setContextResults([]);
    });

    // Recording events
    const unsubStep = api.onStepRecorded?.((step: any) => {
      setRec((prev) => ({ ...prev, stepCount: prev.stepCount + 1 }));
    });
    const unsubState = api.onRecordingStateChanged?.((state: any) => {
      setRec(state);
    });

    // Upload events
    const unsubUpStart = api.onUploadStarted?.(() =>
      setUploadStatus('uploading'),
    );
    const unsubUpDone = api.onUploadComplete?.((result: any) => {
      setUploadStatus('success');
      setTimeout(() => setUploadStatus('idle'), 3000);
    });
    const unsubUpErr = api.onUploadError?.((err: string) => {
      setUploadStatus('error');
      setUploadError(err);
      setTimeout(() => setUploadStatus('idle'), 5000);
    });

    // Get initial context
    api.contextGetActive?.().then((ctx) => {
      if (ctx)
        setContextInfo({
          windowTitle: ctx.windowTitle,
          appName: ctx.appName,
          url: ctx.url,
        });
    });

    // Recording toggle from global shortcut
    const unsubToggleRec = api.onToggleRecording?.(() => {
      document.dispatchEvent(new CustomEvent('ondoki-toggle-recording'));
    });

    return () => {
      unsubAuth?.();
      unsubShow?.();
      unsubCtx?.();
      unsubNoCtx?.();
      unsubStep?.();
      unsubState?.();
      unsubUpStart?.();
      unsubUpDone?.();
      unsubUpErr?.();
      unsubToggleRec?.();
    };
  }, []);

  // Focus on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Recording timer
  useEffect(() => {
    if (!rec.isRecording || rec.isPaused) return;
    const interval = setInterval(() => setDuration((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [rec.isRecording, rec.isPaused]);

  // ─── Search ─────────────────────────────────────────────────────────────

  const performSearch = useCallback(
    async (text: string) => {
      if (!text.trim() || !selectedProjectId) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const api = window.electronAPI;
        if (!api) return;
        const result = await api.spotlightSearch(text, selectedProjectId);
        const list: SpotlightResult[] = (result?.results || []).map(
          (r: any) => ({
            ...r,
            name: r.name || r.resource_name || 'Untitled',
          }),
        );
        setResults(list);
        setHighlightIndex(0);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [selectedProjectId],
  );

  useEffect(() => {
    if (mode !== 'search') return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => performSearch(query), 200);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query, mode, performSearch]);

  // ─── Actions ────────────────────────────────────────────────────────────

  const openResult = useCallback(async (result: SpotlightResult) => {
    const api = window.electronAPI;
    if (!api) return;
    try {
      const settings = await api.getSettings();
      const frontendUrl = (
        settings.frontendUrl || 'http://localhost:5173'
      ).replace(/\/+$/, '');
      const id = result.id || (result as any).resource_id;
      const type = result.type || result.resource_type;
      const p = type === 'workflow' ? `/workflow/${id}` : `/editor/${id}`;
      await api.openExternal(`${frontendUrl}${p}`);
      api.spotlightDismiss?.();
    } catch (err) {
      console.error('Failed to open result:', err);
    }
  }, []);

  const dismiss = useCallback(() => {
    window.electronAPI?.spotlightDismiss?.();
  }, []);

  // Global ESC handler
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [dismiss]);

  const handleLogin = useCallback(async () => {
    try {
      await window.electronAPI?.initiateLogin();
    } catch (e) {
      console.error('Login failed:', e);
    }
  }, []);

  const doStartRecording = useCallback(
    async (captureArea: {
      type: string;
      displayId?: string;
      displayName?: string;
      windowHandle?: number;
      windowTitle?: string;
      bounds?: any;
    }) => {
      if (!selectedProjectId) return;
      try {
        setShowCaptureSelector(false);

        const settings = await window.electronAPI?.getSettings();
        const shouldMinimize = settings?.minimizeOnRecord !== false;

        if (shouldMinimize) {
          window.electronAPI?.spotlightDismiss?.();
        } else {
          await window.electronAPI?.setRecordingStarting?.(true);
        }

        await window.electronAPI?.showCountdown?.();
        await new Promise((resolve) => setTimeout(resolve, 3200));
        await window.electronAPI?.startRecording(
          captureArea as any,
          selectedProjectId,
        );
        setRec({ isRecording: true, isPaused: false, stepCount: 0 });
        setDuration(0);

        if (!shouldMinimize) {
          await window.electronAPI?.setRecordingStarting?.(false);
        }
      } catch (e) {
        console.error('Failed to start recording:', e);
        await window.electronAPI?.setRecordingStarting?.(false);
      }
    },
    [selectedProjectId],
  );

  const handleStartRecording = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const api = window.electronAPI;
      if (!api) return;
      const captureArea = await api.openPicker();
      if (captureArea) {
        doStartRecording(captureArea);
      }
    } catch (e) {
      console.error('Failed to open picker:', e);
    }
  }, [selectedProjectId, doStartRecording]);

  const handleStopRecording = useCallback(async () => {
    try {
      await window.electronAPI?.stopRecording();
      setRec((prev) => ({ ...prev, isRecording: false, isPaused: false }));
    } catch (e) {
      console.error('Failed to stop recording:', e);
    }
  }, []);

  // Handle recording toggle from global shortcut
  useEffect(() => {
    const handler = () => {
      if (rec.isRecording) handleStopRecording();
      else doStartRecording({ type: 'all-displays' });
    };
    document.addEventListener('ondoki-toggle-recording', handler);
    return () =>
      document.removeEventListener('ondoki-toggle-recording', handler);
  }, [rec.isRecording, doStartRecording, handleStopRecording]);

  const handleTogglePause = useCallback(async () => {
    try {
      if (rec.isPaused) await window.electronAPI?.resumeRecording();
      else await window.electronAPI?.pauseRecording();
      setRec((prev) => ({ ...prev, isPaused: !prev.isPaused }));
    } catch (e) {
      console.error('Failed to toggle pause:', e);
    }
  }, [rec.isPaused]);

  const sendAiMessage = useCallback(async () => {
    const text = query.trim();
    if (!text || isChatLoading) return;
    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);
    setQuery('');
    setIsChatLoading(true);
    try {
      const api = window.electronAPI;
      if (!api) throw new Error('API not available');
      const contextStr = JSON.stringify({
        project_id: selectedProjectId,
        ...(contextInfo ? { active_context: contextInfo } : {}),
      });
      const response = await api.sendChatMessage(
        [{ role: 'user', content: text }],
        contextStr,
      );
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong.' },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }, [query, selectedProjectId, isChatLoading, contextInfo]);

  // ─── Keyboard ───────────────────────────────────────────────────────────

  const allResults = [...(query.trim() ? [] : contextResults), ...results];

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismiss();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        setMode((prev) => (prev === 'search' ? 'ai' : 'search'));
        return;
      }
      if (mode === 'search') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightIndex((prev) =>
            Math.min(prev + 1, allResults.length - 1),
          );
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && allResults[highlightIndex]) {
          e.preventDefault();
          openResult(allResults[highlightIndex]);
        }
      } else if (mode === 'ai' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiMessage();
      }
    },
    [mode, allResults, highlightIndex, dismiss, openResult, sendAiMessage],
  );

  // Scroll into view
  useEffect(() => {
    if (!resultsRef.current) return;
    const items = resultsRef.current.querySelectorAll('[data-result-item]');
    items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  // ─── RENDER ─────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className="spotlight-card"
          style={{
            padding: '40px 0',
            textAlign: 'center',
            color: theme.textMuted,
            fontSize: 13,
          }}
        >
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 0,
        background: 'rgba(0,0,0,0.01)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="spotlight-card">
        {/* Auth gate */}
        {!auth.isAuthenticated ? (
          <div style={{ padding: '40px 32px', textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}>
              <OndokiLogo width={38} height={36} />
            </div>
            <div
              style={{
                fontFamily: theme.font.display,
                fontWeight: 800,
                fontSize: 20,
                color: theme.dark,
                letterSpacing: '-0.03em',
                marginBottom: 8,
              }}
            >
              ondoki
            </div>
            <p
              style={{
                fontSize: 13,
                color: theme.textSecondary,
                lineHeight: 1.5,
                marginBottom: 24,
              }}
            >
              Sign in to start recording and searching your workflows.
            </p>
            <button
              onClick={handleLogin}
              className="btn-dark"
              style={{
                padding: '10px 32px',
                borderRadius: theme.radius.md,
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: theme.font.display,
                cursor: 'pointer',
              }}
            >
              Sign In
            </button>
          </div>
        ) : (
          <>
            <SpotlightHeader
              auth={auth}
              selectedProjectId={selectedProjectId}
              onProjectChange={setSelectedProjectId}
            />

            <SearchBar
              mode={mode}
              query={query}
              inputRef={inputRef}
              onQueryChange={setQuery}
              onKeyDown={handleKeyDown}
              onModeChange={setMode}
            />

            <RecordingControls
              rec={rec}
              duration={duration}
              selectedProjectId={selectedProjectId}
              uploadStatus={uploadStatus}
              uploadError={uploadError}
              onStartAll={() => doStartRecording({ type: 'all-displays' })}
              onStartChoose={handleStartRecording}
              onStop={handleStopRecording}
              onTogglePause={handleTogglePause}
            />

            {contextInfo && contextInfo.appName && (
              <ContextBar
                contextInfo={contextInfo}
                contextMatchCount={contextMatchCount}
              />
            )}

            {mode === 'search' ? (
              <ResultsList
                query={query}
                results={results}
                contextResults={contextResults}
                highlightIndex={highlightIndex}
                isSearching={isSearching}
                resultsRef={resultsRef}
                onHighlight={setHighlightIndex}
                onOpen={openResult}
              />
            ) : (
              <ChatPanel
                chatMessages={chatMessages}
                isChatLoading={isChatLoading}
                query={query}
                onQueryChange={setQuery}
                onKeyDown={handleKeyDown}
                onSend={sendAiMessage}
              />
            )}

            <Footer mode={mode} />
          </>
        )}
      </div>
    </div>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const styleEl = document.createElement('style');
styleEl.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Outfit:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { margin: 0; background: transparent; overflow: hidden; -webkit-app-region: no-drag; }

  @keyframes spotlightIn {
    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .scrollbar-thin::-webkit-scrollbar { width: 5px; }
  .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
  .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 10px; }
  .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }

  ::selection { background: rgba(58,176,138,0.2); }
  input::placeholder { color: #999999; }

  .spotlight-card {
    width: 530px;
    max-width: 94vw;
    background: #ffffff;
    border-radius: 20px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
    border: 1px solid #E0E0E0;
    overflow: hidden;
    font-family: 'DM Sans', sans-serif;
    animation: spotlightIn 0.15s ease-out;
  }

  .spotlight-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(0,0,0,0.07);
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(0,0,0,0.07);
  }

  .recording-controls {
    padding: 10px 16px;
    border-bottom: 1px solid rgba(0,0,0,0.07);
  }

  .context-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    background: rgba(26,26,26,0.03);
    border-bottom: 1px solid rgba(26,26,26,0.06);
    font-size: 11px;
  }

  .content-area {
    max-height: 280px;
    overflow-y: auto;
    padding: 6px 10px;
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 16px;
    background: #F5F5F5;
    border-top: 1px solid rgba(0,0,0,0.07);
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.1s;
  }
  .result-item:hover {
    background: rgba(26,26,26,0.06);
  }

  .pill-toggle {
    display: flex;
    gap: 0;
    border-radius: 8px;
    border: 1px solid rgba(0,0,0,0.08);
    overflow: hidden;
  }

  .btn-dark {
    background: #1A1A1A;
    color: #fff;
    transition: background 0.15s;
  }
  .btn-dark:hover { background: #333333; }
  .btn-dark:disabled { background: #ccc; cursor: not-allowed; }

  .btn-outline {
    background: rgba(26,26,26,0.04);
    border: 1.5px solid rgba(26,26,26,0.15);
    transition: background 0.15s;
  }
  .btn-outline:hover { background: rgba(26,26,26,0.08); }

  .kbd {
    display: inline-flex;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(26,26,26,0.08);
    border: 1px solid rgba(26,26,26,0.12);
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    color: #666666;
    line-height: 16px;
  }

  .empty-state {
    padding: 20px 8px;
    text-align: center;
    font-size: 12px;
    color: #999999;
  }
`;
document.head.appendChild(styleEl);

// ─── Mount ──────────────────────────────────────────────────────────────────

const container = document.getElementById('spotlight-root');
if (container) {
  const root = createRoot(container);
  root.render(<SpotlightApp />);
}
