
import type { ApiError } from '@/lib/apiClient';
import { login, register, logout, me } from '@/api/auth';
import type { LoginIn, RegisterIn, TokenRead } from '@/types/openapi';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';




export const useMe = () =>
  useQuery<UserRead, ApiError>({
    queryKey: ['me'],
    queryFn: me,
    retry: false,
    // Remove the enabled condition - let it always try with cookies
  });

export const useLogin = () => {
  const qc = useQueryClient();
  return useMutation<TokenRead, ApiError, LoginIn>({
    mutationFn: login,
    onSuccess: () => {
      // No token storage needed - cookies are handled by browser
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
};

export const useRegister = () => {
  const qc = useQueryClient();
  return useMutation<TokenRead, ApiError, RegisterIn>({
    mutationFn: register,
    onSuccess: () => {
      // No token storage needed - cookies are handled by browser
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation<void, ApiError>({
    mutationFn: logout,
    onSuccess: () => {
      // No token removal needed - server clears the cookie
      qc.clear();
    },
  });
};

