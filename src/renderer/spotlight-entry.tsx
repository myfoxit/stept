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

interface PreviewData {
  title?: string;
  name?: string;
  summary?: string;
  content?: string;
  steps?: { stepNumber: number; description: string; generatedTitle?: string }[];
  word_count?: number;
  step_count?: number;
  updated_at?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ContextInfo {
  windowTitle?: string;
  appName?: string;
  url?: string;
  manualItems?: { type: string; content: string }[];
  clipboardText?: string;
}

type SpotMode = 'search' | 'ai';

// ─── Helpers ────────────────────────────────────────────────────────────────

const QUESTION_PATTERN = /^(how|what|why|when|where|who|which|can|does|is|are|do|should|could|would|tell|explain|describe|show)\b/i;

function groupResults(results: SpotlightResult[]): Record<string, SpotlightResult[]> {
  const groups: Record<string, SpotlightResult[]> = {};
  for (const r of results) {
    const type = r.type || r.resource_type || 'other';
    const label = type === 'workflow' ? 'Workflows' : type === 'document' || type === 'page' ? 'Pages' : 'Results';
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
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

// ─── CSS variables (inline since this is a standalone window) ───────────────

const CSS_VARS: Record<string, string> = {
  '--purple': '#6C5CE7',
  '--purple-hover': '#5A4BD6',
  '--purple-light': 'rgba(108, 92, 231, 0.08)',
  '--teal': '#00D2D3',
  '--teal-light': 'rgba(0, 210, 211, 0.08)',
  '--dark': '#1A1A2E',
  '--bg': '#FAFAFC',
  '--card': '#FFFFFF',
  '--border': 'rgba(0, 0, 0, 0.07)',
  '--text-primary': '#1A1A2E',
  '--text-secondary': '#6E6E82',
  '--text-muted': '#A0A0B2',
  '--green': '#28C840',
  '--green-light': 'rgba(40, 200, 64, 0.08)',
};

// ─── Spotlight Component ────────────────────────────────────────────────────

const SpotlightApp: React.FC = () => {
  const [mode, setMode] = useState<SpotMode>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotlightResult[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply CSS vars
  useEffect(() => {
    for (const [key, value] of Object.entries(CSS_VARS)) {
      document.documentElement.style.setProperty(key, value);
    }
  }, []);

  // Initialize - get project ID from main process
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // Listen for spotlight data from main process
    const unsub = api.onSpotlightOpenOverlay?.((pid: string) => {
      if (pid) setProjectId(pid);
      setQuery('');
      setResults([]);
      setHighlightIndex(0);
      setPreviewData(null);
      setChatMessages([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    });

    // Listen for context updates
    const unsubCtx = api.onContextMatches?.((matches, ctx) => {
      setContextInfo({
        windowTitle: ctx?.windowTitle,
        appName: ctx?.appName,
        url: ctx?.url,
      });
    });

    // Get initial context
    api.contextGetActive?.().then((ctx) => {
      if (ctx) {
        setContextInfo({
          windowTitle: ctx.windowTitle,
          appName: ctx.appName,
          url: ctx.url,
        });
      }
    });

    return () => { unsub?.(); unsubCtx?.(); };
  }, []);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Fetch preview when highlighted result changes
  useEffect(() => {
    if (mode !== 'search' || results.length === 0) {
      setPreviewData(null);
      return;
    }
    const highlighted = results[highlightIndex];
    if (!highlighted) { setPreviewData(null); return; }

    const inlinePreview: PreviewData = {
      title: highlighted.name || highlighted.resource_name,
      summary: highlighted.preview || highlighted.summary || highlighted.resource_summary || highlighted.note || '',
      step_count: highlighted.step_count,
      word_count: highlighted.word_count,
      updated_at: highlighted.updated_at,
    };
    setPreviewData(inlinePreview);

    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    previewTimeoutRef.current = setTimeout(async () => {
      const api = window.electronAPI;
      if (!api?.spotlightPreview) return;
      const id = highlighted.id || (highlighted as any).resource_id;
      const type = highlighted.type || highlighted.resource_type || 'document';
      if (!id) return;
      setIsLoadingPreview(true);
      try {
        const result = await api.spotlightPreview(id, type);
        if (result?.preview) setPreviewData(prev => ({ ...prev, ...result.preview }));
      } catch {} finally { setIsLoadingPreview(false); }
    }, 300);

    return () => { if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current); };
  }, [highlightIndex, results, mode]);

  // Search
  const performSearch = useCallback(async (text: string) => {
    if (!text.trim() || !projectId) { setResults([]); return; }
    setIsSearching(true);
    try {
      const api = window.electronAPI;
      if (!api) return;
      const kwResult = await api.spotlightSearch(text, projectId);
      let list: SpotlightResult[] = (kwResult?.results || []).map((r: any) => ({
        ...r, name: r.name || r.resource_name || 'Untitled',
      }));
      if (text.length > 20 || QUESTION_PATTERN.test(text)) {
        try {
          const semResult = await api.spotlightSemanticSearch(text, projectId);
          const semResults = (semResult?.results || []).map((r: any) => ({
            ...r, name: r.name || r.resource_name || 'Untitled',
          }));
          if (semResults.length > 0) {
            list = [...semResults, ...list.filter((r) => !new Set(semResults.map((s: SpotlightResult) => s.id)).has(r.id))];
          }
        } catch {}
      }
      setResults(list);
      setHighlightIndex(0);
    } catch { setResults([]); } finally { setIsSearching(false); }
  }, [projectId]);

  useEffect(() => {
    if (mode !== 'search') return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => performSearch(query), 200);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, mode, performSearch]);

  // Open result
  const openResult = useCallback(async (result: SpotlightResult) => {
    const api = window.electronAPI;
    if (!api) return;
    try {
      const settings = await api.getSettings();
      const frontendUrl = (settings.frontendUrl || 'http://localhost:5173').replace(/\/+$/, '');
      const id = result.id || (result as any).resource_id;
      const type = result.type || result.resource_type;
      const path = type === 'workflow' ? `/workflow/${id}` : `/editor/${id}`;
      await api.openExternal(`${frontendUrl}${path}`);
      dismissSpotlight();
    } catch (err) { console.error('Failed to open result:', err); }
  }, []);

  // Dismiss
  const dismissSpotlight = useCallback(() => {
    const api = window.electronAPI;
    (api as any)?.spotlightDismiss?.();
  }, []);

  // Send AI message — include context automatically
  const sendAiMessage = useCallback(async () => {
    const text = query.trim();
    if (!text || isChatLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    setChatMessages(prev => [...prev, userMsg]);
    setQuery('');
    setIsChatLoading(true);
    try {
      const api = window.electronAPI;
      if (!api) throw new Error('API not available');

      // Build context string from active context
      let contextStr = JSON.stringify({ project_id: projectId });
      if (contextInfo) {
        contextStr = JSON.stringify({
          project_id: projectId,
          active_context: contextInfo,
        });
      }

      const response = await api.sendChatMessage(
        [{ role: 'user', content: text }],
        contextStr
      );
      setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I couldn\'t process that request. Please try again.' }]);
    } finally { setIsChatLoading(false); }
  }, [query, projectId, isChatLoading, contextInfo]);

  // Keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { dismissSpotlight(); return; }
    if (e.key === 'Tab') { e.preventDefault(); setMode(prev => prev === 'search' ? 'ai' : 'search'); return; }
    if (mode === 'search') {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIndex(prev => Math.min(prev + 1, results.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIndex(prev => Math.max(prev - 1, 0)); }
      else if (e.key === 'Enter' && results[highlightIndex]) { e.preventDefault(); openResult(results[highlightIndex]); }
    } else if (mode === 'ai' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
  }, [mode, results, highlightIndex, dismissSpotlight, openResult, sendAiMessage]);

  // Scroll into view
  useEffect(() => {
    if (!resultsRef.current) return;
    const items = resultsRef.current.querySelectorAll('[data-result-item]');
    items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  const grouped = groupResults(results);
  const hasResults = results.length > 0;
  const highlightedResult = results[highlightIndex];

  const kbdStyle: React.CSSProperties = {
    display: 'inline-flex', padding: '1px 4px', borderRadius: 4,
    background: 'rgba(108,92,231,0.1)', border: '1px solid rgba(108,92,231,0.18)',
    fontFamily: "'JetBrains Mono', monospace", fontSize: '0.52rem', fontWeight: 500,
    color: '#6C5CE7', lineHeight: 1.3,
  };

  return (
    <div
      style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 0,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) dismissSpotlight(); }}
    >
      {/* Spotlight Card */}
      <div style={{
        width: hasResults && mode === 'search' ? 780 : 580,
        maxWidth: '92vw',
        background: '#FFFFFF',
        borderRadius: 20,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.07)',
        overflow: 'hidden',
        animation: 'spotlightIn 0.15s ease-out',
        transition: 'width 0.2s ease',
      }}>
        {/* Context Badge */}
        {contextInfo && contextInfo.appName && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 18px',
            background: 'rgba(40, 200, 64, 0.06)',
            borderBottom: '1px solid rgba(40, 200, 64, 0.12)',
            fontSize: '0.6rem', color: '#6E6E82',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#28C840', flexShrink: 0,
            }} />
            <span style={{ fontWeight: 600 }}>Context:</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {contextInfo.appName}{contextInfo.windowTitle ? ` — ${contextInfo.windowTitle}` : ''}
            </span>
          </div>
        )}

        {/* Search Input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.07)',
        }}>
          {mode === 'search' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C5CE7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C5CE7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
            </svg>
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'search' ? 'Search workflows, pages, guides...' : 'Ask anything about your knowledge base...'}
            style={{
              flex: 1, border: 'none', background: 'none',
              fontFamily: "'DM Sans', sans-serif", fontSize: '0.92rem',
              color: '#1A1A2E', outline: 'none',
            }}
          />
          <span style={kbdStyle}>ESC</span>
        </div>

        {/* Mode Switch */}
        <div style={{
          display: 'flex', padding: '8px 18px', gap: 0,
          borderBottom: '1px solid rgba(0,0,0,0.07)',
        }}>
          {(['search', 'ai'] as SpotMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: 7, border: 'none',
                fontFamily: "'Outfit', sans-serif", fontSize: '0.72rem', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center', borderRadius: 8,
                color: mode === m ? '#6C5CE7' : '#A0A0B2',
                background: mode === m ? 'rgba(108,92,231,0.08)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              {m === 'search' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
                </svg>
              )}
              {m === 'search' ? 'Search' : 'Ask AI'}
            </button>
          ))}
        </div>

        {/* Content Area */}
        {mode === 'search' ? (
          <div style={{ display: 'flex', maxHeight: 340 }}>
            {/* Results List */}
            <div ref={resultsRef} style={{
              flex: hasResults ? '0 0 55%' : '1 1 100%', padding: '8px 12px', overflowY: 'auto',
              borderRight: hasResults ? '1px solid rgba(0,0,0,0.07)' : 'none',
            }} className="scrollbar-thin">
              {isSearching && results.length === 0 && (
                <div style={{ padding: '20px 8px', textAlign: 'center' }}>
                  <div style={{ width: 16, height: 16, border: '2px solid rgba(108,92,231,0.15)', borderTop: '2px solid #6C5CE7', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
                  <span style={{ fontSize: '0.72rem', color: '#A0A0B2' }}>Searching...</span>
                </div>
              )}
              {!isSearching && query.trim() && results.length === 0 && (
                <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: '0.72rem', color: '#A0A0B2' }}>
                  No results found for &ldquo;{query}&rdquo;
                </div>
              )}
              {!query.trim() && !isSearching && (
                <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: '0.72rem', color: '#A0A0B2' }}>
                  Start typing to search your workflows and pages...
                </div>
              )}
              {(() => {
                let globalIndex = 0;
                return Object.entries(grouped).map(([label, items]) => (
                  <div key={label}>
                    <div style={{ fontSize: '0.56rem', fontWeight: 600, color: '#A0A0B2', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 6px 4px' }}>{label}</div>
                    {items.map((result) => {
                      const idx = globalIndex++;
                      const isHighlighted = idx === highlightIndex;
                      const rType = result.type || result.resource_type;
                      const isWorkflow = rType === 'workflow';
                      const meta: string[] = [];
                      if (result.step_count) meta.push(`${result.step_count} steps`);
                      if (result.word_count) meta.push(`${result.word_count} words`);
                      if (result.updated_at) meta.push(formatRelativeTime(result.updated_at));
                      return (
                        <div key={result.id} data-result-item onClick={() => openResult(result)} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8,
                          cursor: 'pointer', transition: 'all 0.12s',
                          background: isHighlighted ? 'rgba(108,92,231,0.08)' : 'transparent',
                          boxShadow: isHighlighted ? 'inset 0 0 0 1.5px rgba(108,92,231,0.18)' : 'none',
                        }} onMouseEnter={() => setHighlightIndex(idx)}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            background: isWorkflow ? 'rgba(108,92,231,0.08)' : 'rgba(0,210,211,0.08)',
                          }}>
                            {isWorkflow ? (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6C5CE7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/></svg>
                            ) : (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00D2D3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/></svg>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#1A1A2E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{result.name || result.resource_name || 'Untitled'}</div>
                            <div style={{ fontSize: '0.6rem', color: '#A0A0B2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.join(' · ')}</div>
                          </div>
                          {isHighlighted && <span style={{ fontSize: '0.56rem', color: '#A0A0B2', flexShrink: 0 }}>↵</span>}
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>

            {/* Preview Panel */}
            {hasResults && (
              <div style={{ flex: '0 0 45%', padding: '14px 16px', overflowY: 'auto', background: '#FAFAFC' }} className="scrollbar-thin">
                {previewData ? (
                  <div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        {(() => {
                          const rType = highlightedResult?.type || highlightedResult?.resource_type;
                          const isWorkflow = rType === 'workflow';
                          return <span style={{ display: 'inline-flex', padding: '2px 7px', borderRadius: 4, fontSize: '0.52rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', background: isWorkflow ? 'rgba(108,92,231,0.08)' : 'rgba(0,210,211,0.08)', color: isWorkflow ? '#6C5CE7' : '#00D2D3' }}>{isWorkflow ? 'Workflow' : 'Page'}</span>;
                        })()}
                        {isLoadingPreview && <div style={{ width: 10, height: 10, border: '1.5px solid rgba(108,92,231,0.15)', borderTop: '1.5px solid #6C5CE7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                      </div>
                      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '0.88rem', fontWeight: 700, color: '#1A1A2E', lineHeight: 1.3 }}>
                        {previewData.title || previewData.name || highlightedResult?.name || 'Untitled'}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        {previewData.step_count && <span style={{ fontSize: '0.58rem', color: '#A0A0B2' }}>{previewData.step_count} steps</span>}
                        {previewData.word_count && <span style={{ fontSize: '0.58rem', color: '#A0A0B2' }}>{previewData.word_count} words</span>}
                        {previewData.updated_at && <span style={{ fontSize: '0.58rem', color: '#A0A0B2' }}>{formatRelativeTime(previewData.updated_at)}</span>}
                      </div>
                    </div>
                    {previewData.summary && (
                      <div style={{ fontSize: '0.72rem', lineHeight: 1.6, color: '#6E6E82', marginBottom: 12, padding: '10px 12px', background: '#FFFFFF', borderRadius: 8, border: '1px solid rgba(0,0,0,0.07)' }}>
                        {previewData.summary.length > 300 ? previewData.summary.slice(0, 300) + '...' : previewData.summary}
                      </div>
                    )}
                    {previewData.steps && previewData.steps.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.56rem', fontWeight: 600, color: '#A0A0B2', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Steps</div>
                        {previewData.steps.slice(0, 5).map((step, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: i < Math.min(previewData.steps!.length, 5) - 1 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
                            <span style={{ width: 18, height: 18, borderRadius: 5, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', fontSize: '0.56rem', fontWeight: 600, color: '#A0A0B2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{step.stepNumber || i + 1}</span>
                            <span style={{ fontSize: '0.68rem', color: '#1A1A2E', lineHeight: 1.4 }}>{step.generatedTitle || step.description || `Step ${step.stepNumber || i + 1}`}</span>
                          </div>
                        ))}
                        {previewData.steps.length > 5 && <div style={{ fontSize: '0.6rem', color: '#A0A0B2', padding: '6px 0' }}>+{previewData.steps.length - 5} more steps</div>}
                      </div>
                    )}
                    {previewData.content && !previewData.steps && (
                      <div style={{ fontSize: '0.68rem', lineHeight: 1.6, color: '#6E6E82', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'hidden', maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)' }}>
                        {previewData.content.slice(0, 500)}
                      </div>
                    )}
                    <button onClick={() => highlightedResult && openResult(highlightedResult)} style={{
                      marginTop: 14, width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #6C5CE7', background: 'rgba(108,92,231,0.08)', fontFamily: "'Outfit', sans-serif", fontSize: '0.7rem', fontWeight: 600, color: '#6C5CE7', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }} onMouseEnter={(e) => { e.currentTarget.style.background = '#6C5CE7'; e.currentTarget.style.color = 'white'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(108,92,231,0.08)'; e.currentTarget.style.color = '#6C5CE7'; }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      Open in Browser
                    </button>
                  </div>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A0A0B2', fontSize: '0.72rem' }}>Select a result to preview</div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* AI Chat */
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', maxHeight: 280, overflowY: 'auto', borderBottom: chatMessages.length > 0 || isChatLoading ? '1px solid rgba(0,0,0,0.07)' : 'none' }} className="scrollbar-thin">
              {chatMessages.length === 0 && !isChatLoading && (
                <div style={{ padding: '16px 0', textAlign: 'center', fontSize: '0.72rem', color: '#A0A0B2' }}>
                  Ask a question about your workflows, guides, or documents...
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', marginBottom: 8, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: msg.role === 'assistant' ? 8 : 0 }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: 'rgba(108,92,231,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6C5CE7" strokeWidth="2.5"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>
                    </div>
                  )}
                  <div style={{
                    padding: '9px 13px', fontSize: '0.76rem', lineHeight: 1.5, maxWidth: '88%',
                    borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                    background: msg.role === 'user' ? '#6C5CE7' : '#FAFAFC',
                    color: msg.role === 'user' ? 'white' : '#1A1A2E',
                    border: msg.role === 'assistant' ? '1px solid rgba(0,0,0,0.07)' : 'none',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>{msg.content}</div>
                </div>
              ))}
              {isChatLoading && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: 'rgba(108,92,231,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6C5CE7" strokeWidth="2.5"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>
                  </div>
                  <div style={{ padding: '9px 13px', fontSize: '0.76rem', borderRadius: '4px 14px 14px 14px', background: '#FAFAFC', border: '1px solid rgba(0,0,0,0.07)', color: '#A0A0B2' }}>Thinking...</div>
                </div>
              )}
            </div>
            <div style={{ padding: '10px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', border: '1.5px solid rgba(0,0,0,0.07)', borderRadius: 10, background: '#FAFAFC' }}>
                <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKeyDown} placeholder="Follow up..." style={{ flex: 1, border: 'none', background: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: '0.78rem', color: '#1A1A2E', outline: 'none' }} />
                <button onClick={sendAiMessage} disabled={!query.trim() || isChatLoading} style={{ width: 26, height: 26, borderRadius: 7, background: '#6C5CE7', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0, opacity: !query.trim() || isChatLoading ? 0.5 : 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 18px', background: '#FAFAFC', borderTop: '1px solid rgba(0,0,0,0.07)',
        }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {mode === 'search' ? (
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.56rem', color: '#A0A0B2' }}>
                  <span style={kbdStyle}>↑↓</span> Navigate
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.56rem', color: '#A0A0B2' }}>
                  <span style={kbdStyle}>↵</span> Open
                </span>
              </>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.56rem', color: '#A0A0B2' }}>
                <span style={kbdStyle}>↵</span> Send
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.56rem', color: '#A0A0B2' }}>
              <span style={kbdStyle}>Tab</span> Switch
            </span>
          </div>
          <span style={{ fontSize: '0.58rem', color: '#A0A0B2' }}>
            {mode === 'search' ? `${results.length} result${results.length !== 1 ? 's' : ''}` : 'AI Chat'}
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Mount ──────────────────────────────────────────────────────────────────

const container = document.getElementById('spotlight-root');
if (container) {
  const root = createRoot(container);
  root.render(<SpotlightApp />);
}
