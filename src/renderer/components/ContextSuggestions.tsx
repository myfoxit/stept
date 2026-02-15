import React, { useState, useEffect } from 'react';

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

export function ContextSuggestions() {
  const [matches, setMatches] = useState<ContextMatch[]>([]);
  const [context, setContext] = useState<ActiveContext | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onContextMatches) return;

    api.onContextMatches((newMatches: ContextMatch[], ctx: ActiveContext) => {
      setMatches(newMatches);
      setContext(ctx);
      setDismissed(false);
      setCollapsed(false);
    });

    api.onContextNoMatches(() => {
      setMatches([]);
      setContext(null);
    });
  }, []);

  if (matches.length === 0 || dismissed) return null;

  const handleOpenResource = async (match: ContextMatch) => {
    const api = (window as any).electronAPI;
    try {
      const settings = await api.getSettings();
      const frontendUrl = (settings.frontendUrl || 'http://localhost:5173').replace(/\/+$/, '');
      const path = match.resource_type === 'workflow' ? `/workflow/${match.resource_id}` : `/editor/${match.resource_id}`;
      api.openExternal(`${frontendUrl}${path}`);
    } catch (err) {
      console.error('Failed to open resource:', err);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      width: collapsed ? 48 : 320,
      background: '#ffffff',
      borderRadius: 12,
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      border: '1px solid #e5e7eb',
      overflow: 'hidden',
      transition: 'width 0.2s ease',
      zIndex: 9999,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          style={{
            width: 48, height: 48, border: 'none', background: '#6366f1',
            borderRadius: 12, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'white',
            fontSize: 18, position: 'relative',
          }}
        >
          📋
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#ef4444', color: 'white', fontSize: 10,
            fontWeight: 700, width: 18, height: 18, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {matches.length}
          </span>
        </button>
      ) : (
        <>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderBottom: '1px solid #e5e7eb',
          }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              📋 Context Suggestions ({matches.length})
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6b7280' }}>—</button>
              <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6b7280' }}>×</button>
            </div>
          </div>
          {context && (
            <div style={{ padding: '6px 14px', fontSize: 11, color: '#9ca3af', borderBottom: '1px solid #f3f4f6' }}>
              {context.appName}{context.url ? ` — ${new URL(context.url).hostname}` : ''}
            </div>
          )}
          <div style={{ maxHeight: 300, overflowY: 'auto', padding: 8 }}>
            {matches.map(m => (
              <div key={m.id} style={{
                padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                cursor: 'pointer',
              }}
              onClick={() => handleOpenResource(m)}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontWeight: 500, fontSize: 13 }}>
                  {m.resource_type === 'workflow' ? '🔄' : '📄'} {m.resource_name}
                </div>
                {m.note && (
                  <div style={{
                    marginTop: 4, padding: '4px 8px', background: '#fef3c7',
                    borderRadius: 6, fontSize: 11, color: '#92400e',
                  }}>
                    📌 {m.note}
                  </div>
                )}
                {m.resource_summary && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                    {m.resource_summary.substring(0, 100)}...
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
