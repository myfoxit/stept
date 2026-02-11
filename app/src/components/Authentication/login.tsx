import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useSearchParams } from 'react-router-dom';

export type AuthView = 'login' | 'register' | 'reset';
interface AuthFormProps extends React.ComponentProps<'form'> {
  onSwitch(view: AuthView): void;
  onSuccess?: () => void; // added
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
  const [searchParams] = useSearchParams();
  const [deviceAuth, setDeviceAuth] = useState(false);

  useEffect(() => {
    // Check if this is a device authentication request
    const returnTo = searchParams.get('return_to');
    if (returnTo?.includes('/api/v1/auth/authorize')) {
      setDeviceAuth(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login({ email, password });
      
      // Check for return_to parameter for OAuth flow
      const returnTo = searchParams.get('return_to');
      if (returnTo) {
        // Redirect to the authorization endpoint
        window.location.href = returnTo;
      } else {
        onSuccess?.(); // normal redirect
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
            onChange={(e) => setEmail(e.target.value)}
          />
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
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Logging in…' : 'Login'}
        </Button>
        <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
          <span className="bg-background text-muted-foreground relative z-10 px-2">
            Or continue with
          </span>
        </div>
        <Button variant="outline" type="button" className="w-full">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path
              d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
              fill="currentColor"
            />
          </svg>
          Login with GitHub
        </Button>
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await doRegister({ email, password });
      
      // Check for return_to parameter for OAuth flow
      const returnTo = searchParams.get('return_to');
      if (returnTo) {
        // Redirect to the authorization endpoint
        window.location.href = returnTo;
      } else {
        onSuccess?.(); // normal redirect
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
          <Label htmlFor="reg-email">Email</Label>
          <Input
            id="reg-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-3">
          <Label htmlFor="reg-password">Password</Label>
          <Input
            id="reg-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </Button>
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
          We’ll send you a link to reset your password
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
