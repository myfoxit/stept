import React, { useState, useEffect } from 'react';
import { Display, WindowInfo, CaptureArea } from '../../main/preload';
import { useRecording } from '../hooks/useRecording';

interface CaptureSelectorProps {
  onSelect: (captureArea: CaptureArea) => void;
  onCancel: () => void;
}

const CaptureSelector: React.FC<CaptureSelectorProps> = ({ onSelect, onCancel }) => {
  const { displays, windows, loadCaptureOptions, isLoading } = useRecording();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string>('all');

  useEffect(() => { loadCaptureOptions(); }, [loadCaptureOptions]);

  const filteredWindows = windows.filter(w =>
    w.title.toLowerCase().includes(searchTerm.toLowerCase()) || w.processId.toString().includes(searchTerm)
  );

  const handleAllDisplaysSelect = () => { setSelectedId('all'); };
  const handleDisplaySelect = (display: Display) => { setSelectedId(`display-${display.id}`); };
  const handleWindowSelect = (window: WindowInfo) => { setSelectedId(`window-${window.handle}`); };

  const handleStartCapture = () => {
    if (selectedId === 'all') {
      onSelect({ type: 'all-displays' });
    } else if (selectedId.startsWith('display-')) {
      const display = displays.find(d => `display-${d.id}` === selectedId);
      if (display) onSelect({ type: 'single-display', displayId: display.id, displayName: display.name, bounds: display.bounds });
    } else if (selectedId.startsWith('window-')) {
      const win = windows.find(w => `window-${w.handle}` === selectedId);
      if (win) onSelect({ type: 'window', windowHandle: win.handle, windowTitle: win.title, bounds: win.bounds });
    }
  };

  if (isLoading) {
    return (
      <div className="dialog-overlay">
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-xl)', padding: 32, textAlign: 'center' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Loading capture options...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={{
        background: 'var(--card)', borderRadius: 'var(--radius-xl)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.2)', width: 440, maxWidth: '92vw',
        maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
        }}>
          <div className="search-bar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Search windows..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <button className="btn-cap-sm" onClick={handleStartCapture}>Start Capture</button>
        </div>

        {/* Body */}
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', flex: 1 }} className="scrollbar-thin">
          {/* Screens */}
          <div>
            <div style={{ fontSize: '0.64rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>
              Screens
            </div>
            <div className="screens-grid">
              <div className={`screen-opt ${selectedId === 'all' ? 'sel' : ''}`} onClick={handleAllDisplaysSelect}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: selectedId === 'all' ? 'var(--purple)' : 'var(--text-secondary)' }}>
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                <span className="so-name">Entire Screen</span>
                <span className="so-res">All displays</span>
              </div>
              {displays.map((display) => (
                <div key={display.id} className={`screen-opt ${selectedId === `display-${display.id}` ? 'sel' : ''}`}
                  onClick={() => handleDisplaySelect(display)}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                    style={{ color: selectedId === `display-${display.id}` ? 'var(--purple)' : 'var(--text-secondary)' }}>
                    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                  <span className="so-name">{display.name}</span>
                  <span className="so-res">{display.bounds.width} × {display.bounds.height}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Applications */}
          <div>
            <div style={{ fontSize: '0.64rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>
              Applications
            </div>
            {filteredWindows.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {searchTerm ? 'No matching windows' : 'No visible windows'}
              </div>
            ) : (
              <div className="apps-grid">
                {filteredWindows.map((window) => (
                  <div key={window.handle} className={`app-opt ${selectedId === `window-${window.handle}` ? 'sel' : ''}`}
                    onClick={() => handleWindowSelect(window)}>
                    <div className="app-thumb">
                      <div style={{ width: '80%', height: '65%', background: 'linear-gradient(135deg, #DDDDE6, #CCCCD6)', borderRadius: 4 }} />
                    </div>
                    <div className="app-nm">{window.title}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-text" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default CaptureSelector;
