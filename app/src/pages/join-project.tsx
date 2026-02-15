import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { apiClient } from '@/lib/apiClient';
import { IconLoader2, IconAlertTriangle } from '@tabler/icons-react';
import { useMe } from '@/hooks/api/auth';

export function JoinProjectPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: currentUser, isLoading: authLoading } = useMe();
  const [isJoining, setIsJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteInfo, setInviteInfo] = useState<{ email?: string; role?: string } | null>(null);

  const token = searchParams.get('token');

  // Decode token for display
  useEffect(() => {
    if (token) {
      try {
        const decoded = atob(token);
        const parsed = JSON.parse(decoded);
        setInviteInfo({ email: parsed.email, role: parsed.role });
      } catch {
        // invalid token
      }
    }
  }, [token]);

  // Auto-join when logged in
  useEffect(() => {
    if (currentUser && token && !isJoining && !joined && !error) {
      handleJoin();
    }
  }, [currentUser, token]);

  const handleJoin = async () => {
    if (!token) {
      setError('Invalid invite link.');
      return;
    }

    setIsJoining(true);
    setError(null);
    try {
      const response = await apiClient.post('/projects/join', { token });

      if (response.data.status === 'already_member') {
        toast.info('You\'re already a member of this project.');
      } else {
        toast.success('You\'ve joined the project!');
      }

      setJoined(true);
      navigate('/');
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Failed to join project.';
      setError(detail);
    } finally {
      setIsJoining(false);
    }
  };

  // Still loading auth state
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not logged in
  if (!currentUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-muted-foreground">
          You've been invited to join a project
          {inviteInfo?.email && (
            <> as <span className="font-medium text-foreground">{inviteInfo.email}</span></>
          )}
        </p>
        <Button
          onClick={() => navigate(`/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`)}
        >
          Sign in to accept invite
        </Button>
      </div>
    );
  }

  // Error state (wrong email, expired, etc.)
  if (error) {
    const isWrongEmail = error.toLowerCase().includes('different email');
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <IconAlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium text-destructive">{error}</p>
        {isWrongEmail && inviteInfo?.email && (
          <p className="text-xs text-muted-foreground">
            This invite is for <span className="font-medium">{inviteInfo.email}</span>.
            You're signed in as <span className="font-medium">{currentUser.email}</span>.
          </p>
        )}
        <div className="flex gap-2">
          {isWrongEmail && (
            <Button variant="outline" size="sm" onClick={() => {
              // Log out and redirect back here to sign in with correct account
              navigate(`/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`);
            }}>
              Sign in with a different account
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            Go home
          </Button>
        </div>
      </div>
    );
  }

  // Joining in progress
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <IconLoader2 className="h-4 w-4 animate-spin" />
        Joining project…
      </div>
    </div>
  );
}
