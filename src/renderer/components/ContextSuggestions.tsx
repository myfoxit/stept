import React, { useEffect, useMemo, useState } from 'react';

interface ContextMatch {
  id: string;
  resource_type: 'workflow' | 'document';
  resource_id: string;
  resource_name: string;
  resource_summary?: string;
  note?: string;
  priority: number;
}

interface ActiveContext {
  windowTitle: string;
  appName: string;
  url?: string;
}

type SpotMode = 'search' | 'ai';

function appIcon(appName: string) {
  const n = appName.toLowerCase();
  if (n.includes('chrome') || n.includes('safari') || n.includes('firefox') || n.includes('edge') || n.includes('arc')) return '🌐';
  if (n.includes('code')) return '💻';
  if (n.includes('slack')) return '💬';
  if (n.includes('terminal')) return '⌨️';
  return '🧩';
}

export function ContextSuggestions() {
  const [matches, setMatches] = useState<ContextMatch[]>([]);
  const [context, setContext] = useState<ActiveContext | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [spotMode, setSpotMode] = useState<SpotMode>('search');
  const [query, setQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [liveGuide, setLiveGuide] = useState<{ title: string; text: string } | null>(null);
  const [appCounters, setAppCounters] = useState<Record<string, number>>({});

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onContextMatches) return;

    const unsubMatches = api.onContextMatches((newMatches: ContextMatch[], ctx: ActiveContext) => {
      setMatches(newMatches || []);
      setContext(ctx);
      setDismissed(false);
      setCollapsed(false);
      setAppCounters(prev => ({ ...prev, [ctx.appName || 'Unknown']: newMatches?.length || 0 }));
    });
    const unsubNoMatches = api.onContextNoMatches((ctx: ActiveContext) => {
      setMatches([]);
      setContext(ctx || null);
      if (ctx?.appName) setAppCounters(prev => ({ ...prev, [ctx.appName]: 0 }));
    });

    return () => {
      unsubMatches?.();
      unsubNoMatches?.();
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = matches.filter(m => spotMode === 'search');
    if (!q) return list;
    return list.filter(m => `${m.resource_name} ${m.resource_summary || ''} ${m.note || ''}`.toLowerCase().includes(q));
  }, [matches, query, spotMode]);

  if (dismissed) return null;

  const openResource = async (m: ContextMatch) => {
    const api = (window as any).electronAPI;
    const settings = await api.getSettings();
    const frontendUrl = (settings.frontendUrl || 'http://localhost:5173').replace(/\/+$/, '');
    const path = m.resource_type === 'workflow' ? `/workflow/${m.resource_id}` : `/editor/${m.resource_id}`;
    await api.openExternal(`${frontendUrl}${path}`);
    if (m.resource_type === 'workflow') {
      setLiveGuide({ title: m.resource_name, text: m.resource_summary || m.note || 'Workflow opened. Follow steps in the side panel while using your app.' });
    }
  };

  const sendAi = async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChat(c => [...c, { role: 'user', content: text }]);
    setChatInput('');
    try {
      const api = (window as any).electronAPI;
      const res = await api.sendChatMessage([{ role: 'user', content: text }], JSON.stringify({ context, matches }));
      setChat(c => [...c, { role: 'assistant', content: res }]);
    } catch {
      setChat(c => [...c, { role: 'assistant', content: 'AI request failed.' }]);
    }
  };

  const appList = Object.entries(appCounters).filter(([, count]) => count > 0);

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, width: collapsed ? 52 : 440, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,0.2)', zIndex: 99999, overflow: 'hidden' }}>
      {collapsed ? (
        <button onClick={() => setCollapsed(false)} style={{ width: 52, height: 52, border: 0, background: '#6C5CE7', color: '#fff', fontSize: 20, position: 'relative' }}>
          ⌘
          <span style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 999, background: '#ef4444', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{matches.length}</span>
        </button>
      ) : (
        <>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>⌘K Spotlight</strong>
            <div>
              <button onClick={() => setCollapsed(true)} style={{ border: 0, background: 'none' }}>—</button>
              <button onClick={() => setDismissed(true)} style={{ border: 0, background: 'none' }}>×</button>
            </div>
          </div>

          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 6, overflowX: 'auto' }}>
            {appList.length === 0 ? <span style={{ fontSize: 11, color: '#6b7280' }}>No active app contexts yet</span> : appList.map(([name, count]) => (
              <div key={name} style={{ position: 'relative', minWidth: 34, height: 34, borderRadius: 8, background: '#f4f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={name}>
                <span>{appIcon(name)}</span>
                <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 999, background: '#6C5CE7', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{count}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 10px' }}>
              <span>{spotMode === 'search' ? '🔎' : '✨'}</span>
              <input value={spotMode === 'search' ? query : chatInput} onChange={(e) => spotMode === 'search' ? setQuery(e.target.value) : setChatInput(e.target.value)} onKeyDown={(e) => (spotMode === 'ai' && e.key === 'Enter') ? sendAi() : undefined} placeholder={spotMode === 'search' ? 'Search pages and workflows...' : 'Ask AI about this context...'} style={{ flex: 1, border: 0, outline: 'none' }} />
              <span style={{ fontSize: 10, color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 6, padding: '2px 4px' }}>ESC</span>
            </div>

            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <button onClick={() => setSpotMode('search')} style={{ flex: 1, borderRadius: 8, border: spotMode === 'search' ? '1px solid #6C5CE7' : '1px solid #e5e7eb', background: spotMode === 'search' ? '#f4f1ff' : '#fff', padding: 8 }}>Search</button>
              <button onClick={() => setSpotMode('ai')} style={{ flex: 1, borderRadius: 8, border: spotMode === 'ai' ? '1px solid #6C5CE7' : '1px solid #e5e7eb', background: spotMode === 'ai' ? '#f4f1ff' : '#fff', padding: 8 }}>Ask AI</button>
            </div>

            {spotMode === 'search' ? (
              <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                {filtered.map(m => (
                  <div key={m.id} onClick={() => openResource(m)} style={{ padding: '9px 10px', border: '1px solid #eef2f7', borderRadius: 8, marginBottom: 6, cursor: 'pointer' }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{m.resource_type === 'workflow' ? '🔄' : '📄'} {m.resource_name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{m.resource_summary || m.note || ''}</div>
                  </div>
                ))}
                {filtered.length === 0 && <div style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>No matches for this context.</div>}
              </div>
            ) : (
              <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                {chat.map((m, i) => <div key={i} style={{ marginBottom: 8, fontSize: 12 }}><b>{m.role === 'user' ? 'You' : 'AI'}:</b> {m.content}</div>)}
              </div>
            )}

            {liveGuide && (
              <div style={{ marginTop: 8, borderTop: '1px solid #eef2f7', paddingTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Live Guide · {liveGuide.title}</div>
                <div style={{ fontSize: 11, color: '#4b5563' }}>{liveGuide.text}</div>
              </div>
            )}

            {context && (
              <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280' }}>Active: {context.appName}{context.url ? ` · ${new URL(context.url).hostname}` : ''}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
