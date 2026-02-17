import React, { useState, useEffect } from 'react';
import { getStepTitle, getStepSubtitle, isAiAnnotated } from '../utils/stepDisplay';
import { useAuth } from '../hooks/useAuth';
import { useRecording } from '../hooks/useRecording';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { Project, Settings } from '../../main/preload';
import CaptureSelector from './CaptureSelector';
import ChatWindow from './ChatWindow';
import ExportDialog from './ExportDialog';
import SettingsWindow from './SettingsWindow';
import LlmSetupWizard from './LlmSetupWizard';
import GuidePreview from './GuidePreview';
import { OndokiLogo } from './OndokiLogo';

const MainWindow: React.FC = () => {
  const electronAPI = useElectronAPI();
  const {
    isAuthenticated, user, projects, hasProjects, isLoading: authLoading, login, logout,
  } = useAuth();

  const {
    recordingState, steps, isLoading: recordingLoading, startRecording, stopRecording,
    togglePause, clearSteps, formattedDuration,
  } = useRecording();

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [voiceTranscription, setVoiceTranscription] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showCaptureSelector, setShowCaptureSelector] = useState(false);
  const [showChatWindow, setShowChatWindow] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showSettingsWindow, setShowSettingsWindow] = useState(false);
  const [showLlmSetup, setShowLlmSetup] = useState(false);
  const [showGuidePreview, setShowGuidePreview] = useState(false);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    const loadInitialData = async () => {
      if (!electronAPI) return;
      try {
        const [settingsData, version] = await Promise.all([
          electronAPI.getSettings(),
          electronAPI.getAppVersion(),
        ]);
        setSettings(settingsData);
        setAppVersion(version);
        if (isAuthenticated && !settingsData.llmApiKey) {
          setTimeout(() => setShowLlmSetup(true), 1000);
        }
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };
    loadInitialData();
  }, [electronAPI, isAuthenticated]);

  useEffect(() => {
    if (hasProjects && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [hasProjects, projects, selectedProjectId]);

  const handleLogin = async () => {
    try { await login(); } catch (error) { console.error('Login failed:', error); }
  };
  const handleLogout = async () => {
    try { await logout(); setSelectedProjectId(''); } catch (error) { console.error('Logout failed:', error); }
  };
  const handleStartRecording = () => {
    if (!selectedProjectId) { alert('Please select a project first'); return; }
    setShowCaptureSelector(true);
  };
  const handleCaptureSelected = async (captureArea: any) => {
    setShowCaptureSelector(false);
    try { await startRecording(captureArea, selectedProjectId); }
    catch (error) { console.error('Failed to start recording:', error); alert('Failed to start recording: ' + (error as Error).message); }
  };
  const handleCompleteRecording = async () => {
    try { await stopRecording(); if (steps.length > 0) setShowExportDialog(true); }
    catch (error) { console.error('Failed to stop recording:', error); }
  };
  const handleDeleteRecording = async () => {
    if (confirm('Are you sure you want to delete this recording?')) {
      try { await stopRecording(); clearSteps(); }
      catch (error) { console.error('Failed to delete recording:', error); }
    }
  };
  const handleGenerateGuide = () => {
    if (steps.length === 0) { alert('No steps recorded. Record some steps first.'); return; }
    if (!settings?.llmApiKey) {
      if (confirm('No AI provider configured. Would you like to set one up now?')) setShowLlmSetup(true);
      return;
    }
    setShowGuidePreview(true);
  };

  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--card)', display: 'flex', flexDirection: 'column' }}>
      {!isAuthenticated ? (
        /* ===== SIGN IN SCREEN ===== */
        <div style={{
          padding: '40px 24px 32px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
          flex: 1, justifyContent: 'center',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <OndokiLogo size={48} />
            <span style={{
              fontFamily: "'Outfit', sans-serif", fontWeight: 800,
              fontSize: '1.4rem', letterSpacing: '-0.03em', color: 'var(--dark)',
            }}>ondoki</span>
          </div>
          <p style={{
            fontSize: '0.82rem', color: 'var(--text-secondary)',
            textAlign: 'center', lineHeight: 1.5, marginTop: -8,
          }}>
            AI-powered process documentation.<br />Capture, transcribe, and share.
          </p>
          <button className="btn-primary" onClick={handleLogin} disabled={authLoading}>
            {authLoading ? 'Signing In...' : 'Sign In'}
          </button>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>v{appVersion}</span>
        </div>
      ) : (
        /* ===== DASHBOARD ===== */
        <div style={{ padding: '22px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{
                fontFamily: "'Outfit', sans-serif", fontSize: '1.05rem',
                fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.02em',
              }}>
                Hello, {user?.name || user?.email?.split('@')[0] || 'User'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {user?.email}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="icon-btn" title="Chat" onClick={() => setShowChatWindow(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </button>
              <button className="icon-btn" title="Settings" onClick={() => setShowSettingsWindow(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              </button>
            </div>
          </div>

          {/* Project selector */}
          <div>
            <div className="field-label">Project</div>
            <div style={{ position: 'relative' }}>
              <select
                className="custom-select"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={!hasProjects}
              >
                {hasProjects ? (
                  projects.map((project: Project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))
                ) : (
                  <option value="">No projects</option>
                )}
              </select>
              <svg style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>

          {/* Voice transcription toggle */}
          <div className="toggle-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
              <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-primary)' }}>Voice transcription</span>
            </div>
            <button
              className={`toggle ${voiceTranscription ? 'on' : ''}`}
              onClick={() => setVoiceTranscription(!voiceTranscription)}
            />
          </div>

          {/* Recording controls */}
          {recordingState.isRecording ? (
            <div style={{
              border: !recordingState.isPaused ? '1.5px solid var(--red)' : '1.5px solid var(--border)',
              boxShadow: !recordingState.isPaused ? '0 0 0 3px rgba(255, 95, 87, 0.1)' : 'none',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              background: 'var(--card)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {!recordingState.isPaused && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', animation: 'pulse 2s infinite' }} />
                  )}
                  <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '0.85rem', fontWeight: 700, color: 'var(--dark)' }}>
                    {recordingState.isPaused ? 'Paused' : 'Recording'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span>{formattedDuration}</span>
                  <span>{recordingState.stepCount} {recordingState.stepCount === 1 ? 'step' : 'steps'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-sm ghost" style={{ flex: 1 }} onClick={togglePause} disabled={recordingLoading}>
                  {recordingState.isPaused ? '▶ Resume' : '⏸ Pause'}
                </button>
                <button className="btn-sm ghost" onClick={handleDeleteRecording} disabled={recordingLoading} style={{ color: 'var(--red)' }}>
                  🗑
                </button>
                <button className="btn-sm primary" onClick={handleCompleteRecording} disabled={recordingLoading}>
                  ✓ Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <button className="btn-primary" onClick={handleStartRecording} disabled={!hasProjects || !selectedProjectId}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polygon points="10 8 16 12 10 16 10 8"/>
                </svg>
                Start Capture
              </button>
              {steps.length > 0 && (
                <button className="btn-sm primary" style={{ width: '100%' }} onClick={handleGenerateGuide}>
                  ✨ Generate Guide ({steps.length} steps)
                </button>
              )}
            </>
          )}

          {/* Steps list */}
          {steps.length > 0 && !recordingState.isRecording && (
            <div className="steps-card">
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{steps.length} steps recorded</span>
              </div>
              <div style={{ maxHeight: 160, overflowY: 'auto' }} className="scrollbar-thin">
                {steps.slice(-5).map((step) => (
                  <div key={step.stepNumber} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, background: 'var(--bg)',
                      fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>{step.stepNumber}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getStepTitle(step)}</p>
                      <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getStepSubtitle(step)}</p>
                    </div>
                  </div>
                ))}
                {steps.length > 5 && (
                  <p style={{ textAlign: 'center', fontSize: '0.62rem', color: 'var(--text-muted)', padding: 6 }}>
                    +{steps.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Sign out */}
          <button className="btn-signout" onClick={handleLogout}>Sign Out</button>
        </div>
      )}

      {/* Modals */}
      {showCaptureSelector && (
        <CaptureSelector onSelect={handleCaptureSelected} onCancel={() => setShowCaptureSelector(false)} />
      )}
      {showChatWindow && (
        <ChatWindow steps={steps} onClose={() => setShowChatWindow(false)} />
      )}
      {showExportDialog && (
        <ExportDialog steps={steps} projectId={selectedProjectId} userId={user?.id} onClose={() => setShowExportDialog(false)} />
      )}
      {showSettingsWindow && (
        <SettingsWindow onClose={() => setShowSettingsWindow(false)} onSettingsChange={(newSettings) => setSettings(newSettings)} />
      )}
      {showLlmSetup && (
        <LlmSetupWizard onClose={() => setShowLlmSetup(false)} onComplete={(newSettings) => { setSettings(newSettings); setShowLlmSetup(false); }} />
      )}
      {showGuidePreview && (
        <GuidePreview steps={steps} onClose={() => setShowGuidePreview(false)} />
      )}
    </div>
  );
};

export default MainWindow;
