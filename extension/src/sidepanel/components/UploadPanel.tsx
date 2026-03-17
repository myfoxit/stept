import React, { useState, useEffect, useRef } from 'react';
import { sendToBackground } from '@/shared/messages';
import type { AppState, Step } from '../App';

interface UploadPanelProps {
  steps: Step[];
  setSteps: React.Dispatch<React.SetStateAction<Step[]>>;
  appState: AppState;
  onBack: () => void;
  onNewCapture: () => void;
  autoUpload?: boolean;
}

export default function UploadPanel({
  steps,
  setSteps,
  appState,
  onBack,
  onNewCapture,
  autoUpload,
}: UploadPanelProps) {
  const [title, setTitle] = useState('Ready to Upload');
  const [message, setMessage] = useState(`${steps.length} steps captured`);
  const [status, setStatus] = useState('');
  const [statusClass, setStatusClass] = useState('upload-status');
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [showActions, setShowActions] = useState(true);
  const [showDoneActions, setShowDoneActions] = useState(false);
  const [uploading, setUploading] = useState(false);
  const progressRef = useRef<number>(0);
  const didAutoUpload = useRef(false);

  const performUpload = async () => {
    setUploading(true);
    setShowActions(false);
    setTitle('Uploading...');
    setMessage('Please wait while we upload your capture');
    setShowProgress(true);
    setStatus('Preparing upload...');
    setStatusClass('upload-status');

    let prog = 0;
    progressRef.current = window.setInterval(() => {
      prog += 10;
      if (prog <= 90) setProgress(prog);
    }, 500);

    const result = await sendToBackground<any>({ type: 'UPLOAD' });

    clearInterval(progressRef.current);
    setProgress(100);

    if (result.success) {
      await sendToBackground({ type: 'CLEAR_STEPS' });
      setSteps([]);

      const settings = await sendToBackground<any>({ type: 'GET_SETTINGS' });
      const webAppUrl =
        settings.frontendUrl ||
        (settings.apiBaseUrl || '').replace('/api/v1', '');
      if (result.sessionId && webAppUrl) {
        chrome.tabs.create({ url: `${webAppUrl}/workflow/${result.sessionId}` });
      }

      window.close();
    } else {
      setTitle('Upload Failed');
      setMessage('There was a problem uploading your capture');
      setStatus(result.error || 'Unknown error occurred');
      setStatusClass('upload-status upload-error');
      setUploading(false);
      setShowActions(true);
    }
  };

  // Auto-upload on mount
  useEffect(() => {
    if (autoUpload && !didAutoUpload.current) {
      didAutoUpload.current = true;
      setShowActions(false);
      setTitle('Uploading...');
      setMessage('Please wait while we upload your capture');
      performUpload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoUpload]);

  return (
    <div className="upload-panel" id="uploadPanel">
      <div className="upload-content">
        <svg
          className="upload-icon"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3AB08A"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <h3 id="uploadTitle">{title}</h3>
        <p id="uploadMessage">{message}</p>
        {showProgress && (
          <div className="progress-bar" id="progressBar">
            <div
              className="progress-fill"
              id="progressFill"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <p className={statusClass} id="uploadStatus">
          {status}
        </p>
      </div>

      {showActions && (
        <div className="upload-actions" id="uploadActions">
          <button
            id="backBtn"
            className="btn btn-outline"
            disabled={uploading}
            onClick={onBack}
          >
            Back
          </button>
          <button
            id="uploadBtn"
            className="btn btn-primary"
            disabled={uploading}
            onClick={performUpload}
          >
            Upload to Cloud
          </button>
        </div>
      )}

      {showDoneActions && (
        <div className="upload-actions" id="uploadDoneActions">
          <button
            id="newCaptureBtn"
            className="btn btn-primary"
            onClick={onNewCapture}
          >
            New Capture
          </button>
        </div>
      )}
    </div>
  );
}
