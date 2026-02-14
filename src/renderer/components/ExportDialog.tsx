import React, { useState } from 'react';
import { AnnotatedStep, UploadResult } from '../../main/preload';
import { useElectronAPI } from '../hooks/useElectronAPI';

interface ExportDialogProps {
  steps: AnnotatedStep[];
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

  // Handle cloud upload
  const handleCloudUpload = async () => {
    if (!electronAPI || !projectId || !userId) {
      setError('Missing required information for upload');
      return;
    }

    if (steps.length === 0) {
      setError('No steps to upload');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);

      // Convert AnnotatedStep to RecordedStep for upload
      const recordedSteps = steps.map(step => ({
        stepNumber: step.stepNumber,
        timestamp: step.timestamp,
        actionType: step.actionType,
        windowTitle: step.windowTitle,
        description: step.description,
        screenshotPath: step.screenshotPath,
        globalMousePosition: step.globalMousePosition,
        relativeMousePosition: step.relativeMousePosition,
        windowSize: step.windowSize,
        screenshotRelativeMousePosition: step.screenshotRelativeMousePosition,
        screenshotSize: step.screenshotSize,
        textTyped: step.textTyped,
        scrollDelta: step.scrollDelta,
        elementName: step.elementName,
      }));

      // Simulate progress (in a real implementation, you might get progress from the main process)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          const newProgress = prev + Math.random() * 20;
          return newProgress >= 90 ? 90 : newProgress;
        });
      }, 500);

      const result = await electronAPI.uploadRecording(recordedSteps, projectId, userId);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadResult(result);

      if (!result.success) {
        setError(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle local save (placeholder)
  const handleLocalSave = () => {
    if (!electronAPI) return;
    
    // For now, just show in folder
    if (steps.length > 0 && steps[0].screenshotPath) {
      const folderPath = steps[0].screenshotPath.split('/').slice(0, -1).join('/');
      electronAPI.showItemInFolder(folderPath);
    }
    
    onClose();
  };

  // Format step display title
  const getStepDisplayTitle = (step: AnnotatedStep) => {
    if (step.isAnnotated && step.generatedTitle) {
      return `✨ ${step.generatedTitle}`;
    }
    return step.description || `Step ${step.stepNumber}`;
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Export Recording</h2>
          {uploadResult?.success && (
            <div className="flex items-center space-x-2 text-green-600">
              <span>✅</span>
              <span className="text-sm font-medium">Upload successful!</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col lg:flex-row h-96">
          {/* Steps preview */}
          <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Recorded Steps ({steps.length})
            </h3>
            
            {steps.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No steps recorded
              </div>
            ) : (
              <div className="space-y-4">
                {steps.map((step) => (
                  <div key={step.stepNumber} className="export-step">
                    {/* Thumbnail */}
                    <div className="export-step-thumbnail">
                      {step.screenshotPath ? (
                        <img
                          src={`file://${step.screenshotPath}`}
                          alt={`Step ${step.stepNumber}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          🖼️
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="export-step-content">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-600">
                          Step {step.stepNumber}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(step.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      
                      <h4 className="font-medium text-gray-900 mb-1">
                        {getStepDisplayTitle(step)}
                      </h4>
                      
                      <p className="text-sm text-indigo-600 mb-1">{step.actionType}</p>
                      <p className="text-sm text-gray-600 mb-2">{step.windowTitle}</p>
                      
                      {step.isAnnotated && step.generatedDescription && (
                        <p className="text-sm text-indigo-700 italic">
                          {step.generatedDescription}
                        </p>
                      )}
                      
                      <div className="text-xs text-gray-500 mt-2">
                        Mouse: ({step.globalMousePosition.x}, {step.globalMousePosition.y})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upload panel */}
          <div className="lg:w-80 border-l border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Options</h3>
            
            {uploadResult?.success ? (
              // Success state
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-green-500">✅</span>
                    <div>
                      <p className="text-sm font-medium text-green-800">Upload Complete</p>
                      <p className="text-xs text-green-600">
                        Your recording has been uploaded successfully.
                      </p>
                    </div>
                  </div>
                </div>
                
                {uploadResult.url && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Recording URL:
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={uploadResult.url}
                        readOnly
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(uploadResult.url!)}
                        className="btn-secondary text-sm"
                        title="Copy URL"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                )}
                
                <button
                  onClick={() => {
                    if (uploadResult.url && electronAPI) {
                      electronAPI.openExternal(uploadResult.url);
                    }
                  }}
                  className="btn-primary w-full"
                  disabled={!uploadResult.url}
                >
                  Open in Browser
                </button>
              </div>
            ) : (
              // Upload/export options
              <div className="space-y-4">
                {/* Cloud upload */}
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-900">☁️ Cloud Upload</h4>
                  
                  {isUploading ? (
                    <div className="space-y-3">
                      <div className="progress-bar">
                        <div 
                          className="progress-bar-fill"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-600 text-center">
                        Uploading... {Math.round(uploadProgress)}%
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={handleCloudUpload}
                      disabled={!projectId || !userId || steps.length === 0}
                      className="btn-primary w-full"
                    >
                      Upload to Cloud
                    </button>
                  )}
                  
                  <p className="text-xs text-gray-500">
                    Upload your recording to share with team members or access from anywhere.
                  </p>
                  
                  {!projectId && (
                    <p className="text-xs text-red-600">
                      ⚠️ No project selected
                    </p>
                  )}
                </div>

                <hr className="border-gray-200" />

                {/* Local save */}
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-900">💾 Local Save</h4>
                  
                  <button
                    onClick={handleLocalSave}
                    className="btn-secondary w-full"
                    disabled={steps.length === 0}
                  >
                    Show in Folder
                  </button>
                  
                  <p className="text-xs text-gray-500">
                    View the recorded screenshots and data files on your local disk.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <span className="text-red-500">⚠️</span>
                  <div>
                    <p className="text-sm font-medium text-red-800">Error</p>
                    <p className="text-xs text-red-600">{error}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            {uploadResult?.success ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;