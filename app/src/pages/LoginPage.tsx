import {
  LoginForm,
  RegisterForm,
  ResetPasswordForm,
} from '@/components/Authentication/login';
import type { AuthView } from '@/components/Authentication/login';
import { useState } from 'react';
import { GalleryVerticalEnd } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [view, setView] = useState<AuthView>('login');
  const navigate = useNavigate();

  const onSuccess = () => navigate('/');

  const renderForm = () => {
    switch (view) {
      case 'register':
        return <RegisterForm onSwitch={setView} onSuccess={onSuccess} />;
      case 'reset':
        return <ResetPasswordForm onSwitch={setView} />;
      default:
        return <LoginForm onSwitch={setView} onSuccess={onSuccess} />;
    }
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="#" className="flex items-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-4" />
            </div>
            Acme Inc.
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">{renderForm()}</div>
        </div>
      </div>
      <div className="bg-muted relative hidden lg:block">
        <img
          src="/placeholder.svg"
          alt="Image"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  );
}
