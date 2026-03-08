import { request } from '@/lib/apiClient';
import type {
  LoginIn,
  RegisterIn,
  TokenRead,
  UserRead,
  PasswordResetRequestIn,
  PasswordResetConfirmIn,
} from '@/types/openapi';

// Ensure http-only session cookies are included on every request
const withCred = { withCredentials: true } as const;

export const login = (body: LoginIn) =>
  request<TokenRead, LoginIn>({
    method: 'POST',
    url: '/auth/login',
    data: body,
    ...withCred,
  });

export const register = (body: RegisterIn) =>
  request<TokenRead, RegisterIn>({
    method: 'POST',
    url: '/auth/register',
    data: body,
    ...withCred,
  });

export const refreshToken = () =>
  request<TokenRead>({ method: 'POST', url: '/auth/refresh', ...withCred });

export const logout = () =>
  request<void>({ method: 'POST', url: '/auth/logout', ...withCred });

export const me = () =>
  request<UserRead>({ method: 'GET', url: '/auth/me', ...withCred });

export const requestPwReset = (body: PasswordResetRequestIn) =>
  request<void, PasswordResetRequestIn>({
    method: 'POST',
    url: '/auth/password-reset/request',
    data: body,
    ...withCred,
  });

export const confirmPwReset = (body: PasswordResetConfirmIn) =>
  request<void, PasswordResetConfirmIn>({
    method: 'POST',
    url: '/auth/password-reset/confirm',
    data: body,
    ...withCred,
  });

export const resendVerification = (body: { email: string }) =>
  request<{ ok: boolean }>({
    method: 'POST',
    url: '/auth/resend-verification',
    data: body,
    ...withCred,
  });

export const verifyEmail = (body: { token: string }) =>
  request<{ ok: boolean }>({
    method: 'POST',
    url: '/auth/verify',
    data: body,
    ...withCred,
  });
