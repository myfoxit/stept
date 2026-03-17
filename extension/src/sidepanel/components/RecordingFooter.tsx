import React from 'react';
import { sendToBackground } from '@/shared/messages';
import type { AppState, Step } from '../App';

interface RecordingFooterProps {
  appState: AppState;
  steps: Step[];
  setSteps: React.Dispatch<React.SetStateAction<Step[]>>;
  smartBlurOpen: boolean;
  setSmartBlurOpen: (open: boolean) => void;
  onComplete: () => void;
  refreshState: () => Promise<void>;
}

export default function RecordingFooter({
  appState,
  steps,
  setSteps,
  smartBlurOpen,
  setSmartBlurOpen,
  onComplete,
  refreshState,
}: RecordingFooterProps) {
  const { isPaused } = appState;

  const handlePause = async () => {
    if (isPaused) {
      await sendToBackground({ type: 'RESUME_RECORDING' });
    } else {
      await sendToBackground({ type: 'PAUSE_RECORDING' });
    }
    await refreshState();
  };

  const handleSmartBlur = async () => {
    const result = await sendToBackground<any>({ type: 'TOGGLE_SMART_BLUR' });
    setSmartBlurOpen(result?.isOpen || false);
  };

  const handleDeleteAll = async () => {
    if (confirm('Delete this entire capture?')) {
      await sendToBackground({ type: 'STOP_RECORDING' });
      await sendToBackground({ type: 'CLEAR_STEPS' });
      await refreshState();
    }
  };

  return (
    <footer className="footer" id="footer">
      <div className="footer-left">
        <button
          id="pauseBtn"
          className="footer-icon-btn"
          title={isPaused ? 'Resume' : 'Pause'}
          onClick={handlePause}
        >
          <svg
            id="pauseIcon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {isPaused ? (
              <polygon points="5 3 19 12 5 21 5 3" />
            ) : (
              <>
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </>
            )}
          </svg>
        </button>

        <button
          id="redactionToggleBtn"
          className={`footer-icon-btn${smartBlurOpen ? ' redaction-active' : ''}`}
          title={smartBlurOpen ? 'Smart Blur: ON' : 'Smart Blur'}
          onClick={handleSmartBlur}
        >
          {!smartBlurOpen ? (
            <svg
              id="blurIconOff"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg
              id="blurIconOn"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" fill="white" />
              <line x1="1" y1="1" x2="23" y2="23" stroke="white" strokeWidth="2.5" />
            </svg>
          )}
        </button>

        <button
          id="deleteAllBtn"
          className="footer-icon-btn"
          title="Delete capture"
          onClick={handleDeleteAll}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      <button id="completeBtn" className="complete-bar-btn" onClick={onComplete}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Complete Capture
      </button>
    </footer>
  );
}
