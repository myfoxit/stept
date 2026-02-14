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

// Icons (using emoji for now, but you could use a proper icon library)
const Icons = {
  Play: () => <span className="text-lg">▶️</span>,
  Stop: () => <span className="text-lg">⏹️</span>,
  Pause: () => <span className="text-lg">⏸️</span>,
  Resume: () => <span className="text-lg">▶️</span>,
  Settings: () => <span className="text-lg">⚙️</span>,
  Chat: () => <span className="text-lg">💬</span>,
  Ai: () => <span className="text-lg">✨</span>,
  Check: () => <span className="text-lg">✅</span>,
  Upload: () => <span className="text-lg">☁️</span>,
  Mic: () => <span className="text-lg">🎤</span>,
  Delete: () => <span className="text-lg">🗑️</span>,
  Logo: () => <span className="text-4xl font-bold text-indigo-600">O</span>,
  Equalizer: () => <span className="text-5xl">📊</span>,
};

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
    <div className="h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 p-6">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
            {/* Top toolbar */}
            <div className="flex justify-end items-center mb-6 space-x-2">
              <span className={`text-sm ${aiStatus.className}`}>
                {aiStatus.text}
              </span>
              
              {isAuthenticated && (
                <button
                  onClick={() => setShowChatWindow(true)}
                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Open Chat"
                >
                  <Icons.Chat />
                </button>
              )}
              
              <button
                onClick={() => setShowLlmSetup(true)}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="AI Setup"
              >
                <Icons.Ai />
              </button>
              
              <button
                onClick={() => setShowSettingsWindow(true)}
                className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                title="Settings"
              >
                <Icons.Settings />
              </button>
            </div>

            {/* Logo */}
            <div className="flex justify-center mb-8">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100">
                <Icons.Logo />
              </div>
            </div>

            {/* Login Panel */}
            {!isAuthenticated && (
              <div className="text-center">
                <button
                  onClick={handleLogin}
                  disabled={authLoading}
                  className="btn-primary w-full h-12 text-lg mb-8"
                  style={{ borderRadius: '24px' }}
                >
                  {authLoading ? 'Signing In...' : 'Sign In'}
                </button>
                
                <p className="text-xs text-gray-400">
                  version {appVersion}
                </p>
              </div>
            )}

            {/* User Panel */}
            {isAuthenticated && (
              <div className="space-y-4">
                {/* Greeting */}
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Hello{user ? `, ${user.name || user.email}` : ''}!
                  </h2>
                </div>

                {/* Project selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Icons.Mic />
                    <span className="text-sm font-medium text-gray-700">
                      Voice transcription
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch ${voiceTranscription ? 'bg-indigo-600' : 'bg-gray-200'}`}
                    onClick={() => setVoiceTranscription(!voiceTranscription)}
                    data-enabled={voiceTranscription}
                  >
                    <span className="toggle-switch-thumb" />
                  </button>
                </div>

                {/* Recording controls */}
                {recordingState.isRecording ? (
                  <div className="space-y-4">
                    {/* Status */}
                    <div className="text-center">
                      <div className="flex items-center justify-center space-x-2 mb-2">
                        {!recordingState.isPaused && (
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                        )}
                        <span className="font-medium">
                          {recordingState.isPaused ? 'Capture paused' : 'Capturing...'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {formattedDuration} • {recordingState.stepCount} steps
                      </div>
                    </div>

                    {/* Control buttons */}
                    <div className="flex space-x-3 justify-center">
                      <button
                        onClick={togglePause}
                        disabled={recordingLoading}
                        className="btn-secondary flex items-center space-x-2"
                      >
                        {recordingState.isPaused ? <Icons.Resume /> : <Icons.Pause />}
                        <span>{recordingState.isPaused ? 'Resume' : 'Pause'}</span>
                      </button>
                      
                      <button
                        onClick={handleDeleteRecording}
                        disabled={recordingLoading}
                        className="btn-secondary flex items-center space-x-2 text-red-600"
                      >
                        <Icons.Delete />
                        <span>Delete</span>
                      </button>
                    </div>

                    {/* Complete button */}
                    <button
                      onClick={handleCompleteRecording}
                      disabled={recordingLoading}
                      className="btn-primary w-full h-12 flex items-center justify-center space-x-2"
                    >
                      <Icons.Check />
                      <span>Complete Capture</span>
                    </button>
                  </div>
                ) : (
                  // Start recording
                  <div className="space-y-4">
                    <button
                      onClick={handleStartRecording}
                      disabled={!hasProjects || !selectedProjectId}
                      className="btn-primary w-full h-12 flex items-center justify-center space-x-2"
                    >
                      <Icons.Play />
                      <span>Start Capture</span>
                    </button>

                    {/* Generate Guide button (if steps exist) */}
                    {steps.length > 0 && (
                      <button
                        onClick={handleGenerateGuide}
                        className="btn-secondary w-full h-10 flex items-center justify-center space-x-2"
                      >
                        <Icons.Ai />
                        <span>Generate Guide</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Logout button */}
                <div className="pt-4 text-center">
                  <button
                    onClick={handleLogout}
                    className="btn-secondary px-6 py-2"
                    style={{ borderRadius: '20px' }}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
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