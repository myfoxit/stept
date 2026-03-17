import React, { useState, useEffect, useCallback, useRef } from 'react';
import { sendToBackground } from '@/shared/messages';
import Header from './components/Header';
import LoginPanel from './components/LoginPanel';
import SetupPanel from './components/SetupPanel';
import StepsList from './components/StepsList';
import UploadPanel from './components/UploadPanel';
import RecordingFooter from './components/RecordingFooter';
import SettingsPanel from './components/SettingsPanel';

export interface AppState {
  isAuthenticated: boolean;
  isRecording: boolean;
  isPaused: boolean;
  recordingStartTime: number | null;
  selectedProjectId: string;
  currentUser: { name?: string; email?: string } | null;
  userProjects: { id: string; name: string }[];
}

export interface Step {
  stepNumber: number;
  description: string;
  actionType: string;
  url?: string;
  screenshotDataUrl?: string;
  screenshotRelativeMousePosition?: { x: number; y: number };
  screenshotSize?: { width: number; height: number };
}

export interface GuideData {
  id?: string;
  title?: string;
  steps: GuideStep[];
}

export interface GuideStep {
  title?: string;
  description?: string;
  action_type?: string;
  screenshot_url?: string;
  screenshot_relative_position?: { x: number; y: number };
  screenshot_size?: { width: number; height: number };
}

export default function App() {
  const [appState, setAppState] = useState<AppState>({
    isAuthenticated: false,
    isRecording: false,
    isPaused: false,
    recordingStartTime: null,
    selectedProjectId: '',
    currentUser: null,
    userProjects: [],
  });
  const [steps, setSteps] = useState<Step[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [contextMatches, setContextMatches] = useState<any[]>([]);
  const [activeGuide, setActiveGuide] = useState<{
    guide: GuideData;
    currentIndex: number;
    stepStatus?: string;
  } | null>(null);
  const [smartBlurOpen, setSmartBlurOpen] = useState(false);

  const toastTimerRef = useRef<number>(0);

  const showToast = useCallback((text: string, duration = 4000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ text, key: Date.now() });
    toastTimerRef.current = window.setTimeout(() => setToast(null), duration);
  }, []);

  const refreshState = useCallback(async () => {
    const state = await sendToBackground<any>({ type: 'GET_STATE' });

    if (!state.isAuthenticated) {
      setAppState({
        isAuthenticated: false,
        isRecording: false,
        isPaused: false,
        recordingStartTime: null,
        selectedProjectId: '',
        currentUser: null,
        userProjects: [],
      });
      setSteps([]);
      return;
    }

    if (!state.isRecording) {
      setAppState({
        isAuthenticated: true,
        isRecording: false,
        isPaused: false,
        recordingStartTime: null,
        selectedProjectId: state.selectedProjectId || '',
        currentUser: state.currentUser || null,
        userProjects: state.userProjects || [],
      });
      setSteps([]);
      setShowUpload(false);
      return;
    }

    // Recording
    const stepsResult = await sendToBackground<any>({ type: 'GET_STEPS' });
    const loadedSteps: Step[] = stepsResult.steps || [];

    setAppState({
      isAuthenticated: true,
      isRecording: true,
      isPaused: state.isPaused || false,
      recordingStartTime: state.recordingStartTime || null,
      selectedProjectId: state.selectedProjectId || '',
      currentUser: state.currentUser || null,
      userProjects: state.userProjects || [],
    });
    setSteps(loadedSteps);
  }, []);

  // Initial load
  useEffect(() => {
    refreshState();
  }, [refreshState]);

  // Listen for broadcast messages from background
  useEffect(() => {
    const listener = (message: any) => {
      if (message.type === 'STEP_ADDED') {
        setSteps((prev) => [...prev, message.step]);
      } else if (message.type === 'SCREENSHOT_FAILED') {
        showToast('Screenshot failed -- try again');
      } else if (message.type === 'MAX_STEPS_REACHED') {
        showToast(`Maximum steps reached (${message.limit}). Stop recording to save.`, 6000);
      } else if (message.type === 'RECORDING_STATE_CHANGED') {
        setSmartBlurOpen(false);
        refreshState();
      } else if (message.type === 'CONTEXT_MATCHES_UPDATED') {
        setContextMatches(message.matches || []);
      } else if (message.type === 'GUIDE_STATE_UPDATE') {
        const gs = message.guideState;
        if (gs && gs.guide) {
          setActiveGuide({
            guide: gs.guide,
            currentIndex: gs.currentIndex,
            stepStatus: gs.stepStatus,
          });
        } else {
          setActiveGuide(null);
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refreshState, showToast]);

  // Determine which view to show
  const { isAuthenticated, isRecording } = appState;

  return (
    <div className="container">
      <Header
        appState={appState}
        steps={steps}
        onSettingsClick={() => setSettingsOpen(true)}
      />

      {!isAuthenticated && (
        <LoginPanel onLoginSuccess={refreshState} />
      )}

      {isAuthenticated && !isRecording && !showUpload && (
        <SetupPanel
          appState={appState}
          onProjectChange={async (projectId) => {
            setAppState((s) => ({ ...s, selectedProjectId: projectId }));
            await sendToBackground({ type: 'SET_SETTINGS', selectedProjectId: projectId });
          }}
          onStartRecording={async (projectId) => {
            await sendToBackground({ type: 'START_RECORDING', projectId });
            await refreshState();
          }}
          onLogout={async () => {
            await sendToBackground({ type: 'LOGOUT' });
            await refreshState();
          }}
          contextMatches={contextMatches}
          setContextMatches={setContextMatches}
          activeGuide={activeGuide}
          setActiveGuide={setActiveGuide}
          showToast={showToast}
          refreshState={refreshState}
        />
      )}

      {isAuthenticated && isRecording && !showUpload && (
        <>
          <StepsList
            steps={steps}
            setSteps={setSteps}
            refreshState={refreshState}
          />
          <RecordingFooter
            appState={appState}
            steps={steps}
            setSteps={setSteps}
            smartBlurOpen={smartBlurOpen}
            setSmartBlurOpen={setSmartBlurOpen}
            onComplete={async () => {
              await sendToBackground({ type: 'STOP_RECORDING' });
              setShowUpload(true);
            }}
            refreshState={refreshState}
          />
        </>
      )}

      {showUpload && (
        <UploadPanel
          steps={steps}
          setSteps={setSteps}
          appState={appState}
          onBack={async () => {
            const state = await sendToBackground<any>({ type: 'GET_STATE' });
            if (!state.isRecording && steps.length > 0) {
              setShowUpload(false);
            } else {
              await sendToBackground({
                type: 'START_RECORDING',
                projectId: state.selectedProjectId,
              });
              setShowUpload(false);
              await refreshState();
            }
          }}
          onNewCapture={async () => {
            const state = await sendToBackground<any>({ type: 'GET_STATE' });
            const projectId = state.selectedProjectId;
            if (projectId) {
              await sendToBackground({ type: 'CLEAR_STEPS' });
              await sendToBackground({ type: 'START_RECORDING', projectId });
            }
            setShowUpload(false);
            setSteps([]);
            await refreshState();
          }}
          autoUpload
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {toast && (
        <div className="toast-error" key={toast.key}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
