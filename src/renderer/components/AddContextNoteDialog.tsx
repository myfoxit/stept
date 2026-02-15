import React, { useState, useEffect } from 'react';

interface ActiveContext {
  windowTitle: string;
  appName: string;
  url?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projects: Array<{ id: string; name: string }>;
}

export function AddContextNoteDialog({ isOpen, onClose, projects }: Props) {
  const [activeContext, setActiveContext] = useState<ActiveContext | null>(null);
  const [matchType, setMatchType] = useState('url_pattern');
  const [matchValue, setMatchValue] = useState('');
  const [note, setNote] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [resourceType, setResourceType] = useState('document');
  const [resourceId, setResourceId] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      window.electronAPI?.contextGetActive?.().then((ctx) => {
        if (ctx) {
          setActiveContext(ctx);
          if (ctx.url) {
            setMatchType('url_pattern');
            try {
              const urlObj = new URL(ctx.url);
              setMatchValue(`*${urlObj.hostname}*`);
            } catch {
              setMatchValue(ctx.url);
            }
          } else {
            setMatchType('app_name');
            setMatchValue(ctx.appName);
          }
        }
      });
      if (projects.length > 0 && !selectedProject) {
        setSelectedProject(projects[0].id);
      }
    }
  }, [isOpen, projects]);

  const handleSave = async () => {
    if (!matchValue.trim() || !selectedProject) return;
    setSaving(true);
    try {
      await window.electronAPI?.contextAddLink({
        project_id: selectedProject,
        match_type: matchType,
        match_value: matchValue,
        resource_type: resourceType || 'document',
        resource_id: resourceId || 'note-only',
        note: note || undefined,
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
        setNote('');
        setMatchValue('');
        setResourceId('');
      }, 1000);
    } catch (e) {
      console.error('Failed to save context link:', e);
    }
    setSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
    }}>
      <div style={{
        background: 'white', borderRadius: 12, width: 360, padding: 24,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>📝 Add Context Note</h3>

        {activeContext && (
          <div style={{
            padding: '8px 12px', background: '#f3f4f6', borderRadius: 8,
            fontSize: 12, marginBottom: 16, color: '#374151',
          }}>
            <strong>Current:</strong> {activeContext.appName}
            {activeContext.url && <div style={{ marginTop: 2, color: '#6b7280', wordBreak: 'break-all' }}>{activeContext.url}</div>}
          </div>
        )}

        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Project</label>
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 12 }}
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Match Type</label>
        <select
          value={matchType}
          onChange={e => setMatchType(e.target.value)}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 12 }}
        >
          <option value="url_pattern">URL Pattern (glob)</option>
          <option value="url_exact">Exact URL</option>
          <option value="app_name">App Name</option>
          <option value="window_title">Window Title</option>
        </select>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Match Value</label>
        <input
          value={matchValue}
          onChange={e => setMatchValue(e.target.value)}
          placeholder={matchType === 'url_pattern' ? '*.google.com*' : matchType === 'app_name' ? 'Google Chrome' : 'value'}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }}
        />

        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Note</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Important: always check X before Y..."
          rows={3}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 16, resize: 'vertical', boxSizing: 'border-box' }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db',
            background: 'white', fontSize: 13, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !matchValue.trim()} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none',
            background: success ? '#059669' : '#6366f1', color: 'white',
            fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1,
          }}>
            {success ? '✓ Saved!' : saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
