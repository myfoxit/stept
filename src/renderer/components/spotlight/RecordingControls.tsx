import React from 'react';
import {
  Circle,
  Monitor,
  Pause,
  Square,
  Play,
  Upload,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { formatDuration } from './helpers';
import type { RecState } from './types';

interface RecordingControlsProps {
  rec: RecState;
  duration: number;
  selectedProjectId: string;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
  uploadError: string;
  onStartAll: () => void;
  onStartChoose: () => void;
  onStop: () => void;
  onTogglePause: () => void;
}

export const RecordingControls: React.FC<RecordingControlsProps> = ({
  rec,
  duration,
  selectedProjectId,
  uploadStatus,
  uploadError,
  onStartAll,
  onStartChoose,
  onStop,
  onTogglePause,
}) => (
  <>
    <div className="recording-controls">
      {!rec.isRecording ? (
        <div className="rec-idle-row">
          <button
            onClick={onStartAll}
            disabled={!selectedProjectId}
            className="btn-dark btn-record-all"
          >
            <Circle size={14} strokeWidth={2.5} />
            Record All
          </button>
          <button
            onClick={onStartChoose}
            disabled={!selectedProjectId}
            className="btn-outline btn-choose"
          >
            <Monitor size={12} strokeWidth={2.5} />
            Choose...
          </button>
        </div>
      ) : (
        <div
          className={`rec-active-card${rec.isPaused ? ' rec-active-card--paused' : ''}`}
        >
          <div className="rec-active-header">
            <div className="rec-active-label">
              {!rec.isPaused && <div className="rec-pulse-dot" />}
              <span
                className={`rec-status-text${rec.isPaused ? ' rec-status-text--paused' : ''}`}
              >
                {rec.isPaused ? 'Paused' : 'Recording workflow'}
              </span>
            </div>
            <div className="rec-active-stats">
              <span className="rec-duration">
                {formatDuration(duration)}
              </span>
              <span className="rec-step-count">
                {rec.stepCount} step{rec.stepCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="rec-btn-row">
            <button onClick={onTogglePause} className="btn-rec-secondary">
              {rec.isPaused ? (
                <>
                  <Play size={12} /> Resume
                </>
              ) : (
                <>
                  <Pause size={12} /> Pause
                </>
              )}
            </button>
            <button onClick={onStop} className="btn-rec-stop">
              <Square size={12} fill="currentColor" /> Stop
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Upload toast */}
    {uploadStatus !== 'idle' && (
      <div className={`upload-toast upload-toast--${uploadStatus}`}>
        {uploadStatus === 'uploading' && (
          <>
            <Upload size={12} className="upload-toast-icon" /> Uploading
            recording...
          </>
        )}
        {uploadStatus === 'success' && (
          <>
            <CheckCircle size={12} className="upload-toast-icon" /> Recording
            uploaded successfully
          </>
        )}
        {uploadStatus === 'error' && (
          <>
            <AlertCircle size={12} className="upload-toast-icon" /> Upload
            failed: {uploadError}
          </>
        )}
      </div>
    )}
  </>
);
