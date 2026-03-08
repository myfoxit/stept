import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { verifyEmail } from '@/api/auth';

export default function VerifyPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      return;
    }

    let mounted = true;
    verifyEmail({ token })
      .then(() => { if (mounted) setStatus('success'); })
      .catch(() => { if (mounted) setStatus('error'); });
    return () => { mounted = false; };
  }, [searchParams]);

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-4">
        {status === 'loading' && (
          <p className="text-muted-foreground">Verifying your email…</p>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-2xl font-bold">Email verified!</h1>
            <p className="text-muted-foreground">You can now log in.</p>
            <Link to="/login" className="text-primary underline underline-offset-4">
              Go to login
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold text-destructive">Verification failed</h1>
            <p className="text-muted-foreground">Invalid or expired verification link.</p>
            <Link to="/login" className="text-primary underline underline-offset-4">
              Go to login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
