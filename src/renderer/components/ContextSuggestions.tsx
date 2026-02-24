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

type Tab = 'workflows' | 'pages' | 'chat';

export function ContextSuggestions() {
  const [matches, setMatches] = useState<ContextMatch[]>([]);
  const [context, setContext] = useState<ActiveContext | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [tab, setTab] = useState<Tab>('workflows');
  const [query, setQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [selectedGuide, setSelectedGuide] = useState<{ title: string; content: string } | null>(null);
  const [pos, setPos] = useState({ x: 16, y: 16 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onContextMatches) return;

    const unsubMatches = api.onContextMatches((newMatches: ContextMatch[], ctx: ActiveContext) => {
      setMatches(newMatches);
      setContext(ctx);
      setDismissed(false);
      setCollapsed(false);
    });

    const unsubNoMatches = api.onContextNoMatches(() => {
      setMatches([]);
      setContext(null);
    });

    return () => {
      unsubMatches?.();
      unsubNoMatches?.();
    };
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => setPos({ x: Math.max(12, window.innerWidth - e.clientX), y: Math.max(12, window.innerHeight - e.clientY) });
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byTab = matches.filter(m => tab === 'workflows' ? m.resource_type === 'workflow' : m.resource_type === 'document');
    if (!q) return byTab;
    return byTab.filter(m => `${m.resource_name} ${m.resource_summary || ''} ${m.note || ''}`.toLowerCase().includes(q));
  }, [matches, query, tab]);

  if (matches.length === 0 || dismissed) return null;

  const handleOpenResource = async (match: ContextMatch) => {
    const api = (window as any).electronAPI;
    try {
      const settings = await api.getSettings();
      const frontendUrl = (settings.frontendUrl || 'http://localhost:5173').replace(/\/+$/, '');
      const path = match.resource_type === 'workflow' ? `/workflow/${match.resource_id}` : `/editor/${match.resource_id}`;
      api.openExternal(`${frontendUrl}${path}`);

      if (match.resource_type === 'workflow') {
        setSelectedGuide({
          title: match.resource_name,
          content: match.resource_summary || match.note || 'Open workflow details in Ondoki Web. This panel stays movable while you follow steps live.',
        });
      }
    } catch (err) {
      console.error('Failed to open resource:', err);
    }
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text) return;
    const api = (window as any).electronAPI;
    setChat((c) => [...c, { role: 'user', content: text }]);
    setChatInput('');
    try {
      const response = await api.sendChatMessage([{ role: 'user', content: text }], JSON.stringify({ context, matches }));
      setChat((c) => [...c, { role: 'assistant', content: response }]);
    } catch (e) {
      setChat((c) => [...c, { role: 'assistant', content: 'Chat failed. Please try again.' }]);
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: pos.y, right: pos.x, width: collapsed ? 48 : 380, background: '#fff', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.16)', border: '1px solid #e5e7eb', overflow: 'hidden', zIndex: 9999 }}>
      {collapsed ? (
        <button onClick={() => setCollapsed(false)} style={{ width: 48, height: 48, border: 'none', background: '#6366f1', color: '#fff' }}>📋</button>
      ) : (
        <>
          <div onMouseDown={() => setDragging(true)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #eee', cursor: 'move' }}>
            <strong style={{ fontSize: 12 }}>Live Context ({matches.length})</strong>
            <div>
              <button onClick={() => setCollapsed(true)} style={{ border: 0, background: 'none', cursor: 'pointer' }}>—</button>
              <button onClick={() => setDismissed(true)} style={{ border: 0, background: 'none', cursor: 'pointer' }}>×</button>
            </div>
          </div>
          {context && <div style={{ padding: '6px 12px', fontSize: 11, color: '#6b7280' }}>{context.appName}{context.url ? ` · ${new URL(context.url).hostname}` : ''}</div>}
          <div style={{ display: 'flex', gap: 4, padding: '0 10px 8px' }}>
            <button onClick={() => setTab('workflows')} style={{ flex: 1 }}>{tab === 'workflows' ? 'Workflows ✓' : 'Workflows'}</button>
            <button onClick={() => setTab('pages')} style={{ flex: 1 }}>{tab === 'pages' ? 'Pages ✓' : 'Pages'}</button>
            <button onClick={() => setTab('chat')} style={{ flex: 1 }}>{tab === 'chat' ? 'Chat ✓' : 'Chat'}</button>
          </div>

          {tab !== 'chat' ? (
            <>
              <div style={{ padding: '0 10px 8px' }}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pages/workflows" style={{ width: '100%' }} /></div>
              <div style={{ maxHeight: 220, overflowY: 'auto', padding: '0 8px 8px' }}>
                {filtered.map(m => (
                  <div key={m.id} onClick={() => handleOpenResource(m)} style={{ padding: 8, border: '1px solid #eee', borderRadius: 8, marginBottom: 6, cursor: 'pointer' }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{m.resource_type === 'workflow' ? '🔄' : '📄'} {m.resource_name}</div>
                    {m.note && <div style={{ fontSize: 11, color: '#a16207' }}>{m.note}</div>}
                    {m.resource_summary && <div style={{ fontSize: 11, color: '#6b7280' }}>{m.resource_summary.slice(0, 100)}</div>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: 8 }}>
              <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 8 }}>
                {chat.map((m, i) => <div key={i} style={{ fontSize: 12, marginBottom: 6 }}><b>{m.role === 'user' ? 'You' : 'AI'}:</b> {m.content}</div>)}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} placeholder="Ask about this page/workflow" style={{ flex: 1 }} />
                <button onClick={sendChat}>Send</button>
              </div>
            </div>
          )}

          {selectedGuide && (
            <div style={{ borderTop: '1px solid #eee', padding: 10, background: '#f8f7ff' }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Live Guide: {selectedGuide.title}</div>
              <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>{selectedGuide.content}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
