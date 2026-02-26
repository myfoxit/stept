import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SpotlightResult {
  id: string;
  type: string;
  resource_type?: string;
  name: string;
  resource_name?: string;
  preview?: string;
  summary?: string;
  resource_summary?: string;
  note?: string;
  updated_at?: string;
  word_count?: number;
  step_count?: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ContextInfo {
  windowTitle?: string;
  appName?: string;
  url?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user?: { id: string; email: string; name: string } | null;
  projects: { id: string; name: string; userId: string; role: string }[];
}

interface RecState {
  isRecording: boolean;
  isPaused: boolean;
  stepCount: number;
}

type SpotMode = 'search' | 'ai';

// ─── Helpers ────────────────────────────────────────────────────────────────

const QUESTION_PATTERN =
  /^(how|what|why|when|where|who|which|can|does|is|are|do|should|could|would|tell|explain|describe|show)\b/i;

function groupResults(
  results: SpotlightResult[],
): Record<string, SpotlightResult[]> {
  const groups: Record<string, SpotlightResult[]> = {};
  for (const r of results) {
    const type = r.type || r.resource_type || 'other';
    const label =
      type === 'workflow'
        ? 'Workflows'
        : type === 'document' || type === 'page'
          ? 'Pages'
          : 'Results';
    if (!groups[label]) groups[label] = [];
    groups[label].push(r);
  }
  return groups;
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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

      // Force a fresh context match check — the watcher has the cached context
      // from before spotlight stole focus
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
      // Will be handled via ref since this is a closure
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
        const kwResult = await api.spotlightSearch(text, selectedProjectId);
        let list: SpotlightResult[] = (kwResult?.results || []).map(
          (r: any) => ({
            ...r,
            name: r.name || r.resource_name || 'Untitled',
          }),
        );
        if (text.length > 20 || QUESTION_PATTERN.test(text)) {
          try {
            const semResult = await api.spotlightSemanticSearch(
              text,
              selectedProjectId,
            );
            const semResults = (semResult?.results || []).map((r: any) => ({
              ...r,
              name: r.name || r.resource_name || 'Untitled',
            }));
            if (semResults.length > 0) {
              const ids = new Set(semResults.map((s: SpotlightResult) => s.id));
              list = [...semResults, ...list.filter((r) => !ids.has(r.id))];
            }
          } catch {}
        }
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

  // Global ESC handler — works even when input isn't focused
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

        // Check minimize setting
        const settings = await window.electronAPI?.getSettings();
        const shouldMinimize = settings?.minimizeOnRecord !== false;

        if (shouldMinimize) {
          // Dismiss spotlight before countdown (current default behavior)
          window.electronAPI?.spotlightDismiss?.();
        } else {
          // Keep spotlight visible — suppress blur during recording start
          await window.electronAPI?.setRecordingStarting?.(true);
        }

        // Show countdown overlay
        await window.electronAPI?.showCountdown?.();
        // Wait for countdown to finish (3 seconds + buffer)
        await new Promise((resolve) => setTimeout(resolve, 3200));
        await window.electronAPI?.startRecording(
          captureArea as any,
          selectedProjectId,
        );
        setRec({ isRecording: true, isPaused: false, stepCount: 0 });
        setDuration(0);

        // Clear the starting flag (isRecording now protects blur)
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

  // Handle recording toggle from global shortcut (bypasses capture selector — records all)
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

  // ─── Styles ─────────────────────────────────────────────────────────────

  const kbdStyle: React.CSSProperties = {
    display: 'inline-flex',
    padding: '1px 5px',
    borderRadius: 4,
    background: 'rgba(26,26,26,0.08)',
    border: '1px solid rgba(26,26,26,0.12)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    fontWeight: 500,
    color: '#666666',
    lineHeight: '16px',
  };

  const grouped = groupResults(query.trim() ? results : []);
  const hasResults = allResults.length > 0;

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
          style={{
            width: 580,
            background: '#ffffff',
            borderRadius: 20,
            boxShadow:
              '0 2px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e4e1ed',
            padding: '40px 0',
            textAlign: 'center',
            color: '#A0A0B2',
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
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
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        style={{
          width: 580,
          maxWidth: '94vw',
          background: '#ffffff',
          borderRadius: 20,
          boxShadow:
            '0 2px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)',
          border: '1px solid #e4e1ed',
          overflow: 'hidden',
          fontFamily: "'DM Sans', sans-serif",
          animation: 'spotlightIn 0.15s ease-out',
        }}
      >
        {/* ═══ AUTH GATE ═══ */}
        {!auth.isAuthenticated ? (
          <div style={{ padding: '40px 32px', textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}>
              <svg width="38" height="36" viewBox="0 0 38 36" fill="none">
                <rect x="0" y="4" width="32" height="32" rx="9" fill="#E14D2A" />
                <rect x="7" y="11" width="10" height="3.5" rx="1.75" fill="white" />
                <rect x="7" y="17.5" width="18" height="3.5" rx="1.75" fill="white" />
                <rect x="7" y="24" width="14" height="3.5" rx="1.75" fill="white" />
                <path d="M33 0 L34.5 4.5 L38 6 L34.5 7.5 L33 12 L31.5 7.5 L28 6 L31.5 4.5 Z" fill="#E14D2A" />
              </svg>
            </div>
            <div
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 800,
                fontSize: 20,
                color: '#1A1A2E',
                letterSpacing: '-0.03em',
                marginBottom: 8,
              }}
            >
              ondoki
            </div>
            <p
              style={{
                fontSize: 13,
                color: '#6E6E82',
                lineHeight: 1.5,
                marginBottom: 24,
              }}
            >
              Sign in to start recording and searching your workflows.
            </p>
            <button
              onClick={handleLogin}
              style={{
                padding: '10px 32px',
                borderRadius: 10,
                border: 'none',
                background: '#1A1A1A',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'Outfit', sans-serif",
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = '#333333')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = '#1A1A1A')
              }
            >
              Sign In
            </button>
          </div>
        ) : (
          <>
            {/* ═══ CONTROL DECK ═══ */}
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(0,0,0,0.07)',
              }}
            >
              {/* Top row: logo + project + settings */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                {/* Logo */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <svg width="20" height="19" viewBox="0 0 38 36" fill="none">
                    <rect x="0" y="4" width="32" height="32" rx="9" fill="#E14D2A" />
                    <rect x="7" y="11" width="10" height="3.5" rx="1.75" fill="white" />
                    <rect x="7" y="17.5" width="18" height="3.5" rx="1.75" fill="white" />
                    <rect x="7" y="24" width="14" height="3.5" rx="1.75" fill="white" />
                    <path d="M33 0 L34.5 4.5 L38 6 L34.5 7.5 L33 12 L31.5 7.5 L28 6 L31.5 4.5 Z" fill="#E14D2A" />
                  </svg>
                </div>

                {/* Project selector */}
                <div style={{ flex: 1, position: 'relative' }}>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => {
                      setSelectedProjectId(e.target.value);
                      window.electronAPI?.contextStart?.(e.target.value);
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 28px 6px 10px',
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.1)',
                      background: '#F5F5F5',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      fontWeight: 500,
                      color: '#1A1A2E',
                      appearance: 'none',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    {auth.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    {auth.projects.length === 0 && (
                      <option value="">No projects</option>
                    )}
                  </select>
                  <svg
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                    }}
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#A0A0B2"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {/* Settings gear */}
                <button
                  onClick={() => window.electronAPI?.openSettingsWindow?.()}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: '1px solid rgba(0,0,0,0.08)',
                    background: '#F5F5F5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s',
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#6E6E82"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                </button>
              </div>

              {/* Recording controls */}
              {!rec.isRecording ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => doStartRecording({ type: 'all-displays' })}
                    disabled={!selectedProjectId}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '9px 16px',
                      borderRadius: 10,
                      border: 'none',
                      background: selectedProjectId ? '#1A1A1A' : '#ccc',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "'Outfit', sans-serif",
                      cursor: selectedProjectId ? 'pointer' : 'not-allowed',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedProjectId)
                        e.currentTarget.style.background = '#333333';
                    }}
                    onMouseLeave={(e) => {
                      if (selectedProjectId)
                        e.currentTarget.style.background = '#1A1A1A';
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="4" fill="currentColor" />
                    </svg>
                    Record All
                  </button>
                  <button
                    onClick={handleStartRecording}
                    disabled={!selectedProjectId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      padding: '9px 14px',
                      borderRadius: 10,
                      border: '1.5px solid rgba(26,26,26,0.15)',
                      background: 'rgba(26,26,26,0.04)',
                      color: selectedProjectId ? '#1A1A1A' : '#ccc',
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "'Outfit', sans-serif",
                      cursor: selectedProjectId ? 'pointer' : 'not-allowed',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedProjectId) {
                        e.currentTarget.style.background =
                          'rgba(26,26,26,0.08)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedProjectId) {
                        e.currentTarget.style.background =
                          'rgba(26,26,26,0.04)';
                      }
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    Choose...
                  </button>
                </div>
              ) : (
                /* Recording in progress */
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: rec.isPaused
                      ? '1.5px solid rgba(0,0,0,0.1)'
                      : '1.5px solid #E14D2A',
                    background: rec.isPaused
                      ? '#F5F5F5'
                      : 'rgba(225,77,42,0.04)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      {!rec.isPaused && (
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: '#E14D2A',
                            animation: 'pulse 2s infinite',
                          }}
                        />
                      )}
                      <span
                        style={{
                          fontFamily: "'Outfit', sans-serif",
                          fontSize: 13,
                          fontWeight: 700,
                          color: rec.isPaused ? '#6E6E82' : '#E14D2A',
                        }}
                      >
                        {rec.isPaused ? 'Paused' : 'Recording workflow'}
                      </span>
                    </div>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#E14D2A',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {formatDuration(duration)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: '#e14d2a',
                          fontWeight: 600,
                        }}
                      >
                        {rec.stepCount} step{rec.stepCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={handleTogglePause}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(0,0,0,0.1)',
                        background: '#fff',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: "'DM Sans', sans-serif",
                        color: '#1A1A2E',
                      }}
                    >
                      {rec.isPaused ? '▶ Resume' : '⏸ Pause'}
                    </button>
                    <button
                      onClick={handleStopRecording}
                      style={{
                        padding: '6px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#E14D2A',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      ⏹ Stop
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ═══ UPLOAD TOAST ═══ */}
            {uploadStatus !== 'idle' && (
              <div
                style={{
                  padding: '6px 16px',
                  fontSize: 11,
                  fontWeight: 500,
                  textAlign: 'center',
                  background:
                    uploadStatus === 'uploading'
                      ? '#EEF2FF'
                      : uploadStatus === 'success'
                        ? '#ECFDF5'
                        : '#FEF2F2',
                  color:
                    uploadStatus === 'uploading'
                      ? '#1A1A1A'
                      : uploadStatus === 'success'
                        ? '#059669'
                        : '#DC2626',
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                }}
              >
                {uploadStatus === 'uploading' && '⬆️ Uploading recording...'}
                {uploadStatus === 'success' &&
                  '✅ Recording uploaded successfully'}
                {uploadStatus === 'error' && `❌ Upload failed: ${uploadError}`}
              </div>
            )}

            {/* ═══ SEARCH BAR ═══ */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderBottom: '1px solid rgba(0,0,0,0.07)',
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={mode === 'search' ? '#1A1A1A' : '#1A1A1A'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {mode === 'search' ? (
                  <>
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </>
                ) : (
                  <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
                )}
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === 'search'
                    ? 'Search workflows, pages...'
                    : 'Ask anything about your knowledge base...'
                }
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'none',
                  fontSize: 14,
                  fontFamily: "'DM Sans', sans-serif",
                  color: '#1A1A2E',
                  outline: 'none',
                }}
              />
              {/* Search / AI toggle */}
              <div
                style={{
                  display: 'flex',
                  gap: 0,
                  borderRadius: 8,
                  border: '1px solid rgba(0,0,0,0.08)',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setMode('search')}
                  style={{
                    padding: '4px 10px',
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    cursor: 'pointer',
                    background:
                      mode === 'search' ? 'rgba(26,26,26,0.08)' : '#fff',
                    color: mode === 'search' ? '#1A1A1A' : '#A0A0B2',
                  }}
                >
                  Search
                </button>
                <button
                  onClick={() => setMode('ai')}
                  style={{
                    padding: '4px 10px',
                    border: 'none',
                    borderLeft: '1px solid rgba(0,0,0,0.08)',
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif",
                    cursor: 'pointer',
                    background: mode === 'ai' ? 'rgba(26,26,26,0.08)' : '#fff',
                    color: mode === 'ai' ? '#1A1A1A' : '#A0A0B2',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
                  </svg>
                  AI
                </button>
              </div>
              <span style={kbdStyle}>ESC</span>
            </div>

            {/* ═══ CONTEXT BAR ═══ */}
            {contextInfo && contextInfo.appName && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 16px',
                  background: 'rgba(26,26,26,0.03)',
                  borderBottom: '1px solid rgba(26,26,26,0.06)',
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#E14D2A',
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: '#1A1A2E', fontWeight: 600 }}>
                  {contextInfo.appName}
                </span>
                {contextInfo.url && (
                  <span
                    style={{
                      color: '#A0A0B2',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ·{' '}
                    {(() => {
                      try {
                        return new URL(contextInfo.url).hostname;
                      } catch {
                        return contextInfo.url;
                      }
                    })()}
                  </span>
                )}
                {contextMatchCount > 0 && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      padding: '1px 8px',
                      borderRadius: 10,
                      background: 'rgba(26,26,26,0.06)',
                      color: '#1A1A1A',
                      fontWeight: 600,
                      fontSize: 10,
                    }}
                  >
                    {contextMatchCount} linked
                  </span>
                )}
              </div>
            )}

            {/* ═══ CONTENT AREA ═══ */}
            {mode === 'search' ? (
              <div
                ref={resultsRef}
                style={{
                  maxHeight: 280,
                  overflowY: 'auto',
                  padding: '6px 10px',
                }}
                className="scrollbar-thin"
              >
                {/* Context results (always shown when no query) */}
                {!query.trim() && contextResults.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#A0A0B2',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        padding: '6px 6px 4px',
                      }}
                    >
                      Suggested
                    </div>
                    {contextResults.map((result, idx) => (
                      <ResultItem
                        key={result.id}
                        result={result}
                        index={idx}
                        isHighlighted={idx === highlightIndex}
                        onHover={() => setHighlightIndex(idx)}
                        onClick={() => openResult(result)}
                      />
                    ))}
                  </div>
                )}

                {/* Search results */}
                {isSearching && results.length === 0 && (
                  <div
                    style={{
                      padding: '20px 8px',
                      textAlign: 'center',
                      fontSize: 12,
                      color: '#A0A0B2',
                    }}
                  >
                    Searching...
                  </div>
                )}
                {!isSearching && query.trim() && results.length === 0 && (
                  <div
                    style={{
                      padding: '20px 8px',
                      textAlign: 'center',
                      fontSize: 12,
                      color: '#A0A0B2',
                    }}
                  >
                    No results for "{query}"
                  </div>
                )}
                {!query.trim() && contextResults.length === 0 && (
                  <div
                    style={{
                      padding: '20px 8px',
                      textAlign: 'center',
                      fontSize: 12,
                      color: '#A0A0B2',
                    }}
                  >
                    Start typing to search workflows and pages...
                  </div>
                )}

                {(() => {
                  const offset = !query.trim() ? contextResults.length : 0;
                  let globalIndex = offset;
                  return Object.entries(grouped).map(([label, items]) => (
                    <div key={label}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#A0A0B2',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          padding: '6px 6px 4px',
                        }}
                      >
                        {label}
                      </div>
                      {items.map((result) => {
                        const idx = globalIndex++;
                        return (
                          <ResultItem
                            key={result.id}
                            result={result}
                            index={idx}
                            isHighlighted={idx === highlightIndex}
                            onHover={() => setHighlightIndex(idx)}
                            onClick={() => openResult(result)}
                          />
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            ) : (
              /* AI Chat */
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    padding: '10px 16px',
                    maxHeight: 240,
                    overflowY: 'auto',
                  }}
                  className="scrollbar-thin"
                >
                  {chatMessages.length === 0 && !isChatLoading && (
                    <div
                      style={{
                        padding: '16px 0',
                        textAlign: 'center',
                        fontSize: 12,
                        color: '#A0A0B2',
                      }}
                    >
                      Ask about your workflows, guides, or documents...
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        marginBottom: 8,
                        justifyContent:
                          msg.role === 'user' ? 'flex-end' : 'flex-start',
                        gap: msg.role === 'assistant' ? 8 : 0,
                      }}
                    >
                      {msg.role === 'assistant' && (
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            flexShrink: 0,
                            background: 'rgba(26,26,26,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 2,
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#1A1A1A"
                            strokeWidth="2.5"
                          >
                            <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
                          </svg>
                        </div>
                      )}
                      <div
                        style={{
                          padding: '8px 12px',
                          fontSize: 13,
                          lineHeight: 1.5,
                          maxWidth: '85%',
                          borderRadius:
                            msg.role === 'user'
                              ? '14px 14px 4px 14px'
                              : '4px 14px 14px 14px',
                          background:
                            msg.role === 'user' ? '#e14d2a' : '#F5F5F5',
                          color: msg.role === 'user' ? '#fff' : '#1A1A2E',
                          border:
                            msg.role === 'assistant'
                              ? '1px solid rgba(0,0,0,0.07)'
                              : 'none',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          flexShrink: 0,
                          background: 'rgba(26,26,26,0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 2,
                        }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#1A1A1A"
                          strokeWidth="2.5"
                        >
                          <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
                        </svg>
                      </div>
                      <div
                        style={{
                          padding: '8px 12px',
                          fontSize: 13,
                          borderRadius: '4px 14px 14px 14px',
                          background: '#F5F5F5',
                          border: '1px solid rgba(0,0,0,0.07)',
                          color: '#A0A0B2',
                        }}
                      >
                        Thinking...
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ padding: '8px 16px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      border: '1.5px solid rgba(0,0,0,0.07)',
                      borderRadius: 10,
                      background: '#F5F5F5',
                    }}
                  >
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Follow up..."
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'none',
                        fontSize: 13,
                        fontFamily: "'DM Sans', sans-serif",
                        color: '#1A1A2E',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={sendAiMessage}
                      disabled={!query.trim() || isChatLoading}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 7,
                        background: '#1A1A1A',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        opacity: !query.trim() || isChatLoading ? 0.5 : 1,
                      }}
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ FOOTER ═══ */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 16px',
                background: '#F5F5F5',
                borderTop: '1px solid rgba(0,0,0,0.07)',
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                {mode === 'search' ? (
                  <>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        fontSize: 10,
                        color: '#A0A0B2',
                      }}
                    >
                      <span style={kbdStyle}>↑↓</span> Nav
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        fontSize: 10,
                        color: '#A0A0B2',
                      }}
                    >
                      <span style={kbdStyle}>↵</span> Open
                    </span>
                  </>
                ) : (
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: 10,
                      color: '#A0A0B2',
                    }}
                  >
                    <span style={kbdStyle}>↵</span> Send
                  </span>
                )}
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 10,
                    color: '#A0A0B2',
                  }}
                >
                  <span style={kbdStyle}>Tab</span>{' '}
                  {mode === 'search' ? 'AI' : 'Search'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="12" height="11" viewBox="0 0 38 36" fill="none">
                  <rect x="0" y="4" width="32" height="32" rx="9" fill="#E14D2A" />
                  <rect x="7" y="11" width="10" height="3.5" rx="1.75" fill="white" />
                  <rect x="7" y="17.5" width="18" height="3.5" rx="1.75" fill="white" />
                  <rect x="7" y="24" width="14" height="3.5" rx="1.75" fill="white" />
                  <path d="M33 0 L34.5 4.5 L38 6 L34.5 7.5 L33 12 L31.5 7.5 L28 6 L31.5 4.5 Z" fill="#E14D2A" />
                </svg>
                <span
                  style={{ fontSize: 10, color: '#A0A0B2', fontWeight: 500 }}
                >
                  ondoki
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Result Item Component ──────────────────────────────────────────────────

const ResultItem: React.FC<{
  result: SpotlightResult;
  index: number;
  isHighlighted: boolean;
  onHover: () => void;
  onClick: () => void;
}> = ({ result, isHighlighted, onHover, onClick }) => {
  const rType = result.type || result.resource_type;
  const isWorkflow = rType === 'workflow';
  const meta: string[] = [];
  if (result.step_count) meta.push(`${result.step_count} steps`);
  if (result.word_count) meta.push(`${result.word_count} words`);
  if (result.updated_at) meta.push(formatRelativeTime(result.updated_at));

  return (
    <div
      data-result-item
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 0.1s',
        background: isHighlighted ? 'rgba(26,26,26,0.06)' : 'transparent',
        boxShadow: isHighlighted
          ? 'inset 0 0 0 1.5px rgba(26,26,26,0.12)'
          : 'none',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: isWorkflow
            ? 'rgba(26,26,26,0.06)'
            : 'rgba(136,136,136,0.08)',
        }}
      >
        {isWorkflow ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1A1A1A"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        ) : (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#888888"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#1A1A2E',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {result.name || result.resource_name || 'Untitled'}
        </div>
        <div
          style={{
            fontSize: 10,
            color: '#A0A0B2',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {meta.join(' · ')}
        </div>
      </div>
      {isHighlighted && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#A0A0B2"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ flexShrink: 0 }}
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      )}
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

  ::selection { background: rgba(225,77,42,0.2); }
  input::placeholder { color: #A0A0B2; }
`;
document.head.appendChild(styleEl);

// ─── Mount ──────────────────────────────────────────────────────────────────

const container = document.getElementById('spotlight-root');
if (container) {
  const root = createRoot(container);
  root.render(<SpotlightApp />);
}
