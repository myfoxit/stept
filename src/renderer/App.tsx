import React, { useEffect, useState, useCallback } from 'react';
import MainWindow from './components/MainWindow';
import SpotlightOverlay from './components/SpotlightOverlay';
import { AddContextNoteDialog } from './components/AddContextNoteDialog';
import useAuth from './hooks/useAuth';

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [showAddContext, setShowAddContext] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [spotlightProjectId, setSpotlightProjectId] = useState('');
  const auth = useAuth();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.electronAPI) {
        console.log('Electron API available');
      } else {
        console.warn('Electron API not available — running without IPC');
      }
      setReady(true);
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // Listen for add-context-note events
  useEffect(() => {
    const unsub = window.electronAPI?.onShowAddContextNote?.(() => setShowAddContext(true));
    return () => { unsub?.(); };
  }, []);

  // Global keyboard shortcut for spotlight (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSpotlightOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Listen for spotlight:open-overlay from main process (tray, global shortcut, etc.)
  useEffect(() => {
    const unsub = window.electronAPI?.onSpotlightOpenOverlay?.((projectId: string) => {
      if (projectId) setSpotlightProjectId(projectId);
      setSpotlightOpen(true);
    });
    return () => { unsub?.(); };
  }, []);

  const openSpotlight = useCallback((projectId: string) => {
    setSpotlightProjectId(projectId);
    setSpotlightOpen(true);
  }, []);

  const closeSpotlight = useCallback(() => {
    setSpotlightOpen(false);
  }, []);

  if (!ready) {
    return (
      <div style={{
        height: '100vh',
        background: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
          <div className="loading-spinner" style={{
            width: 16, height: 16,
            border: '2px solid rgba(108,92,231,0.15)',
            borderTop: '2px solid #6C5CE7',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: '0.82rem', fontFamily: "'DM Sans', sans-serif" }}>Starting Ondoki...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <MainWindow onOpenSpotlight={openSpotlight} />
      <SpotlightOverlay
        isOpen={spotlightOpen}
        onClose={closeSpotlight}
        projectId={spotlightProjectId}
      />
      <AddContextNoteDialog
        isOpen={showAddContext}
        onClose={() => setShowAddContext(false)}
        projects={auth.projects || []}
      />
    </div>
  );
};

export default App;
