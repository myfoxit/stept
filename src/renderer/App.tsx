import React, { useEffect, useState } from 'react';
import MainWindow from './components/MainWindow';
import { ContextSuggestions } from './components/ContextSuggestions';
import { AddContextNoteDialog } from './components/AddContextNoteDialog';
import useAuth from './hooks/useAuth';

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [showAddContext, setShowAddContext] = useState(false);
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

  useEffect(() => {
    const unsub = window.electronAPI?.onShowAddContextNote?.(() => setShowAddContext(true));
    return () => { unsub?.(); };
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
      <MainWindow />
      <ContextSuggestions />
      <AddContextNoteDialog
        isOpen={showAddContext}
        onClose={() => setShowAddContext(false)}
        projects={auth.projects || []}
      />
    </div>
  );
};

export default App;
