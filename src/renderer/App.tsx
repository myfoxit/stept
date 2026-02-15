import React, { useEffect, useState } from 'react';
import MainWindow from './components/MainWindow';
import { ContextSuggestions } from './components/ContextSuggestions';
import { Loader2, Circle } from 'lucide-react';

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.electronAPI) {
        console.log('Electron API available');
      } else {
        console.warn('Electron API not available — running without IPC');
      }
      setReady(true);
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[13px]">Starting Ondoki...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-white flex items-center justify-center p-4">
        <div className="card p-4 max-w-sm w-full text-center space-y-3">
          <p className="text-[13px] text-red-600">{error}</p>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <MainWindow />
      <ContextSuggestions />
    </div>
  );
};

export default App;
