import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Monitor, LogOut } from 'lucide-react';
import { useState } from 'react';
import { getApiBaseUrl } from '@/lib/apiClient';

export function DeviceConsentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = searchParams.get('email') || 'your account';
  const responseType = searchParams.get('response_type') || '';
  const codeChallenge = searchParams.get('code_challenge') || '';
  const codeChallengeMethod = searchParams.get('code_challenge_method') || '';
  const redirectUri = searchParams.get('redirect_uri') || '';
  const state = searchParams.get('state') || undefined;

  const handleAuthorize = async () => {
    setLoading(true);
    setError(null);
    try {
      const baseUrl = getApiBaseUrl();
      const resp = await fetch(`${baseUrl}/auth/authorize/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          response_type: responseType,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          redirect_uri: redirectUri,
          state: state ?? null,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.detail || 'Authorization failed');
      }

      const data = await resp.json();
      window.location.href = data.redirect_uri;
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
      setLoading(false);
    }
  };

  const handleUseOtherAccount = async () => {
    // Clear session cookie and redirect to login with return_to preserving all OAuth params
    const baseUrl = getApiBaseUrl();
    await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});

    const authParams = new URLSearchParams({
      response_type: responseType,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      redirect_uri: redirectUri,
    });
    if (state) authParams.set('state', state);

    const authUrl = `${baseUrl}/auth/authorize?${authParams.toString()}`;
    navigate(`/login?return_to=${encodeURIComponent(authUrl)}&device_auth=true`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md space-y-6 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <Monitor className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-xl font-semibold">Authorize Desktop App</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;re about to authorize the <strong>Stept Desktop</strong> app
            as:
          </p>
          <p className="text-base font-medium">{email}</p>
          <p className="text-sm text-muted-foreground">Is this correct?</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Button onClick={handleAuthorize} disabled={loading} className="w-full">
            {loading ? 'Authorizing...' : 'Authorize'}
          </Button>
          <Button
            variant="outline"
            onClick={handleUseOtherAccount}
            disabled={loading}
            className="w-full"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Use a different account
          </Button>
        </div>
      </Card>
    </div>
  );
}
