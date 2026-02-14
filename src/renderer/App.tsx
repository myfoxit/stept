import React, { useEffect, useState } from 'react';
import MainWindow from './components/MainWindow';

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Brief delay to let preload bridge initialize
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
      <div className="h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mb-6 mx-auto backdrop-blur-sm border border-white/20">
            <span className="text-3xl font-bold">O</span>
          </div>
          <h1 className="text-3xl font-semibold mb-2">Ondoki Desktop</h1>
          <p className="text-lg opacity-80">Starting...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-4 py-2 rounded">
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <MainWindow />
    </div>
  );
};

export default App;
