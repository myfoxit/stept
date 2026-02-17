import React, { useState } from 'react';
import { AnnotatedStep, RecordedStep, UploadResult } from '../../main/preload';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { getStepTitle, getStepSubtitle, isAiAnnotated } from '../utils/stepDisplay';

interface ExportDialogProps {
  steps: any[];
  projectId?: string;
  userId?: string;
  onClose: () => void;
}

const ExportDialog: React.FC<ExportDialogProps> = ({ steps, projectId, userId, onClose }) => {
  const electronAPI = useElectronAPI();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCloudUpload = async () => {
    if (!electronAPI || !projectId || !userId) { setError('Missing required information'); return; }
    if (steps.length === 0) { setError('No steps to upload'); return; }
    try {
      setIsUploading(true); setError(null); setUploadProgress(0);
      const recordedSteps = steps.map(step => ({
        stepNumber: step.stepNumber, timestamp: step.timestamp, actionType: step.actionType,
        windowTitle: step.windowTitle, description: step.description, screenshotPath: step.screenshotPath,
        globalMousePosition: step.globalMousePosition, relativeMousePosition: step.relativeMousePosition,
        windowSize: step.windowSize, screenshotRelativeMousePosition: step.screenshotRelativeMousePosition,
        screenshotSize: step.screenshotSize, textTyped: step.textTyped, scrollDelta: step.scrollDelta,
        elementName: step.elementName,
      }));
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => prev >= 90 ? 90 : prev + Math.random() * 20);
      }, 500);
      const result = await electronAPI.uploadRecording(recordedSteps, projectId, userId);
      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadResult(result);
      if (!result.success) setError(result.error || 'Upload failed');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload failed');
    } finally { setIsUploading(false); }
  };

  const handleLocalSave = () => {
    if (!electronAPI) return;
    if (steps.length > 0 && steps[0].screenshotPath) {
      const folderPath = steps[0].screenshotPath.split('/').slice(0, -1).join('/');
      electronAPI.showItemInFolder(folderPath);
    }
    onClose();
  };

  return (
    <div className="dialog-overlay">
      <div style={{
        background: 'var(--card)',
        borderRadius: 'var(--radius-xl)',
        width: '100%',
        maxWidth: 440,
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '1.1rem', color: 'var(--dark)' }}>
            Export Recording
          </span>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, border: '1.5px solid var(--border)', borderRadius: 8,
              background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Steps captured label */}
          <div style={{
            fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            {steps.length} {steps.length === 1 ? 'STEP' : 'STEPS'} CAPTURED
          </div>

          {/* Step cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.map((step) => (
              <div key={step.stepNumber} style={{
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                {/* Thumbnail */}
                <div style={{
                  width: 48, height: 40, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                  background: 'var(--purple-light, #f0e6ff)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {step.screenshotPath ? (
                    <img
                      src={`file://${step.screenshotPath}`}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary, #7c3aed)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                  )}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: '0.82rem', color: 'var(--dark)' }}>
                    Step {step.stepNumber}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {getStepTitle(step)}
                  </div>
                </div>
                {/* Timestamp */}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {new Date(step.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>

          {/* Export options label */}
          <div style={{
            fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            EXPORT OPTIONS
          </div>

          {/* Upload / Success / Error */}
          {uploadResult?.success ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 'var(--radius-sm)',
                padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#15803d' }}>Upload Complete</div>
                  <div style={{ fontSize: '0.72rem', color: '#16a34a' }}>Successfully uploaded.</div>
                </div>
              </div>
              {uploadResult.url && (
                <button
                  className="btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => { if (uploadResult.url && electronAPI) electronAPI.openExternal(uploadResult.url); }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Open URL
                </button>
              )}
            </div>
          ) : isUploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} /></div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>{Math.round(uploadProgress)}%</div>
            </div>
          ) : (
            <button
              className="btn-primary"
              style={{ width: '100%' }}
              onClick={handleCloudUpload}
              disabled={!projectId || !userId || steps.length === 0}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><polyline points="12 13 12 9"/><polyline points="10 11 12 9 14 11"/>
              </svg>
              Upload to Cloud
            </button>
          )}

          {error && (
            <div style={{
              background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 'var(--radius-sm)',
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style={{ fontSize: '0.72rem', color: '#dc2626' }}>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
