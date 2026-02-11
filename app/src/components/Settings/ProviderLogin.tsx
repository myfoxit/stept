import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  IconBrandGithubCopilot,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconLoader2,
  IconPlugConnected,
  IconPlugConnectedX,
  IconX,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  startCopilotDeviceFlow,
  pollCopilotDeviceFlow,
  disconnectCopilot,
  fetchProvidersStatus,
  type DeviceFlowStart,
  type ProviderStatus,
} from '@/api/authProviders';
import { updateChatConfig } from '@/api/chat';

// ── Copilot Login Card ───────────────────────────────────────────────────────

interface CopilotLoginCardProps {
  status: ProviderStatus | null;
  onStatusChange: () => void;
}

function CopilotLoginCard({ status, onStatusChange }: CopilotLoginCardProps) {
  const [phase, setPhase] = useState<'idle' | 'showing-code' | 'polling' | 'success' | 'error'>('idle');
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowStart | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef(false);

  const connected = status?.connected ?? false;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const handleStartLogin = async () => {
    setPhase('showing-code');
    setErrorMessage('');
    abortRef.current = false;

    try {
      const result = await startCopilotDeviceFlow();
      setDeviceFlow(result);
    } catch (err) {
      setPhase('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start device flow');
    }
  };

  const handleCopyCode = async () => {
    if (!deviceFlow) return;
    await navigator.clipboard.writeText(deviceFlow.user_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleOpenGitHub = () => {
    if (!deviceFlow) return;
    window.open(deviceFlow.verification_uri, '_blank');
    // Start polling after user opens GitHub
    setPhase('polling');
    startPolling(deviceFlow.interval);
  };

  const startPolling = useCallback((interval: number) => {
    const poll = async () => {
      if (abortRef.current) return;

      try {
        const result = await pollCopilotDeviceFlow();

        if (abortRef.current) return;

        if (result.status === 'success') {
          setPhase('success');
          toast.success('GitHub Copilot connected!', {
            description: 'You can now use Copilot as your AI provider.',
          });

          // Auto-set the provider to copilot
          try {
            await updateChatConfig({ provider: 'copilot', model: 'gpt-4o' });
          } catch {
            // Not critical — user can set it manually
          }

          onStatusChange();
          return;
        }

        if (result.status === 'expired') {
          setPhase('error');
          setErrorMessage('Device flow expired. Please try again.');
          return;
        }

        if (result.status === 'error') {
          setPhase('error');
          setErrorMessage(result.message || 'Authentication failed.');
          return;
        }

        // Still pending — poll again
        const nextInterval = (result.interval || interval) * 1000;
        pollTimerRef.current = setTimeout(poll, nextInterval);
      } catch (err) {
        if (!abortRef.current) {
          setPhase('error');
          setErrorMessage(err instanceof Error ? err.message : 'Polling failed');
        }
      }
    };

    pollTimerRef.current = setTimeout(poll, interval * 1000);
  }, [onStatusChange]);

  const handleCancel = () => {
    abortRef.current = true;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setPhase('idle');
    setDeviceFlow(null);
    setErrorMessage('');
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectCopilot();
      toast.success('GitHub Copilot disconnected.');
      onStatusChange();
    } catch (err) {
      toast.error('Failed to disconnect', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card className={connected ? 'border-green-200 bg-green-50/30' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${connected ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
              <IconBrandGithubCopilot className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-base">GitHub Copilot</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                GPT-4o, Claude Sonnet, o3-mini via Copilot
              </p>
            </div>
          </div>
          <Badge variant={connected ? 'default' : 'secondary'} className={connected ? 'bg-green-600' : ''}>
            {connected ? (
              <><IconPlugConnected className="mr-1 h-3 w-3" /> Connected</>
            ) : (
              'Not connected'
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Connected state */}
        {connected && phase !== 'showing-code' && phase !== 'polling' && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-700">
              Authenticated via GitHub. Ready to use.
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {disconnecting ? (
                <IconLoader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <IconPlugConnectedX className="mr-1 h-3 w-3" />
              )}
              Disconnect
            </Button>
          </div>
        )}

        {/* Idle state — show login button */}
        {!connected && phase === 'idle' && (
          <Button onClick={handleStartLogin} className="w-full">
            <IconBrandGithubCopilot className="mr-2 h-4 w-4" />
            Login with GitHub Copilot
          </Button>
        )}

        {/* Showing device code */}
        {phase === 'showing-code' && deviceFlow && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4 text-center space-y-3">
              <p className="text-sm text-muted-foreground">Enter this code on GitHub:</p>
              <div className="flex items-center justify-center gap-2">
                <code className="text-3xl font-bold tracking-widest text-foreground">
                  {deviceFlow.user_code}
                </code>
                <Button variant="ghost" size="icon" onClick={handleCopyCode} className="h-8 w-8">
                  {codeCopied ? (
                    <IconCheck className="h-4 w-4 text-green-500" />
                  ) : (
                    <IconCopy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleOpenGitHub} className="flex-1">
                <IconExternalLink className="mr-2 h-4 w-4" />
                Open GitHub & Authorize
              </Button>
              <Button variant="ghost" onClick={handleCancel}>
                <IconX className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Polling */}
        {phase === 'polling' && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/50 p-4 text-center space-y-2">
              {deviceFlow && (
                <div className="flex items-center justify-center gap-2 mb-2">
                  <code className="text-2xl font-bold tracking-widest">
                    {deviceFlow.user_code}
                  </code>
                </div>
              )}
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <IconLoader2 className="h-4 w-4 animate-spin" />
                Waiting for authorization…
              </div>
              <p className="text-xs text-muted-foreground">
                Enter the code above at GitHub, then click "Authorize".
              </p>
            </div>
            <Button variant="ghost" onClick={handleCancel} className="w-full">
              Cancel
            </Button>
          </div>
        )}

        {/* Success */}
        {phase === 'success' && (
          <div className="flex items-center gap-2 text-green-600 text-sm">
            <IconCheck className="h-4 w-4" />
            Successfully connected! Copilot is now your AI provider.
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="space-y-2">
            <p className="text-sm text-red-600">{errorMessage}</p>
            <Button variant="outline" onClick={handleStartLogin} size="sm">
              Try Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Provider Login Component ────────────────────────────────────────────

interface ProviderLoginProps {
  onStatusChange?: () => void;
}

export function ProviderLogin({ onStatusChange }: ProviderLoginProps) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const result = await fetchProvidersStatus();
      setProviders(result.providers);
    } catch {
      // Ignore — endpoint might not be available yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleStatusChange = () => {
    loadStatus();
    onStatusChange?.();
  };

  const copilotStatus = providers.find(p => p.provider === 'copilot') || null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <IconLoader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <CopilotLoginCard status={copilotStatus} onStatusChange={handleStatusChange} />
      {/* Future providers (Google, Azure, etc.) would go here */}
    </div>
  );
}
