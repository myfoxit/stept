import { useState, useEffect, useCallback } from 'react';
import { AuthStatus, Project, UserInfo } from '../../main/preload';
import { useElectronAPI } from './useElectronAPI';

interface AuthState {
  status: AuthStatus;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
}

/**
 * Custom hook for authentication state management
 */
export const useAuth = () => {
  const electronAPI = useElectronAPI();
  const [authState, setAuthState] = useState<AuthState>({
    status: { isAuthenticated: false },
    isLoading: true,
    error: null,
    isInitialized: false,
  });

  // Initialize authentication status
  const initializeAuth = useCallback(async () => {
    if (!electronAPI) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Electron API not available',
      }));
      return;
    }

    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

      // Get current auth status
      const status = await electronAPI.getAuthStatus();
      
      // Try auto-login if not authenticated
      if (!status.isAuthenticated) {
        const autoLoginSuccess = await electronAPI.tryAutoLogin();
        if (autoLoginSuccess) {
          // Get updated status after auto-login
          const updatedStatus = await electronAPI.getAuthStatus();
          setAuthState(prev => ({
            ...prev,
            status: updatedStatus,
            isLoading: false,
            isInitialized: true,
          }));
        } else {
          setAuthState(prev => ({
            ...prev,
            status,
            isLoading: false,
            isInitialized: true,
          }));
        }
      } else {
        setAuthState(prev => ({
          ...prev,
          status,
          isLoading: false,
          isInitialized: true,
        }));
      }
    } catch (error) {
      console.error('Authentication initialization failed:', error);
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
        isInitialized: true,
      }));
    }
  }, [electronAPI]);

  // Listen for auth status changes
  useEffect(() => {
    if (!electronAPI) return;

    const unsubscribe = electronAPI.onAuthStatusChanged((status: AuthStatus) => {
      setAuthState(prev => ({
        ...prev,
        status,
        error: null,
      }));
    });

    return unsubscribe;
  }, [electronAPI]);

  // Handle login initiation
  const login = useCallback(async () => {
    if (!electronAPI) {
      throw new Error('Electron API not available');
    }

    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      await electronAPI.initiateLogin();
      // Note: Status will be updated via the event listener when auth completes
    } catch (error) {
      console.error('Login initiation failed:', error);
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed',
      }));
      throw error;
    }
  }, [electronAPI]);

  // Handle logout
  const logout = useCallback(async () => {
    if (!electronAPI) {
      throw new Error('Electron API not available');
    }

    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      await electronAPI.logout();
      // Status will be updated via the event listener
    } catch (error) {
      console.error('Logout failed:', error);
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Logout failed',
      }));
      throw error;
    }
  }, [electronAPI]);

  // Handle protocol URL for auth callback
  const handleAuthCallback = useCallback(async (url: string) => {
    if (!electronAPI) {
      throw new Error('Electron API not available');
    }

    try {
      const success = await electronAPI.handleAuthCallback(url);
      if (success) {
        // Status will be updated via the event listener
        setAuthState(prev => ({ ...prev, error: null }));
      } else {
        setAuthState(prev => ({
          ...prev,
          error: 'Authentication callback failed',
        }));
      }
      return success;
    } catch (error) {
      console.error('Auth callback handling failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Auth callback failed';
      setAuthState(prev => ({
        ...prev,
        error: errorMessage,
      }));
      throw new Error(errorMessage);
    }
  }, [electronAPI]);

  // Derived state for convenience
  const isAuthenticated = authState.status.isAuthenticated;
  const user = authState.status.user || null;
  const projects = authState.status.projects || [];
  const hasProjects = projects.length > 0;

  return {
    // State
    authStatus: authState.status,
    isAuthenticated,
    user,
    projects,
    hasProjects,
    isLoading: authState.isLoading,
    error: authState.error,
    isInitialized: authState.isInitialized,

    // Actions
    initializeAuth,
    login,
    logout,
    handleAuthCallback,
  };
};

/**
 * Helper hook to get the display name for a user
 */
export const useUserDisplayName = (user: UserInfo | null | undefined): string => {
  if (!user) return 'Guest';
  return user.name || user.email || 'User';
};

/**
 * Helper hook to find a project by ID
 */
export const useProject = (projectId: string | undefined, projects: Project[] = []) => {
  return projects.find(project => project.id === projectId) || null;
};

export default useAuth;