import { useState, useEffect, useCallback } from 'react';
import { RecordingState, RecordedStep, AnnotatedStep, CaptureArea, Display, WindowInfo } from '../../main/preload';
import { useElectronAPI } from './useElectronAPI';

interface RecordingHookState {
  recordingState: RecordingState;
  steps: AnnotatedStep[];
  isLoading: boolean;
  error: string | null;
  displays: Display[];
  windows: WindowInfo[];
}

/**
 * Custom hook for recording state management
 */
export const useRecording = () => {
  const electronAPI = useElectronAPI();
  const [state, setState] = useState<RecordingHookState>({
    recordingState: {
      isRecording: false,
      isPaused: false,
      stepCount: 0,
    },
    steps: [],
    isLoading: false,
    error: null,
    displays: [],
    windows: [],
  });

  // Initialize recording state
  const initializeRecording = useCallback(async () => {
    if (!electronAPI) return;

    try {
      const recordingState = await electronAPI.getRecordingState();
      setState(prev => ({
        ...prev,
        recordingState,
        error: null,
      }));
    } catch (error) {
      console.error('Failed to initialize recording state:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to initialize recording',
      }));
    }
  }, [electronAPI]);

  // Listen for recording state changes
  useEffect(() => {
    if (!electronAPI) return;

    const unsubscribeStateChange = electronAPI.onRecordingStateChanged((recordingState: RecordingState) => {
      setState(prev => ({
        ...prev,
        recordingState,
        error: null,
      }));
    });

    const unsubscribeStepRecorded = electronAPI.onStepRecorded((step: RecordedStep) => {
      // Convert RecordedStep to AnnotatedStep
      const annotatedStep: AnnotatedStep = {
        ...step,
        isAnnotated: false,
      };

      setState(prev => ({
        ...prev,
        steps: [...prev.steps, annotatedStep],
      }));

      // Trigger smart annotation in the background
      if (electronAPI.annotateStep) {
        electronAPI.annotateStep(step).catch(error => {
          console.warn('Smart annotation failed for step:', error);
        });
      }
    });

    return () => {
      unsubscribeStateChange();
      unsubscribeStepRecorded();
    };
  }, [electronAPI]);

  // Load displays and windows for capture area selection
  const loadCaptureOptions = useCallback(async () => {
    if (!electronAPI) return;

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const [displays, windows] = await Promise.all([
        electronAPI.getDisplays(),
        electronAPI.getWindows(),
      ]);

      setState(prev => ({
        ...prev,
        displays,
        windows: windows.filter(w => w.isVisible && w.title.trim() !== ''),
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to load capture options:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load capture options',
      }));
    }
  }, [electronAPI]);

  // Start recording
  const startRecording = useCallback(async (captureArea: CaptureArea, projectId?: string) => {
    if (!electronAPI) {
      throw new Error('Electron API not available');
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null, steps: [] }));
      await electronAPI.startRecording(captureArea, projectId);
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      console.error('Failed to start recording:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start recording';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw new Error(errorMessage);
    }
  }, [electronAPI]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    if (!electronAPI) {
      throw new Error('Electron API not available');
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      await electronAPI.stopRecording();
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      console.error('Failed to stop recording:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop recording';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw new Error(errorMessage);
    }
  }, [electronAPI]);

  // Pause recording
  const pauseRecording = useCallback(async () => {
    if (!electronAPI) {
      throw new Error('Electron API not available');
    }

    try {
      await electronAPI.pauseRecording();
    } catch (error) {
      console.error('Failed to pause recording:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to pause recording');
    }
  }, [electronAPI]);

  // Resume recording
  const resumeRecording = useCallback(async () => {
    if (!electronAPI) {
      throw new Error('Electron API not available');
    }

    try {
      await electronAPI.resumeRecording();
    } catch (error) {
      console.error('Failed to resume recording:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to resume recording');
    }
  }, [electronAPI]);

  // Toggle pause/resume
  const togglePause = useCallback(async () => {
    if (state.recordingState.isPaused) {
      await resumeRecording();
    } else {
      await pauseRecording();
    }
  }, [state.recordingState.isPaused, pauseRecording, resumeRecording]);

  // Take screenshot
  const takeScreenshot = useCallback(async () => {
    if (!electronAPI) {
      throw new Error('Electron API not available');
    }

    try {
      const screenshotPath = await electronAPI.takeScreenshot();
      return screenshotPath;
    } catch (error) {
      console.error('Failed to take screenshot:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to take screenshot');
    }
  }, [electronAPI]);

  // Clear recorded steps
  const clearSteps = useCallback(() => {
    setState(prev => ({
      ...prev,
      steps: [],
    }));
  }, []);

  // Update a step (when annotation completes)
  const updateStep = useCallback((stepNumber: number, updates: Partial<AnnotatedStep>) => {
    setState(prev => ({
      ...prev,
      steps: prev.steps.map(step =>
        step.stepNumber === stepNumber
          ? { ...step, ...updates }
          : step
      ),
    }));
  }, []);

  // Derived state for convenience
  const { isRecording, isPaused, stepCount } = state.recordingState;
  const hasSteps = state.steps.length > 0;
  const isIdle = !isRecording && !isPaused;

  // Recording duration calculation
  const recordingDuration = state.recordingState.startTime
    ? Date.now() - new Date(state.recordingState.startTime).getTime()
    : 0;

  // Format duration as mm:ss
  const formatDuration = useCallback((milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const formattedDuration = formatDuration(recordingDuration);

  return {
    // State
    recordingState: state.recordingState,
    steps: state.steps,
    isLoading: state.isLoading,
    error: state.error,
    displays: state.displays,
    windows: state.windows,

    // Derived state
    isRecording,
    isPaused,
    isIdle,
    stepCount,
    hasSteps,
    recordingDuration,
    formattedDuration,

    // Actions
    initializeRecording,
    loadCaptureOptions,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    togglePause,
    takeScreenshot,
    clearSteps,
    updateStep,
  };
};

/**
 * Helper hook to get capture area description
 */
export const useCaptureAreaDescription = (captureArea: CaptureArea | undefined): string => {
  if (!captureArea) return '';
  
  switch (captureArea.type) {
    case 'all-displays':
      return 'All displays';
    case 'single-display':
      return captureArea.displayName || 'Selected display';
    case 'window':
      return captureArea.windowTitle || 'Selected window';
    default:
      return 'Screen';
  }
};

export default useRecording;