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
  Mic,
  MicOff,
  Shield,
  ShieldOff,
  X,
} from 'lucide-react';
import { formatDuration } from './helpers';
import type { RecState } from './types';

interface RecordingControlsProps {
  rec: RecState;
  duration: number;
  selectedProjectId: string;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
  uploadError: string;
  uploadProgress?: { currentFile: number; totalFiles: number } | null;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  blurState?: { isActive: boolean; regionCount: number };
  onBlurToggle?: () => void;
  onBlurClear?: () => void;
  isWindowMode?: boolean;
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
  uploadProgress,
  audioEnabled,
  onToggleAudio,
  blurState,
  onBlurToggle,
  onBlurClear,
  isWindowMode,
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
            className="btn-record-all"
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
          <button
            onClick={onToggleAudio}
            className={`btn-mic-toggle${audioEnabled ? ' btn-mic-toggle--active' : ''}`}
            title={audioEnabled ? 'Disable microphone' : 'Enable microphone for narration'}
          >
            {audioEnabled ? <Mic size={12} /> : <MicOff size={12} />}
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
              {audioEnabled && (
                <span className="rec-audio-indicator" title="Microphone active">
                  <Mic size={10} />
                </span>
              )}
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

            {/* Blur toggle — only for full-screen/display recording */}
            {onBlurToggle && (
              <button
                onClick={isWindowMode ? undefined : onBlurToggle}
                className={`btn-rec-secondary${blurState?.isActive ? ' btn-rec-secondary--active' : ''}${isWindowMode ? ' btn-rec-secondary--disabled' : ''}`}
                title={
                  isWindowMode
                    ? 'Blur is only available for full-screen recording'
                    : blurState?.isActive
                    ? 'Blur mode active — click to close overlay'
                    : 'Blur sensitive areas on screen'
                }
                disabled={isWindowMode}
              >
                {blurState?.isActive ? <ShieldOff size={12} /> : <Shield size={12} />}
                {' '}Blur
                {blurState && blurState.regionCount > 0 && (
                  <span className="rec-blur-count">{blurState.regionCount}</span>
                )}
              </button>
            )}

            {/* Clear blur regions */}
            {onBlurClear && blurState && blurState.regionCount > 0 && !blurState.isActive && (
              <button
                onClick={onBlurClear}
                className="btn-rec-secondary btn-rec-secondary--danger"
                title="Clear all blur regions"
              >
                <X size={12} /> Clear
              </button>
            )}

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
            <Upload size={12} className="upload-toast-icon" />
            <span>
              {uploadProgress && uploadProgress.totalFiles > 0
                ? `Uploading ${uploadProgress.currentFile}/${uploadProgress.totalFiles}`
                : 'Preparing upload...'}
            </span>
            {uploadProgress && uploadProgress.totalFiles > 0 && (
              <div className="upload-progress-bar">
                <div
                  className="upload-progress-fill"
                  style={{ width: `${Math.round((uploadProgress.currentFile / uploadProgress.totalFiles) * 100)}%` }}
                />
              </div>
            )}
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
