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
import { theme } from './theme';
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onStartAll}
            disabled={!selectedProjectId}
            className="btn-dark"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '9px 16px',
              borderRadius: theme.radius.md,
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: theme.font.display,
              cursor: selectedProjectId ? 'pointer' : 'not-allowed',
            }}
          >
            <Circle size={14} strokeWidth={2.5} />
            Record All
          </button>
          <button
            onClick={onStartChoose}
            disabled={!selectedProjectId}
            className="btn-outline"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '9px 14px',
              borderRadius: theme.radius.md,
              color: selectedProjectId ? theme.dark : '#ccc',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: theme.font.display,
              cursor: selectedProjectId ? 'pointer' : 'not-allowed',
            }}
          >
            <Monitor size={12} strokeWidth={2.5} />
            Choose...
          </button>
        </div>
      ) : (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: rec.isPaused
              ? '1.5px solid rgba(0,0,0,0.1)'
              : '1.5px solid #E14D2A',
            background: rec.isPaused ? theme.bg : 'rgba(225,77,42,0.04)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {!rec.isPaused && (
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#E14D2A',
                    animation: 'pulse 2s infinite',
                  }}
                />
              )}
              <span
                style={{
                  fontFamily: theme.font.display,
                  fontSize: 13,
                  fontWeight: 700,
                  color: rec.isPaused ? theme.textSecondary : '#E14D2A',
                }}
              >
                {rec.isPaused ? 'Paused' : 'Recording workflow'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#E14D2A',
                  fontFamily: theme.font.mono,
                }}
              >
                {formatDuration(duration)}
              </span>
              <span style={{ fontSize: 11, color: '#e14d2a', fontWeight: 600 }}>
                {rec.stepCount} step{rec.stepCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onTogglePause}
              style={{
                flex: 1,
                padding: '6px 12px',
                borderRadius: theme.radius.sm,
                border: '1px solid rgba(0,0,0,0.1)',
                background: theme.card,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: theme.font.sans,
                color: theme.dark,
              }}
            >
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
            <button
              onClick={onStop}
              style={{
                padding: '6px 16px',
                borderRadius: theme.radius.sm,
                border: 'none',
                background: '#E14D2A',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: theme.font.sans,
              }}
            >
              <Square size={12} fill="currentColor" /> Stop
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Upload toast */}
    {uploadStatus !== 'idle' && (
      <div
        style={{
          padding: '6px 16px',
          fontSize: 11,
          fontWeight: 500,
          textAlign: 'center',
          background:
            uploadStatus === 'uploading'
              ? '#EEF2FF'
              : uploadStatus === 'success'
                ? '#ECFDF5'
                : '#FEF2F2',
          color:
            uploadStatus === 'uploading'
              ? theme.dark
              : uploadStatus === 'success'
                ? '#059669'
                : '#DC2626',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
        }}
      >
        {uploadStatus === 'uploading' && (
          <>
            <Upload
              size={12}
              style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
            />{' '}
            Uploading recording...
          </>
        )}
        {uploadStatus === 'success' && (
          <>
            <CheckCircle
              size={12}
              style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
            />{' '}
            Recording uploaded successfully
          </>
        )}
        {uploadStatus === 'error' && (
          <>
            <AlertCircle
              size={12}
              style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
            />{' '}
            Upload failed: {uploadError}
          </>
        )}
      </div>
    )}
  </>
);
