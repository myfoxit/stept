import React, { useState } from 'react';
import { sendToBackground } from '@/shared/messages';

interface LoginPanelProps {
  onLoginSuccess: () => void;
}

export default function LoginPanel({ onLoginSuccess }: LoginPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await sendToBackground<any>({ type: 'LOGIN' });
      if (result.success) {
        onLoginSuccess();
      } else {
        setError('Login failed: ' + (result.error || 'Unknown error'));
      }
    } catch (e: any) {
      setError('Login failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="spLoginPanel" className="sp-auth-panel">
      <div className="sp-auth-content">
        <div className="login-illustration">
          <svg width="64" height="64" viewBox="0 0 38 36">
            <rect x="0" y="4" width="32" height="32" rx="9" fill="#4f46e5" />
            <rect x="7" y="11" width="10" height="3.5" rx="1.75" fill="white" />
            <rect x="7" y="17.5" width="18" height="3.5" rx="1.75" fill="white" />
            <rect x="7" y="24" width="14" height="3.5" rx="1.75" fill="white" />
            <path
              d="M33 0 L34.5 4.5 L38 6 L34.5 7.5 L33 12 L31.5 7.5 L28 6 L31.5 4.5 Z"
              fill="#4f46e5"
            />
          </svg>
        </div>
        <p className="sp-welcome">Welcome to Stept</p>
        <p className="sp-subtitle">Sign in to start capturing workflows</p>
        <button
          id="spLoginBtn"
          className="btn btn-cta"
          disabled={loading}
          onClick={handleLogin}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
        {error && (
          <div id="spLoginError" className="sp-error">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
