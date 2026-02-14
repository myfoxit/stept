import React, { useEffect, useState } from 'react';
import MainWindow from './components/MainWindow';
import { useAuth } from './hooks/useAuth';
import { useElectronAPI } from './hooks/useElectronAPI';

interface AppState {
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    isLoading: true,
    error: null,
    initialized: false,
  });

  const { authStatus, initializeAuth } = useAuth();
  const electronAPI = useElectronAPI();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('Initializing Ondoki Desktop...');
        setAppState(prev => ({ ...prev, isLoading: true, error: null }));

        // Check if electron API is available
        if (!electronAPI) {
          throw new Error('Electron API not available');
        }

        // Initialize authentication
        await initializeAuth();

        // Mark as initialized
        setAppState(prev => ({
          ...prev,
          isLoading: false,
          initialized: true,
        }));

        console.log('App initialization complete');
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setAppState(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    };

    initializeApp();
  }, [electronAPI, initializeAuth]);

  // Show loading screen while initializing
  if (appState.isLoading) {
    return <LoadingScreen />;
  }

  // Show error screen if initialization failed
  if (appState.error) {
    return <ErrorScreen error={appState.error} onRetry={() => window.location.reload()} />;
  }

  // Show main application
  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <MainWindow />
    </div>
  );
};

const LoadingScreen: React.FC = () => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center text-white">
      <div className="text-center">
        <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mb-6 mx-auto backdrop-blur-sm border border-white/20">
          <span className="text-3xl font-bold">O</span>
        </div>
        
        <h1 className="text-3xl font-semibold mb-2">Ondoki Desktop</h1>
        <p className="text-lg opacity-80 mb-8">Initializing application{dots}</p>
        
        <div className="flex space-x-2 justify-center">
          <div className="w-3 h-3 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-3 h-3 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-3 h-3 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  );
};

interface ErrorScreenProps {
  error: string;
  onRetry: () => void;
}

const ErrorScreen: React.FC<ErrorScreenProps> = ({ error, onRetry }) => {
  return (
    <div className="h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
        <div className="flex items-center mb-4">
          <div className="bg-red-100 rounded-full p-2 mr-3">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Initialization Failed</h2>
        </div>
        
        <p className="text-gray-600 mb-4">
          Failed to initialize the application. This might be a temporary issue.
        </p>
        
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
          <p className="text-sm text-red-800 font-mono">{error}</p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={onRetry}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
          >
            Retry
          </button>
          <button
            onClick={() => {
              if (window.electronAPI) {
                // In a real implementation, you might want to show logs or diagnostics
                console.log('Show diagnostics requested');
              }
            }}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-md transition-colors duration-200"
          >
            Diagnostics
          </button>
        </div>
        
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            If the problem persists, try restarting the application.
          </p>
        </div>
      </div>
    </div>
  );
};

export default App;