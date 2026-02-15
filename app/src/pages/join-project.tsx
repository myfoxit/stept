import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { apiClient } from '@/lib/apiClient';
import { IconLoader2 } from '@tabler/icons-react';
import { useMe } from '@/hooks/api/auth';

export function JoinProjectPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: currentUser, isLoading: authLoading } = useMe();
  const [isJoining, setIsJoining] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ email?: string; role?: string } | null>(null);

  const token = searchParams.get('token');

  // Decode token for display (email hint)
  useEffect(() => {
    if (token) {
      try {
        const decoded = atob(token);
        const parsed = JSON.parse(decoded);
        setInviteInfo({ email: parsed.email, role: parsed.role });
      } catch {
        // invalid token, will fail on join
      }
    }
  }, [token]);

  // Auto-join when logged in
  useEffect(() => {
    if (currentUser && token && !isJoining) {
      handleJoin();
    }
  }, [currentUser, token]);

  const handleJoin = async () => {
    if (!token) {
      toast.error('Invalid invite link');
      return;
    }

    setIsJoining(true);
    try {
      const response = await apiClient.post('/projects/join', { token });

      if (response.data.status === 'already_member') {
        toast.info('You\'re already a member of this project.');
      } else {
        toast.success('You\'ve joined the project!');
      }

      navigate('/');
    } catch (error: any) {
      const detail = error.response?.data?.detail || 'Failed to join project.';
      toast.error(detail);
      // If wrong email, stay on page so they can see the error
      if (error.response?.status !== 403) {
        navigate('/');
      }
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

  // Not logged in — redirect to login with return URL
  if (!currentUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            You've been invited to join a project
            {inviteInfo?.email && (
              <> as <span className="font-medium text-foreground">{inviteInfo.email}</span></>
            )}
          </p>
        </div>
        <Button
          onClick={() => navigate(`/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`)}
        >
          Sign in to accept invite
        </Button>
        <Button variant="link" size="sm" onClick={() => navigate('/register')}>
          Don't have an account? Register
        </Button>
      </div>
    );
  }

  // Logged in, joining in progress
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <IconLoader2 className="h-4 w-4 animate-spin" />
        Joining project…
      </div>
    </div>
  );
}
