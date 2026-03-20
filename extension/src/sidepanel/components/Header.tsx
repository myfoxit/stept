import React, { useEffect, useState, useRef } from 'react';
import type { AppState, Step } from '../App';

interface HeaderProps {
  appState: AppState;
  steps: Step[];
  onSettingsClick: () => void;
}

export default function Header({ appState, steps, onSettingsClick }: HeaderProps) {
  const { isRecording, isPaused, recordingStartTime } = appState;
  const [elapsed, setElapsed] = useState('00:00');
  const intervalRef = useRef<number>(0);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (isRecording && recordingStartTime) {
      const update = () => {
        const diff = Date.now() - recordingStartTime;
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setElapsed(
          `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
        );
      };
      update();
      intervalRef.current = window.setInterval(update, 1000);
    } else {
      setElapsed('00:00');
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRecording, recordingStartTime]);

  return (
    <header className="header">
      <div className="header-left">
        <svg width="28" height="27" viewBox="0 0 38 36">
          <rect x="0" y="4" width="32" height="32" rx="9" fill="#4f46e5" />
          <rect x="7" y="11" width="10" height="3.5" rx="1.75" fill="white" />
          <rect x="7" y="17.5" width="18" height="3.5" rx="1.75" fill="white" />
          <rect x="7" y="24" width="14" height="3.5" rx="1.75" fill="white" />
          <path
            d="M33 0 L34.5 4.5 L38 6 L34.5 7.5 L33 12 L31.5 7.5 L28 6 L31.5 4.5 Z"
            fill="#4f46e5"
          />
        </svg>
        <span className="header-title">Stept</span>
      </div>

      {isRecording && (
        <div className={`recording-badge visible${isPaused ? ' paused' : ''}`} id="recordingBadge">
          <span className="recording-dot" />
          <span id="recordingStatus">{isPaused ? 'Paused' : 'Recording'}</span>
          <span className="badge-sep">&middot;</span>
          <span className="badge-step-count" id="badgeStepCount">
            {steps.length} steps
          </span>
          <span className="badge-sep">&middot;</span>
          <span className="badge-timer" id="recordingTime">
            {elapsed}
          </span>
        </div>
      )}

      <button
        className="header-icon-btn"
        id="settingsToggleBtn"
        title="Settings"
        onClick={onSettingsClick}
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
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </header>
  );
}
