import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, apiSend, getAccessToken, refreshAccessToken, setAccessToken, setSessionExpiredHandler } from '@/lib/api';
import { mapAuthUser, mapSession } from '@/lib/adapters';
import { roleHome } from '@/lib/status';
import { buildRegisterAgencyPayload, buildRegisterPayload, type RegisterAgencyFormValues, type RegisterFormValues } from '@/lib/payloads';
import type { Role, User } from '@/types/api';

interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterResult {
  /** True when the created account still needs an approval gate. */
  pending: boolean;
  statusMessage?: string;
  user: User | null;
  accessToken?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  role?: Role;
  /** True while the account is still awaiting agency approval. */
  isPending: boolean;
  /** True when the user must set their own password (admin-provisioned staff). */
  mustChangePassword: boolean;
  login: (input: LoginInput) => Promise<User>;
  register: (values: RegisterFormValues) => Promise<RegisterResult>;
  /** Agency self-registration: the workspace goes live immediately. */
  registerAgency: (values: RegisterAgencyFormValues) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  updateUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  /** `GET /auth/me` → `{ user, profile }`; mapped to one authenticated user. */
  const refreshUser = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      return null;
    }
    try {
      const current = mapAuthUser(await api<unknown>('/auth/me'));
      setUser(current);
      return current;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    setSessionExpiredHandler(() => {
      if (active) {
        setUser(null);
        setAccessToken(null);
      }
    });

    void (async () => {
      const token = await refreshAccessToken();
      if (token) {
        try {
          const current = mapAuthUser(await api<unknown>('/auth/me'));
          if (active) setUser(current);
        } catch {
          if (active) setAccessToken(null);
        }
      }
      if (active) setLoading(false);
    })();

    return () => {
      active = false;
      setSessionExpiredHandler(() => undefined);
    };
  }, []);

  const login = useCallback(
    async ({ email, password }: LoginInput) => {
      const session = mapSession(await apiSend<unknown>('post', '/auth/login', { email, password }));
      setAccessToken(session.accessToken);
      setUser(session.user);
      queryClient.clear();
      return session.user;
    },
    [queryClient],
  );

  /**
   * Registration creates an ACTIVE account (shop or salesman) with no approval
   * gate: the returned session is a fully working sign-in that lands straight
   * on the role dashboard.
   */
  const register = useCallback(async (values: RegisterFormValues): Promise<RegisterResult> => {
    const raw = await apiSend<unknown>('post', '/auth/register', buildRegisterPayload(values));
    const session = mapSession(raw);
    setAccessToken(session.accessToken);
    setUser(session.user);
    queryClient.clear();
    return { pending: false, statusMessage: session.statusMessage, user: session.user, accessToken: session.accessToken };
  }, [queryClient]);

  /**
   * Agency registration creates an ACTIVE AGENCY_ADMIN, so the returned session
   * is a fully working sign-in that lands straight on the admin dashboard.
   */
  const registerAgency = useCallback(async (values: RegisterAgencyFormValues): Promise<RegisterResult> => {
    const raw = await apiSend<unknown>('post', '/auth/register-agency', buildRegisterAgencyPayload(values));
    const session = mapSession(raw);
    setAccessToken(session.accessToken);
    setUser(session.user);
    queryClient.clear();
    return { pending: false, statusMessage: session.statusMessage, user: session.user, accessToken: session.accessToken };
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await apiSend('post', '/auth/logout');
    } catch {
      // A local sign-out still succeeds when the refresh cookie is already gone.
    }
    clearSession();
  }, [clearSession]);

  const updateUser = useCallback(
    (patch: Partial<User>) => setUser((current) => (current ? { ...current, ...patch } : current)),
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      role: user?.role,
      isPending: user?.status === 'PENDING',
      mustChangePassword: user?.mustChangePassword ?? false,
      login,
      register,
      registerAgency,
      logout,
      refreshUser,
      updateUser,
    }),
    [user, isLoading, login, register, registerAgency, logout, refreshUser, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

export const landingFor = (role: Role | undefined) => roleHome[role ?? 'customer'];
