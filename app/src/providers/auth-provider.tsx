import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { login, register, logout, me } from '@/api/auth';
import type { LoginIn, RegisterIn, UserRead } from '@/types/openapi';

type AuthCtx = {
  user: UserRead | null;
  loading: boolean;
  login: (data: LoginIn) => Promise<void>;
  register: (data: RegisterIn) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [user, setUser] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  // initial load – rely on httpOnly cookie; just try /me
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const meResp = await me();
        if (mounted) setUser(meResp);
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogin = async (body: LoginIn) => {
    await login(body); // cookie set by server
    const meResp = await me();
    setUser(meResp);
    // In react-query v5, provide a predicate to invalidate all queries
    await qc.invalidateQueries({ predicate: () => true });
  };

  const handleRegister = async (body: RegisterIn) => {
    await register(body); // cookie set by server
    const meResp = await me();
    setUser(meResp);
    await qc.invalidateQueries({ predicate: () => true });
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    qc.clear();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login: handleLogin,
        register: handleRegister,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
