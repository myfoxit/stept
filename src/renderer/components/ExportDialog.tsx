import React, { useState } from 'react';
import { AnnotatedStep, RecordedStep, UploadResult } from '../../main/preload';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { X, Upload, CheckCircle2, AlertTriangle, Cloud, FolderOpen, Copy, ExternalLink, Loader2, Sparkles, Image } from 'lucide-react';

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

  const getStepDisplayTitle = (step: AnnotatedStep) => {
    if (step.isAnnotated && step.generatedTitle) return step.generatedTitle;
    return step.description || `Step ${step.stepNumber}`;
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content max-w-4xl">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-gray-800">Export Recording</h2>
          <div className="flex items-center gap-2">
            {uploadResult?.success && (
              <span className="text-xs text-green-500 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
              </span>
            )}
            <button onClick={onClose} className="btn-icon"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col lg:flex-row" style={{ height: '360px' }}>
          {/* Steps list */}
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              {steps.length} Steps
            </h3>
            {steps.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">No steps recorded</div>
            ) : (
              <div className="space-y-1.5">
                {steps.map((step) => (
                  <div key={step.stepNumber} className="flex items-start gap-2.5 p-2 rounded-md border border-gray-100 hover:bg-gray-50">
                    <div className="w-20 h-14 bg-gray-50 rounded border flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {step.screenshotPath ? (
                        <img src={`file://${step.screenshotPath}`} alt="" className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <Image className="h-4 w-4 text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-medium text-gray-400">Step {step.stepNumber}</span>
                        <span className="text-[10px] text-gray-300">{new Date(step.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-[12px] font-medium text-gray-700 truncate">
                        {step.isAnnotated && step.generatedTitle && <Sparkles className="h-3 w-3 text-indigo-400 inline mr-1" />}
                        {getStepDisplayTitle(step)}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">{step.actionType} — {step.windowTitle}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Export panel */}
          <div className="lg:w-64 border-t lg:border-t-0 lg:border-l p-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Export Options</h3>

            {uploadResult?.success ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-md p-2.5 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-green-700">Upload Complete</p>
                    <p className="text-[11px] text-green-600">Successfully uploaded.</p>
                  </div>
                </div>
                {uploadResult.url && (
                  <div className="space-y-1.5">
                    <div className="flex gap-1">
                      <input type="text" value={uploadResult.url} readOnly className="input-field flex-1 text-[11px] bg-gray-50" />
                      <button onClick={() => navigator.clipboard.writeText(uploadResult.url!)} className="btn-icon" title="Copy">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button onClick={() => { if (uploadResult.url && electronAPI) electronAPI.openExternal(uploadResult.url); }}
                      className="btn-primary w-full gap-1.5"><ExternalLink className="h-3.5 w-3.5" /> Open</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-gray-700 mb-2">
                    <Cloud className="h-3.5 w-3.5" /> Cloud Upload
                  </div>
                  {isUploading ? (
                    <div className="space-y-2">
                      <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} /></div>
                      <p className="text-[11px] text-gray-400 text-center">{Math.round(uploadProgress)}%</p>
                    </div>
                  ) : (
                    <button onClick={handleCloudUpload} disabled={!projectId || !userId || steps.length === 0}
                      className="btn-primary w-full gap-1.5"><Upload className="h-3.5 w-3.5" /> Upload</button>
                  )}
                  {!projectId && <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> No project</p>}
                </div>

                <hr />

                <div>
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-gray-700 mb-2">
                    <FolderOpen className="h-3.5 w-3.5" /> Local Files
                  </div>
                  <button onClick={handleLocalSave} className="btn-secondary w-full" disabled={steps.length === 0}>
                    Show in Folder
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                <span className="text-[11px] text-red-600">{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex justify-end">
          <button onClick={onClose} className="btn-secondary">
            {uploadResult?.success ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
