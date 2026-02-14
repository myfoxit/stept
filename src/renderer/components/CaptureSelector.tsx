import React, { useState, useEffect } from 'react';
import { Display, WindowInfo, CaptureArea } from '../../main/preload';
import { useRecording } from '../hooks/useRecording';

interface CaptureSelectorProps {
  onSelect: (captureArea: CaptureArea) => void;
  onCancel: () => void;
}

const CaptureSelector: React.FC<CaptureSelectorProps> = ({ onSelect, onCancel }) => {
  const { displays, windows, loadCaptureOptions, isLoading } = useRecording();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'displays' | 'windows'>('displays');

  // Load displays and windows when component mounts
  useEffect(() => {
    loadCaptureOptions();
  }, [loadCaptureOptions]);

  // Filter windows based on search term
  const filteredWindows = windows.filter(window =>
    window.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    window.processId.toString().includes(searchTerm)
  );

  // Handle all displays selection
  const handleAllDisplaysSelect = () => {
    const captureArea: CaptureArea = {
      type: 'all-displays',
    };
    onSelect(captureArea);
  };

  // Handle single display selection
  const handleDisplaySelect = (display: Display) => {
    const captureArea: CaptureArea = {
      type: 'single-display',
      displayId: display.id,
      displayName: display.name,
      bounds: display.bounds,
    };
    onSelect(captureArea);
  };

  // Handle window selection
  const handleWindowSelect = (window: WindowInfo) => {
    const captureArea: CaptureArea = {
      type: 'window',
      windowHandle: window.handle,
      windowTitle: window.title,
      bounds: window.bounds,
    };
    onSelect(captureArea);
  };

  // Refresh windows list
  const handleRefresh = () => {
    loadCaptureOptions();
  };

  if (isLoading) {
    return (
      <div className="dialog-overlay">
        <div className="dialog-content max-w-2xl">
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p>Loading capture options...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog-content max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Select Capture Area</h2>
          <div className="flex items-center space-x-4">
            {/* Search */}
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">🔍</span>
              <input
                type="text"
                placeholder="Search for windows"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field w-64"
              />
            </div>
            
            {/* Refresh */}
            <button
              onClick={handleRefresh}
              className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              title="Refresh windows"
            >
              🔄
            </button>
            
            {/* Start capture (all displays) */}
            <button
              onClick={handleAllDisplaysSelect}
              className="btn-primary"
            >
              Start Capture
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-96 overflow-y-auto scrollbar-thin">
          <div className="space-y-8">
            {/* Screens section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Screens</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* All Displays */}
                <div
                  onClick={handleAllDisplaysSelect}
                  className="capture-card"
                >
                  <div className="flex flex-col items-center p-6">
                    <div className="text-6xl mb-4">🖥️</div>
                    <h4 className="font-semibold text-gray-900 mb-1">Entire Screen</h4>
                    <p className="text-sm text-gray-600 text-center">Capture all displays</p>
                  </div>
                </div>

                {/* Individual displays */}
                {displays.map((display) => (
                  <div
                    key={display.id}
                    onClick={() => handleDisplaySelect(display)}
                    className="capture-card"
                  >
                    <div className="flex flex-col items-center p-6">
                      <div className="text-6xl mb-4">📺</div>
                      <h4 className="font-semibold text-gray-900 mb-1">{display.name}</h4>
                      <p className="text-sm text-gray-600 text-center">
                        {display.bounds.width} × {display.bounds.height}
                        {display.isPrimary && ' (Primary)'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <hr className="border-gray-200" />

            {/* Applications section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Applications</h3>
              
              {filteredWindows.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {searchTerm ? 'No windows found matching your search.' : 'No visible windows found.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredWindows.map((window) => (
                    <div
                      key={window.handle}
                      onClick={() => handleWindowSelect(window)}
                      className="capture-card"
                    >
                      <div className="p-4">
                        {/* Window thumbnail area */}
                        <div className="h-32 bg-gray-100 border border-gray-200 rounded mb-3 flex items-center justify-center">
                          {/* Placeholder for window thumbnail */}
                          <span className="text-4xl">🪟</span>
                        </div>
                        
                        {/* Window info */}
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-1 truncate" title={window.title}>
                            {window.title}
                          </h4>
                          <p className="text-sm text-gray-600">
                            PID: {window.processId}
                          </p>
                          <p className="text-xs text-gray-500">
                            {window.bounds.width} × {window.bounds.height}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CaptureSelector;