import React, { useState, useEffect } from 'react';
import { Display, WindowInfo, CaptureArea } from '../../main/preload';
import { useRecording } from '../hooks/useRecording';
import { Search, RefreshCw, Monitor, AppWindow, Play, X, Loader2 } from 'lucide-react';

interface CaptureSelectorProps {
  onSelect: (captureArea: CaptureArea) => void;
  onCancel: () => void;
}

const CaptureSelector: React.FC<CaptureSelectorProps> = ({ onSelect, onCancel }) => {
  const { displays, windows, loadCaptureOptions, isLoading } = useRecording();
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { loadCaptureOptions(); }, [loadCaptureOptions]);

  const filteredWindows = windows.filter(w =>
    w.title.toLowerCase().includes(searchTerm.toLowerCase()) || w.processId.toString().includes(searchTerm)
  );

  const handleAllDisplaysSelect = () => { onSelect({ type: 'all-displays' }); };
  const handleDisplaySelect = (display: Display) => {
    onSelect({ type: 'single-display', displayId: display.id, displayName: display.name, bounds: display.bounds });
  };
  const handleWindowSelect = (window: WindowInfo) => {
    onSelect({ type: 'window', windowHandle: window.handle, windowTitle: window.title, bounds: window.bounds });
  };

  if (isLoading) {
    return (
      <div className="dialog-overlay">
        <div className="card p-6 text-center max-w-xs">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-gray-400" />
          <p className="text-[13px] text-gray-500">Loading capture options...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog-content max-w-3xl">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">Select Capture Area</h2>
            <p className="text-[11px] text-gray-400">Choose what to record</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input type="text" placeholder="Search windows..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)} className="input-field pl-7 w-48" />
            </div>
            <button onClick={() => loadCaptureOptions()} className="btn-icon" title="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button onClick={onCancel} className="btn-icon"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[60vh]">
          {/* Displays */}
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Monitor className="h-3.5 w-3.5" /> Displays
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={handleAllDisplaysSelect}
                className="p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors text-center">
                <Monitor className="h-6 w-6 mx-auto mb-1 text-gray-400" />
                <div className="text-[13px] font-medium text-gray-700">Entire Screen</div>
                <div className="text-[11px] text-gray-400">All displays</div>
              </button>
              {displays.map((display) => (
                <button key={display.id} onClick={() => handleDisplaySelect(display)}
                  className="p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors text-center">
                  <Monitor className="h-6 w-6 mx-auto mb-1 text-gray-400" />
                  <div className="text-[13px] font-medium text-gray-700">{display.name}</div>
                  <div className="text-[11px] text-gray-400">
                    {display.bounds.width}×{display.bounds.height}
                    {display.isPrimary && <span className="ml-1 text-indigo-500">Primary</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Windows */}
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <AppWindow className="h-3.5 w-3.5" /> Applications
            </h3>
            {filteredWindows.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">
                {searchTerm ? 'No matching windows' : 'No visible windows'}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {filteredWindows.map((window) => (
                  <button key={window.handle} onClick={() => handleWindowSelect(window)}
                    className="p-2.5 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors text-left">
                    <div className="h-16 bg-gray-50 rounded border mb-2 flex items-center justify-center">
                      <AppWindow className="h-5 w-5 text-gray-300" />
                    </div>
                    <div className="text-[12px] font-medium text-gray-700 truncate">{window.title}</div>
                    <div className="text-[11px] text-gray-400">{window.bounds.width}×{window.bounds.height}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-between">
          <span className="text-[11px] text-gray-400">Click to start recording</span>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn-secondary">Cancel</button>
            <button onClick={handleAllDisplaysSelect} className="btn-primary gap-1.5">
              <Play className="h-3.5 w-3.5" /> Full Screen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaptureSelector;
