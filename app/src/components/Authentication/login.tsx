import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useSearchParams } from 'react-router-dom';
import { getApiBaseUrl } from '@/lib/apiClient';
import { resendVerification } from '@/api/auth';
import type { AxiosError } from 'axios';

// ---------------------------------------------------------------------------
// Validation helpers (mirrors backend: api/app/crud/auth.py + Pydantic EmailStr)
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string | null {
  if (!email) return null; // don't nag on empty
  if (!EMAIL_RE.test(email)) return 'Please enter a valid email address.';
  return null;
}

interface PasswordCheck {
  label: string;
  met: boolean;
}

function getPasswordChecks(pw: string): PasswordCheck[] {
  return [
    { label: 'At least 8 characters', met: pw.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(pw) },
    { label: 'One lowercase letter', met: /[a-z]/.test(pw) },
    { label: 'One digit', met: /\d/.test(pw) },
  ];
}

function validatePassword(pw: string): string | null {
  if (!pw) return null;
  const checks = getPasswordChecks(pw);
  const failing = checks.filter((c) => !c.met);
  if (failing.length > 0) return failing.map((c) => c.label).join(', ');
  return null;
}

// Small inline validation message component
function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-destructive text-xs mt-1">{message}</p>;
}

// Password strength checklist shown while typing
function PasswordChecklist({ password }: { password: string }) {
  if (!password) return null;
  const checks = getPasswordChecks(password);
  return (
    <ul className="mt-1.5 space-y-0.5 text-xs">
      {checks.map((c) => (
        <li key={c.label} className={cn('flex items-center gap-1', c.met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
          {c.met ? '✓' : '○'} {c.label}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function getErrorStatus(err: unknown): number | null {
  // AxiosError has response.status
  if (err && typeof err === 'object' && 'response' in err) {
    const axErr = err as AxiosError<{ detail?: string }>;
    return axErr.response?.status ?? null;
  }
  return null;
}

function getErrorDetail(err: unknown): string | null {
  if (err && typeof err === 'object' && 'response' in err) {
    const axErr = err as AxiosError<{ detail?: string }>;
    return axErr.response?.data?.detail ?? null;
  }
  return null;
}

function isUnauthorizedError(err: unknown): boolean {
  // The 401 interceptor converts to Error('UNAUTHORIZED')
  if (err instanceof Error && err.message === 'UNAUTHORIZED') return true;
  return getErrorStatus(err) === 401;
}

// ---------------------------------------------------------------------------
// OAuth buttons
// ---------------------------------------------------------------------------

function GoogleButton() {
  return (
    <Button
      variant="outline"
      type="button"
      className="w-full"
      onClick={() => { window.location.href = getApiBaseUrl() + '/auth/google'; }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Continue with Google
    </Button>
  );
}

function GitHubButton({ label }: { label?: string }) {
  return (
    <Button
      variant="outline"
      type="button"
      className="w-full"
      onClick={() => { window.location.href = getApiBaseUrl() + '/auth/github'; }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path
          d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
          fill="currentColor"
        />
      </svg>
      {label ?? 'Continue with GitHub'}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Error alert component
// ---------------------------------------------------------------------------

function ErrorAlert({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-destructive text-sm bg-destructive/10 rounded-md px-3 py-2">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export type AuthView = 'login' | 'register' | 'reset';
interface AuthFormProps extends React.ComponentProps<'form'> {
  onSwitch(view: AuthView): void;
  onSuccess?: () => void;
}

export function LoginForm({
  className,
  onSwitch,
  onSuccess,
  ...props
}: AuthFormProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const emailError = useMemo(() => (emailTouched ? validateEmail(email) : null), [email, emailTouched]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [deviceAuth, setDeviceAuth] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Handle OAuth error redirect
  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError === 'oauth_failed') {
      setError('OAuth login failed. Please try again or use email/password.');
      setErrorType('oauth');
      // Clear error param from URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('error');
      window.history.replaceState({}, '', window.location.pathname + (newParams.toString() ? '?' + newParams.toString() : ''));
    }
  }, [searchParams]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    const returnTo = searchParams.get('return_to');
    if (returnTo?.includes('/api/v1/auth/authorize')) {
      setDeviceAuth(true);
    }
  }, [searchParams]);

  // Clear error when user types
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setError(null);
    setErrorType(null);
    setResendSuccess(false);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setError(null);
    setErrorType(null);
    setResendSuccess(false);
  };

  const handleResendVerification = async () => {
    setResendCooldown(60);
    try {
      await resendVerification({ email });
    } catch {
      // silently fail
    }
    setResendSuccess(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorType(null);
    setResendSuccess(false);
    setLoading(true);
    try {
      await login({ email, password });

      const returnTo = searchParams.get('return_to');
      if (returnTo) {
        window.location.href = returnTo;
      } else {
        onSuccess?.();
      }
    } catch (err) {
      const status = getErrorStatus(err);

      if (isUnauthorizedError(err)) {
        setError('Invalid email or password.');
        setErrorType('credentials');
      } else if (status === 403) {
        setError('Please verify your email before logging in.');
        setErrorType('not_verified');
      } else if (status === 429) {
        setError('Too many login attempts. Please wait a moment and try again.');
        setErrorType('rate_limited');
      } else {
        setError('Something went wrong. Please try again.');
        setErrorType('unknown');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('flex flex-col gap-6', className)}
      {...props}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">
          {deviceAuth ? 'Authorize Desktop App' : 'Login to your account'}
        </h1>
        <p className="text-muted-foreground text-sm text-balance">
          {deviceAuth
            ? 'Sign in to authorize the ProcessRecorder desktop application'
            : 'Enter your email below to login to your account'}
        </p>
        {deviceAuth && (
          <div className="flex items-center gap-2 mt-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-md">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-blue-600 dark:text-blue-400">
              Desktop app is waiting for authorization
            </span>
          </div>
        )}
      </div>
      <div className="grid gap-6">
        <div className="grid gap-3">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
            required
            value={email}
            onChange={handleEmailChange}
            onBlur={() => setEmailTouched(true)}
            className={cn(emailError && 'border-destructive')}
          />
          <FieldError message={emailError} />
        </div>
        <div className="grid gap-3">
          <div className="flex items-center">
            <Label htmlFor="password">Password</Label>
            <button
              type="button"
              onClick={() => onSwitch('reset')}
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              Forgot your password?
            </button>
          </div>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={handlePasswordChange}
          />
        </div>

        {error && (
          <ErrorAlert>
            {error}
            {errorType === 'not_verified' && !resendSuccess && (
              <>
                {' '}
                <button
                  type="button"
                  className="underline underline-offset-4 font-medium"
                  disabled={resendCooldown > 0}
                  onClick={handleResendVerification}
                >
                  {resendCooldown > 0 ? `Resend verification email (${resendCooldown}s)` : 'Resend verification email'}
                </button>
              </>
            )}
          </ErrorAlert>
        )}
        {resendSuccess && (
          <p className="text-green-600 text-sm bg-green-600/10 rounded-md px-3 py-2">
            Verification email sent! Check your inbox.
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Logging in…' : 'Login'}
        </Button>
        <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
          <span className="bg-background text-muted-foreground relative z-10 px-2">
            Or continue with
          </span>
        </div>
        <GoogleButton />
        <GitHubButton />
      </div>
      <div className="text-center text-sm">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          onClick={() => onSwitch('register')}
          className="underline underline-offset-4"
        >
          Sign up
        </button>
      </div>
    </form>
  );
}

export function RegisterForm({
  className,
  onSwitch,
  onSuccess,
  ...props
}: AuthFormProps) {
  const { register: doRegister } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const emailError = useMemo(() => (emailTouched ? validateEmail(email) : null), [email, emailTouched]);
  const passwordError = useMemo(() => (passwordTouched ? validatePassword(password) : null), [password, passwordTouched]);
  const isValid = !validateEmail(email) && !validatePassword(password) && email && password;
  const [searchParams] = useSearchParams();

  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);

  // Clear error when user types
  const clearError = () => { setError(null); setErrorType(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);
    setPasswordTouched(true);
    if (validateEmail(email) || validatePassword(password)) return;
    setError(null);
    setErrorType(null);
    setLoading(true);
    try {
      await doRegister({ email, password, name });

      const returnTo = searchParams.get('return_to');
      if (returnTo) {
        window.location.href = returnTo;
      } else {
        onSuccess?.();
      }
    } catch (err) {
      const status = getErrorStatus(err);
      const detail = getErrorDetail(err);

      if (status === 409) {
        setError('An account with this email already exists.');
        setErrorType('email_taken');
      } else if (status === 422) {
        setError(detail ?? 'Validation error. Please check your input.');
        setErrorType('validation');
      } else {
        setError('Something went wrong. Please try again.');
        setErrorType('unknown');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('flex flex-col gap-6', className)}
      {...props}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Create a new account</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Enter your email and password to sign up
        </p>
      </div>
      <div className="grid gap-6">
        <div className="grid gap-3">
          <Label htmlFor="reg-name">Name</Label>
          <Input
            id="reg-name"
            type="text"
            required
            placeholder="Your name"
            value={name}
            onChange={(e) => { setName(e.target.value); clearError(); }}
          />
        </div>
        <div className="grid gap-3">
          <Label htmlFor="reg-email">Email</Label>
          <Input
            id="reg-email"
            type="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearError(); }}
            onBlur={() => setEmailTouched(true)}
            className={cn(emailError && 'border-destructive')}
          />
          <FieldError message={emailError} />
        </div>
        <div className="grid gap-3">
          <Label htmlFor="reg-password">Password</Label>
          <Input
            id="reg-password"
            type="password"
            required
            value={password}
            onChange={(e) => { setPassword(e.target.value); setPasswordTouched(true); clearError(); }}
            onBlur={() => setPasswordTouched(true)}
            className={cn(passwordError && 'border-destructive')}
          />
          <PasswordChecklist password={password} />
        </div>

        {error && (
          <ErrorAlert>
            {error}
            {errorType === 'email_taken' && (
              <>
                {' '}
                <button
                  type="button"
                  className="underline underline-offset-4 font-medium"
                  onClick={() => onSwitch('login')}
                >
                  Log in instead?
                </button>
              </>
            )}
          </ErrorAlert>
        )}

        <Button type="submit" className="w-full" disabled={loading || !isValid}>
          {loading ? 'Creating…' : 'Create account'}
        </Button>
        <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
          <span className="bg-background text-muted-foreground relative z-10 px-2">
            Or continue with
          </span>
        </div>
        <GoogleButton />
        <GitHubButton />
      </div>
      <div className="text-center text-sm">
        Already have an account?{' '}
        <button
          type="button"
          onClick={() => onSwitch('login')}
          className="underline underline-offset-4"
        >
          Log in
        </button>
      </div>
    </form>
  );
}

export function ResetPasswordForm({
  className,
  onSwitch,
  ...props
}: AuthFormProps) {
  return (
    <form className={cn('flex flex-col gap-6', className)} {...props}>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="text-muted-foreground text-sm text-balance">
          We'll send you a link to reset your password
        </p>
      </div>
      <div className="grid gap-6">
        <div className="grid gap-3">
          <Label htmlFor="reset-email">Email</Label>
          <Input id="reset-email" type="email" required />
        </div>
        <Button type="submit" className="w-full">
          Send reset link
        </Button>
      </div>
      <div className="text-center text-sm">
        Remembered?{' '}
        <button
          type="button"
          onClick={() => onSwitch('login')}
          className="underline underline-offset-4"
        >
          Back to login
        </button>
      </div>
    </form>
  );
}
