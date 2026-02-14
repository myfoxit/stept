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
  Cloud, 
  Mic, 
  Trash2, 
  Circle 
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
    logout
  } = useAuth();
  
  const {
    recordingState,
    steps,
    isLoading: recordingLoading,
    startRecording,
    stopRecording,
    togglePause,
    clearSteps,
    formattedDuration
  } = useRecording();

  // Local state
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

  // Load settings and app version
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

        // Check if LLM setup is needed
        if (isAuthenticated && !settingsData.llmApiKey) {
          setTimeout(() => setShowLlmSetup(true), 1000);
        }
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };

    loadInitialData();
  }, [electronAPI, isAuthenticated]);

  // Set default project when projects load
  useEffect(() => {
    if (hasProjects && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [hasProjects, projects, selectedProjectId]);

  // Handle login
  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await logout();
      setSelectedProjectId('');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Handle start recording
  const handleStartRecording = () => {
    if (!selectedProjectId) {
      alert('Please select a project first');
      return;
    }
    setShowCaptureSelector(true);
  };

  // Handle capture selection
  const handleCaptureSelected = async (captureArea: any) => {
    setShowCaptureSelector(false);
    try {
      await startRecording(captureArea, selectedProjectId);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to start recording: ' + (error as Error).message);
    }
  };

  // Handle complete recording
  const handleCompleteRecording = async () => {
    try {
      await stopRecording();
      if (steps.length > 0) {
        setShowExportDialog(true);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  // Handle delete recording
  const handleDeleteRecording = async () => {
    if (confirm('Are you sure you want to delete this recording?')) {
      try {
        await stopRecording();
        clearSteps();
      } catch (error) {
        console.error('Failed to delete recording:', error);
      }
    }
  };

  // Handle generate guide
  const handleGenerateGuide = () => {
    if (steps.length === 0) {
      alert('No steps recorded. Record some steps first.');
      return;
    }

    if (!settings?.llmApiKey) {
      if (confirm('No AI provider configured. Would you like to set one up now?')) {
        setShowLlmSetup(true);
      }
      return;
    }

    setShowGuidePreview(true);
  };

  // AI Status
  const getAiStatus = () => {
    if (!settings?.llmApiKey) {
      return { text: '⚪ AI Not Configured', className: 'ai-status not-configured' };
    }
    return { text: '🟢 AI Ready', className: 'ai-status ready' };
  };

  const aiStatus = getAiStatus();

  // Render loading state
  if (authLoading) {
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center space-x-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Circle className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-semibold">Ondoki Desktop</h1>
          </div>

          <div className="flex items-center space-x-2">
            {/* Auth status */}
            <div className="flex items-center space-x-2">
              {settings?.llmApiKey ? (
                <div className="flex items-center space-x-1 text-green-600">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-small">AI Ready</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-gray-400" />
                  <span className="text-small">AI Not Configured</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {isAuthenticated && (
              <button
                onClick={() => setShowChatWindow(true)}
                className="btn-ghost"
                title="Open Chat"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
            )}
            
            <button
              onClick={() => setShowLlmSetup(true)}
              className="btn-ghost"
              title="AI Setup"
            >
              <Sparkles className="h-4 w-4" />
            </button>
            
            <button
              onClick={() => setShowSettingsWindow(true)}
              className="btn-ghost"
              title="Settings"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-md">
          <div className="card">
            <div className="card-header">
              {!isAuthenticated ? (
                <div className="space-y-4 text-center">
                  <h2 className="text-2xl font-semibold">Welcome to Ondoki</h2>
                  <p className="text-muted-foreground">
                    Sign in to start creating guided tutorials
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">
                    Hello{user ? `, ${user.name || user.email}` : ''}!
                  </h2>
                  <p className="text-muted-foreground">Ready to record a new guide?</p>
                </div>
              )}
            </div>

            <div className="card-content space-y-4">
              {!isAuthenticated ? (
                <div className="space-y-4">
                  <button
                    onClick={handleLogin}
                    disabled={authLoading}
                    className="btn-primary w-full h-12 text-base"
                  >
                    {authLoading ? 'Signing In...' : 'Sign In'}
                  </button>
                  <p className="text-center text-xs text-muted-foreground">
                    version {appVersion}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Project selector */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Select project
                    </label>
                    <select
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      className="input-field"
                      disabled={!hasProjects}
                    >
                      {hasProjects ? (
                        projects.map((project: Project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))
                      ) : (
                        <option value="">No projects available</option>
                      )}
                    </select>
                  </div>

                  {/* Voice transcription toggle */}
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="flex items-center space-x-3">
                      <Mic className="h-4 w-4 text-muted-foreground" />
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">Voice transcription</div>
                        <div className="text-xs text-muted-foreground">
                          Capture voice annotations during recording
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`toggle-switch ${voiceTranscription ? 'bg-primary' : 'bg-input'}`}
                      onClick={() => setVoiceTranscription(!voiceTranscription)}
                      data-enabled={voiceTranscription}
                    >
                      <span className="toggle-switch-thumb" />
                    </button>
                  </div>

                  {/* Recording controls */}
                  {recordingState.isRecording ? (
                    <div className="space-y-4">
                      {/* Recording status */}
                      <div className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-center justify-center space-x-2 mb-3">
                          {!recordingState.isPaused && (
                            <div className="h-3 w-3 animate-pulse rounded-full bg-destructive" />
                          )}
                          <span className="font-medium">
                            {recordingState.isPaused ? 'Capture paused' : 'Recording...'}
                          </span>
                        </div>
                        <div className="text-center text-sm text-muted-foreground">
                          {formattedDuration} • {recordingState.stepCount} steps captured
                        </div>
                      </div>

                      {/* Control buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={togglePause}
                          disabled={recordingLoading}
                          className="btn-secondary flex flex-1 items-center justify-center gap-2"
                        >
                          {recordingState.isPaused ? (
                            <Play className="h-4 w-4" />
                          ) : (
                            <Pause className="h-4 w-4" />
                          )}
                          {recordingState.isPaused ? 'Resume' : 'Pause'}
                        </button>
                        
                        <button
                          onClick={handleDeleteRecording}
                          disabled={recordingLoading}
                          className="btn-destructive flex items-center justify-center gap-2"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>

                      {/* Complete recording */}
                      <button
                        onClick={handleCompleteRecording}
                        disabled={recordingLoading}
                        className="btn-primary w-full h-12 flex items-center justify-center gap-2"
                      >
                        <Check className="h-4 w-4" />
                        Complete Recording
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Start recording */}
                      <button
                        onClick={handleStartRecording}
                        disabled={!hasProjects || !selectedProjectId}
                        className="btn-primary w-full h-12 flex items-center justify-center gap-2"
                      >
                        <Play className="h-4 w-4" />
                        Start Recording
                      </button>

                      {/* Generate guide (if steps exist) */}
                      {steps.length > 0 && (
                        <button
                          onClick={handleGenerateGuide}
                          className="btn-secondary w-full flex items-center justify-center gap-2"
                        >
                          <Sparkles className="h-4 w-4" />
                          Generate Guide
                        </button>
                      )}
                    </div>
                  )}

                  {/* Logout */}
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={handleLogout}
                      className="btn-ghost text-muted-foreground"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Steps preview (if any) */}
          {steps.length > 0 && (
            <div className="mt-6 card">
              <div className="card-header">
                <h3 className="text-lg font-medium">Recent Recording</h3>
                <p className="text-small">{steps.length} steps captured</p>
              </div>
              <div className="card-content">
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {steps.slice(-3).map((step, index) => (
                    <div key={step.stepNumber} className="flex items-start gap-3 p-2 rounded-md bg-muted/50">
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-primary text-xs text-primary-foreground">
                        {step.stepNumber}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{step.actionType}</p>
                        <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                      </div>
                      {step.screenshotPath && (
                        <div className="h-8 w-8 flex-shrink-0 rounded bg-secondary" />
                      )}
                    </div>
                  ))}
                  {steps.length > 3 && (
                    <p className="text-center text-xs text-muted-foreground">
                      ... and {steps.length - 3} more steps
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Status Bar */}
      <div className="border-t border-border bg-muted/30 px-6 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            {isAuthenticated ? `Connected as ${user?.email}` : 'Not authenticated'}
          </div>
          <div>v{appVersion}</div>
        </div>
      </div>

      {/* Dialogs/Modals */}
      {showCaptureSelector && (
        <CaptureSelector
          onSelect={handleCaptureSelected}
          onCancel={() => setShowCaptureSelector(false)}
        />
      )}
      
      {showChatWindow && (
        <ChatWindow
          steps={steps}
          onClose={() => setShowChatWindow(false)}
        />
      )}
      
      {showExportDialog && (
        <ExportDialog
          steps={steps}
          projectId={selectedProjectId}
          userId={user?.id}
          onClose={() => setShowExportDialog(false)}
        />
      )}
      
      {showSettingsWindow && (
        <SettingsWindow
          onClose={() => setShowSettingsWindow(false)}
          onSettingsChange={(newSettings) => setSettings(newSettings)}
        />
      )}
      
      {showLlmSetup && (
        <LlmSetupWizard
          onClose={() => setShowLlmSetup(false)}
          onComplete={(newSettings) => {
            setSettings(newSettings);
            setShowLlmSetup(false);
          }}
        />
      )}
      
      {showGuidePreview && (
        <GuidePreview
          steps={steps}
          onClose={() => setShowGuidePreview(false)}
        />
      )}
    </div>
  );
};

export default MainWindow;