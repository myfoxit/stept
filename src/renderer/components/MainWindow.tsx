import React, { useState, useEffect } from 'react';
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
import {
  Play,
  Square,
  Pause,
  Settings as SettingsIcon,
  MessageCircle,
  Sparkles,
  Check,
  Mic,
  Trash2,
  Circle,
  LogOut,
  LogIn,
  ChevronDown,
  FileText,
} from 'lucide-react';

interface MainWindowProps {}

const MainWindow: React.FC<MainWindowProps> = () => {
  const electronAPI = useElectronAPI();
  const {
    isAuthenticated,
    user,
    projects,
    hasProjects,
    isLoading: authLoading,
    login,
    logout,
  } = useAuth();

  const {
    recordingState,
    steps,
    isLoading: recordingLoading,
    startRecording,
    stopRecording,
    togglePause,
    clearSteps,
    formattedDuration,
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
      <div className="h-screen flex items-center justify-center text-gray-400 text-[13px]">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="h-11 flex-shrink-0 border-b bg-white flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-indigo-500 flex items-center justify-center">
            <Circle className="h-3 w-3 text-white" />
          </div>
          <span className="text-[13px] font-semibold text-gray-800">Ondoki</span>
        </div>

        <div className="flex items-center gap-1">
          {/* AI status dot */}
          <div className="flex items-center gap-1.5 mr-2">
            <div className={`h-1.5 w-1.5 rounded-full ${settings?.llmApiKey ? 'bg-green-400' : 'bg-gray-300'}`} />
            <span className="text-[11px] text-gray-400">{settings?.llmApiKey ? 'AI' : 'No AI'}</span>
          </div>

          {isAuthenticated && (
            <button onClick={() => setShowChatWindow(true)} className="btn-icon" title="Chat">
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => setShowLlmSetup(true)} className="btn-icon" title="AI Setup">
            <Sparkles className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setShowSettingsWindow(true)} className="btn-icon" title="Settings">
            <SettingsIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {!isAuthenticated ? (
          /* Login */
          <div className="flex items-center justify-center h-full p-4">
            <div className="card p-4 w-full max-w-xs space-y-3">
              <div className="text-center space-y-1">
                <h2 className="text-[15px] font-semibold text-gray-800">Welcome to Ondoki</h2>
                <p className="text-xs text-gray-400">Sign in to start creating guides</p>
              </div>
              <button onClick={handleLogin} disabled={authLoading} className="btn-primary w-full h-9">
                <LogIn className="h-3.5 w-3.5 mr-1.5" />
                {authLoading ? 'Signing In...' : 'Sign In'}
              </button>
              <p className="text-center text-[11px] text-gray-300">v{appVersion}</p>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2.5 max-w-md mx-auto">
            {/* Project selector row */}
            <div className="flex items-center gap-2">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="input-field flex-1"
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

              {/* Voice toggle */}
              <button
                onClick={() => setVoiceTranscription(!voiceTranscription)}
                className={`btn-icon flex-shrink-0 ${voiceTranscription ? 'text-indigo-500 bg-indigo-50' : ''}`}
                title={voiceTranscription ? 'Voice transcription on' : 'Voice transcription off'}
              >
                <Mic className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Recording controls */}
            {recordingState.isRecording ? (
              <div className="card p-3 space-y-2.5">
                {/* Status bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {!recordingState.isPaused && (
                      <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    )}
                    <span className="text-[13px] font-medium text-gray-700">
                      {recordingState.isPaused ? 'Paused' : 'Recording'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{formattedDuration}</span>
                    <span>{recordingState.stepCount} steps</span>
                  </div>
                </div>

                {/* Control buttons */}
                <div className="flex gap-1.5">
                  <button onClick={togglePause} disabled={recordingLoading} className="btn-secondary flex-1 gap-1.5">
                    {recordingState.isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    {recordingState.isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button onClick={handleDeleteRecording} disabled={recordingLoading} className="btn-ghost btn-sm">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                  <button onClick={handleCompleteRecording} disabled={recordingLoading} className="btn-primary gap-1.5">
                    <Check className="h-3.5 w-3.5" />
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <button
                  onClick={handleStartRecording}
                  disabled={!hasProjects || !selectedProjectId}
                  className="btn-primary flex-1 h-9 gap-1.5"
                >
                  <Play className="h-3.5 w-3.5" />
                  Start Recording
                </button>
                {steps.length > 0 && (
                  <button onClick={handleGenerateGuide} className="btn-secondary h-9 gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Guide
                  </button>
                )}
              </div>
            )}

            {/* Steps list */}
            {steps.length > 0 && !recordingState.isRecording && (
              <div className="card">
                <div className="px-3 py-2 border-b flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">{steps.length} steps recorded</span>
                  <FileText className="h-3 w-3 text-gray-300" />
                </div>
                <div className="max-h-40 overflow-y-auto scrollbar-thin">
                  {steps.slice(-5).map((step) => (
                    <div key={step.stepNumber} className="flex items-center gap-2.5 px-3 py-1.5 border-b last:border-0">
                      <div className="h-5 w-5 rounded bg-gray-100 text-[10px] font-medium text-gray-500 flex items-center justify-center flex-shrink-0">
                        {step.stepNumber}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 truncate">{step.actionType}</p>
                        <p className="text-[11px] text-gray-400 truncate">{step.description}</p>
                      </div>
                    </div>
                  ))}
                  {steps.length > 5 && (
                    <p className="text-center text-[11px] text-gray-300 py-1">
                      +{steps.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Sign out */}
            <div className="flex justify-center pt-1">
              <button onClick={handleLogout} className="btn-ghost text-xs text-gray-400 gap-1">
                <LogOut className="h-3 w-3" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Status bar */}
      <div className="h-7 flex-shrink-0 border-t bg-white px-3 flex items-center justify-between text-[11px] text-gray-400">
        <span>{isAuthenticated ? user?.email : 'Not signed in'}</span>
        <span>v{appVersion}</span>
      </div>

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
