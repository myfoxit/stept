import { useState, useEffect, useCallback } from 'react';
import { RecordedStep, Display, WindowInfo, RecordingState } from '../../main/preload';

export type { RecordedStep };
export type { RecordingState };

export const useRecording = () => {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    stepCount: 0,
  });
  const [steps, setSteps] = useState<RecordedStep[]>([]);
  const [displays, setDisplays] = useState<Display[]>([]);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);

  // Timer for recording duration
  useEffect(() => {
    if (!recordingState.isRecording || recordingState.isPaused) return;
    const interval = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [recordingState.isRecording, recordingState.isPaused]);

  // Listen for steps from main process
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubStep = window.electronAPI.onStepRecorded((step: RecordedStep) => {
      setSteps(prev => [...prev, step]);
      setRecordingState(prev => ({ ...prev, stepCount: prev.stepCount + 1 }));
    });

    const unsubState = window.electronAPI.onRecordingStateChanged((state: RecordingState) => {
      setRecordingState(state);
    });

    return () => {
      unsubStep?.();
      unsubState?.();
    };
  }, []);

  const loadCaptureOptions = useCallback(async () => {
    if (!window.electronAPI) return;
    setIsLoading(true);
    try {
      const [d, w] = await Promise.all([
        window.electronAPI.getDisplays(),
        window.electronAPI.getWindows(),
      ]);
      setDisplays(d || []);
      setWindows(w || []);
    } catch (e) {
      console.error('Failed to load capture options:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startRecording = useCallback(async (captureArea?: any, projectId?: string) => {
    if (!window.electronAPI) return;
    setIsLoading(true);
    try {
      await window.electronAPI.startRecording(captureArea, projectId);
      setSteps([]);
      setDuration(0);
      setRecordingState({ isRecording: true, isPaused: false, stepCount: 0 });
    } catch (e) {
      console.error('Failed to start recording:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.stopRecording();
      setRecordingState(prev => ({ ...prev, isRecording: false, isPaused: false }));
    } catch (e) {
      console.error('Failed to stop recording:', e);
    }
  }, []);

  const togglePause = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      if (recordingState.isPaused) {
        await window.electronAPI.resumeRecording();
      } else {
        await window.electronAPI.pauseRecording();
      }
      setRecordingState(prev => ({ ...prev, isPaused: !prev.isPaused }));
    } catch (e) {
      console.error('Failed to toggle pause:', e);
    }
  }, [recordingState.isPaused]);

  const clearSteps = useCallback(() => {
    setSteps([]);
    setRecordingState(prev => ({ ...prev, stepCount: 0 }));
    setDuration(0);
  }, []);

  const formatDuration = useCallback((seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, []);

  const formattedDuration = formatDuration(duration);

  return {
    recordingState,
    steps,
    displays,
    windows,
    isLoading,
    duration,
    formattedDuration,
    startRecording,
    stopRecording,
    togglePause,
    clearSteps,
    formatDuration,
    loadCaptureOptions,
  };
};

export default useRecording;
