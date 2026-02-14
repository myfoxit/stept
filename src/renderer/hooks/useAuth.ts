import { useState, useCallback, useEffect } from 'react';
import { AuthStatus, UserInfo, Project } from '../../main/preload';

interface AuthState {
  isAuthenticated: boolean;
  user: UserInfo | null;
  projects: Project[];
  isLoading: boolean;
  error: string | null;
}

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    projects: [],
    isLoading: false,
    error: null,
  });

  // Listen for auth status changes
  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onAuthStatusChanged?.((status: AuthStatus) => {
      setState(prev => ({
        ...prev,
        isAuthenticated: status.isAuthenticated,
        user: status.user ?? null,
        projects: status.projects ?? [],
      }));
    });
    return () => { unsub?.(); };
  }, []);

  const login = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.initiateLogin();
    } catch (e: any) {
      setState(prev => ({ ...prev, error: e.message }));
    }
  }, []);

  const logout = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.logout();
      setState({ isAuthenticated: false, user: null, projects: [], isLoading: false, error: null });
    } catch (e: any) {
      setState(prev => ({ ...prev, error: e.message }));
    }
  }, []);

  const initializeAuth = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const autoLogin = await window.electronAPI.tryAutoLogin();
      if (autoLogin) {
        const status = await window.electronAPI.getAuthStatus();
        setState(prev => ({
          ...prev,
          isAuthenticated: status?.isAuthenticated ?? false,
          user: status?.user ?? null,
          projects: status?.projects ?? [],
          isLoading: false,
        }));
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  return {
    ...state,
    hasProjects: state.projects.length > 0,
    login,
    logout,
    initializeAuth,
  };
};

export default useAuth;
