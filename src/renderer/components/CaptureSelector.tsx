import React, { useState, useEffect } from 'react';
import { Display, WindowInfo, CaptureArea } from '../../main/preload';
import { useRecording } from '../hooks/useRecording';
import { Search, RefreshCw, Monitor, Smartphone, Play, X } from 'lucide-react';

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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
        <div className="bg-card rounded-lg border shadow-lg max-w-md w-full">
          <div className="p-8 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-foreground">Loading capture options...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-card rounded-lg border shadow-lg max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">Select Capture Area</h2>
            <p className="text-small mt-1">Choose what you want to record</p>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search windows..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10 w-64"
              />
            </div>
            
            {/* Refresh */}
            <button
              onClick={handleRefresh}
              className="btn-ghost"
              title="Refresh windows"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            {/* Close */}
            <button
              onClick={onCancel}
              className="btn-ghost h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-8">
            {/* Screens section */}
            <div>
              <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Displays
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* All Displays */}
                <div
                  onClick={handleAllDisplaysSelect}
                  className="card cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/50 group"
                >
                  <div className="card-content flex flex-col items-center p-6">
                    <Monitor className="h-12 w-12 mb-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <h4 className="font-semibold mb-1">Entire Screen</h4>
                    <p className="text-small text-center">Capture all displays</p>
                  </div>
                </div>

                {/* Individual displays */}
                {displays.map((display) => (
                  <div
                    key={display.id}
                    onClick={() => handleDisplaySelect(display)}
                    className="card cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/50 group"
                  >
                    <div className="card-content flex flex-col items-center p-6">
                      <Smartphone className="h-12 w-12 mb-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <h4 className="font-semibold mb-1">{display.name}</h4>
                      <p className="text-small text-center">
                        {display.bounds.width} × {display.bounds.height}
                        {display.isPrimary && (
                          <span className="ml-1">
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                              Primary
                            </span>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Separator */}
            <div className="border-t" />

            {/* Applications section */}
            <div>
              <h3 className="text-lg font-medium mb-4">Applications</h3>
              
              {filteredWindows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Smartphone className="h-12 w-12 text-muted-foreground mb-4" />
                  <h4 className="text-base font-medium mb-2">No windows found</h4>
                  <p className="text-small max-w-sm">
                    {searchTerm 
                      ? 'Try adjusting your search or refreshing the list.' 
                      : 'No visible application windows are currently available.'
                    }
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredWindows.map((window) => (
                    <div
                      key={window.handle}
                      onClick={() => handleWindowSelect(window)}
                      className="card cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/50 group"
                    >
                      <div className="card-content p-4">
                        {/* Window thumbnail area */}
                        <div className="h-32 bg-muted rounded-md border mb-3 flex items-center justify-center group-hover:bg-muted/80 transition-colors">
                          <Smartphone className="h-8 w-8 text-muted-foreground" />
                        </div>
                        
                        {/* Window info */}
                        <div className="space-y-1">
                          <h4 className="font-medium truncate" title={window.title}>
                            {window.title}
                          </h4>
                          <p className="text-small">
                            Process ID: {window.processId}
                          </p>
                          <p className="text-xs text-muted-foreground">
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
        <div className="flex items-center justify-between p-6 border-t">
          <p className="text-small text-muted-foreground">
            Click on a display or window to start recording
          </p>
          
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="btn-secondary"
            >
              Cancel
            </button>
            
            <button
              onClick={handleAllDisplaysSelect}
              className="btn-primary flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Record Full Screen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaptureSelector;