import {
  LoginForm,
  RegisterForm,
  ResetPasswordForm,
} from "@/components/Authentication/login";
import type { AuthView } from "@/components/Authentication/login";
import { useState } from "react";
import { GalleryVerticalEnd } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const [view, setView] = useState<AuthView>("login");
  const navigate = useNavigate();

  const onSuccess = () => navigate("/");

  const renderForm = () => {
    switch (view) {
      case "register":
        return <RegisterForm onSwitch={setView} onSuccess={onSuccess} />;
      case "reset":
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
            <svg
              style={{ width: "38px", height: "36px" }}
              width="38"
              height="36"
              viewBox="0 0 38 36"
            >
              <rect x="0" y="4" width="32" height="32" rx="9" fill="#3AB08A" />
              <rect
                x="7"
                y="11"
                width="10"
                height="3.5"
                rx="1.75"
                fill="white"
              />
              <rect
                x="7"
                y="17.5"
                width="18"
                height="3.5"
                rx="1.75"
                fill="white"
              />
              <rect
                x="7"
                y="24"
                width="14"
                height="3.5"
                rx="1.75"
                fill="white"
              />
              <path
                d="M33 0 L34.5 4.5 L38 6 L34.5 7.5 L33 12 L31.5 7.5 L28 6 L31.5 4.5 Z"
                fill="#3AB08A"
              />
            </svg>
            stept
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">{renderForm()}</div>
        </div>
      </div>
      <div className="bg-muted relative hidden lg:block">
        <div className="absolute inset-0 flex stretch">
          <div className="text-center"></div>
        </div>
      </div>
    </div>
  );
}
