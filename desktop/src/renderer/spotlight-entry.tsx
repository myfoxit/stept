import './styles/globals.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

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

// --- Spotlight App ------------------------------------------------------------

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

  // Audio
  const [audioEnabled, setAudioEnabled] = useState(false);

  // Upload toast
  const [uploadStatus, setUploadStatus] = useState<
    'idle' | 'uploading' | 'success' | 'error'
  >('idle');
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState<{ currentFile: number; totalFiles: number } | null>(null);

  // Context
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const [contextMatchCount, setContextMatchCount] = useState(0);

  // Project
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Init ------------------------------------------------------------------

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
        setSelectedProjectId(status.projects[0].id);
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
    const unsubAnnotated = api.onStepAnnotated?.((step: any) => {
      console.log('[annotation] Step annotated:', step.stepNumber, step.generatedTitle);
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
    const unsubUpProgress = api.onUploadProgress?.((progress: any) => {
      setUploadProgress({ currentFile: progress.currentFile, totalFiles: progress.totalFiles });
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
      unsubAnnotated?.();
      unsubState?.();
      unsubUpStart?.();
      unsubUpDone?.();
      unsubUpErr?.();
      unsubUpProgress?.();
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

  // --- Search ----------------------------------------------------------------

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

  // --- Actions ---------------------------------------------------------------

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
          audioEnabled,
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
    [selectedProjectId, audioEnabled],
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

  // --- Keyboard --------------------------------------------------------------

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

  // --- RENDER ----------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="spotlight-backdrop spotlight-backdrop--centered">
        <div className="spotlight-card spotlight-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div
      className="spotlight-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="spotlight-card">
        {/* Auth gate */}
        {!auth.isAuthenticated ? (
          <div className="auth-gate">
            <div className="auth-gate-logo">
              <OndokiLogo width={80} height={76} />
            </div>
            <div className="auth-gate-title">ondoki</div>
            <p className="auth-gate-desc">
              Record and search your workflows
            </p>
            <button
              onClick={handleLogin}
              className="auth-gate-btn"
            >
              Sign In
            </button>
            <div className="auth-gate-version">v2.1.0</div>
          </div>
        ) : (
          <>
            <SpotlightHeader
              auth={auth}
              selectedProjectId={selectedProjectId}
              onProjectChange={setSelectedProjectId}
            />

            <RecordingControls
              rec={rec}
              duration={duration}
              selectedProjectId={selectedProjectId}
              uploadStatus={uploadStatus}
              uploadError={uploadError}
              uploadProgress={uploadProgress}
              audioEnabled={audioEnabled}
              onToggleAudio={() => setAudioEnabled((prev) => !prev)}
              onStartAll={() => doStartRecording({ type: 'all-displays' })}
              onStartChoose={handleStartRecording}
              onStop={handleStopRecording}
              onTogglePause={handleTogglePause}
            />

            <SearchBar
              mode={mode}
              query={query}
              inputRef={inputRef}
              onQueryChange={setQuery}
              onKeyDown={handleKeyDown}
              onModeChange={setMode}
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

// --- Mount -------------------------------------------------------------------

const container = document.getElementById('spotlight-root');
if (container) {
  const root = createRoot(container);
  root.render(<SpotlightApp />);
}
