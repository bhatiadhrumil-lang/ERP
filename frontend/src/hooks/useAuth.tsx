import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, hasDevToken } from '../services/authService';
import type { AppUser } from '../services/authService';
import { fetchMe } from '../services/auth';
import { bootstrapAdmin } from '../services/bootstrap';
import { apiErrorMessage, setUnauthorizedHandler } from '../services/api';

/** Result of a login attempt. nextStep signals the NEW_PASSWORD_REQUIRED challenge. */
export interface LoginResult {
  ok: boolean;
  nextStep?: 'NEW_PASSWORD_REQUIRED';
}

export interface AuthContextValue {
  /** Application user (role from PostgreSQL) — null until resolved. */
  user: AppUser | null;
  /** True while the initial session is being resolved (prevents UI flashing). */
  isLoading: boolean;
  /** Backwards-compatible alias for isLoading. */
  loading: boolean;
  isAuthenticated: boolean;
  /** Set when a Cognito session exists but the ERP user cannot be resolved. */
  authError: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  /** Dev-mode sign-in (demo without AWS): email + temp password → local JWT. */
  devLogin: (email: string, password: string) => Promise<LoginResult>;
  /** Completes the NEW_PASSWORD_REQUIRED challenge, then resolves the session. */
  completeNewPassword: (newPassword: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();

  // In react-router v6 `useNavigate()` returns a NEW function whenever the
  // location changes, so it must never appear in a useEffect dependency list —
  // the bootstrap effect would re-run on every navigation and re-resolve the
  // session. Keep it in a ref instead.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const bootingRef = useRef(true);

  /**
   * Resolve the application user:
   *  1. Check the Cognito session (Amplify, no localStorage of our own).
   *  2. Ask the backend for the ERP user (GET /api/auth/me).
   * The backend is the authority for role + isActive; Cognito only proves identity.
   */
  const resolveSession = useCallback(async (): Promise<boolean> => {
    try {
      const me = await fetchMe();
      setUser(me);
      setAuthError(null);
      return true;
    } catch (err) {
      setUser(null);
      setAuthError(apiErrorMessage(err));
      return false;
    }
  }, []);

  useEffect(() => {
    bootingRef.current = true;
    let cancelled = false;

    async function bootstrap() {
      try {
        await authService.getCurrentUser();
      } catch {
        // No Cognito session. A stored dev-mode token (demo without AWS) is a
        // valid session too — resolve it the same way; otherwise signed out.
        if (hasDevToken()) {
          await resolveSession();
          if (!cancelled) setLoading(false);
          return;
        }
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }
      await resolveSession();
      if (!cancelled) setLoading(false);
    }

    void bootstrap().finally(() => {
      bootingRef.current = false;
    });

    // Session-expiry callback from the API client: sign out and return to login.
    const handler = () => {
      if (bootingRef.current) return; // bootstrap handles its own 401 (unprovisioned)
      void authService.signOut().finally(() => {
        setUser(null);
        setAuthError(null);
        navigateRef.current('/login', { replace: true });
      });
    };
    setUnauthorizedHandler(handler);

    return () => {
      cancelled = true;
      bootingRef.current = false;
      setUnauthorizedHandler(null);
    };
  }, [resolveSession]);

  /**
   * Cognito sign-in, then load the ERP user and go to the dashboard.
   *
   * Two special cases:
   *  - NEW_PASSWORD_REQUIRED: invited employee's first login — the caller shows
   *    the "Set your new password" form and then calls completeNewPassword.
   *  - Not provisioned yet: the confirmed identity has no `users` row and no
   *    ADMIN exists — this is the first-admin bootstrap moment. We call
   *    POST /api/auth/bootstrap-admin (backend-enforced, race-safe); a 409
   *    just means someone else already initialized the app.
   */
  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const step = await authService.signIn(email, password); // throws mapped user-friendly errors
      if (step.status === 'NEW_PASSWORD_REQUIRED') {
        return { ok: false, nextStep: 'NEW_PASSWORD_REQUIRED' };
      }

      let ok = await resolveSession();
      if (!ok) {
        try {
          await bootstrapAdmin();
          ok = await resolveSession();
        } catch {
          // Bootstrap refused (already initialized, or identity provisioned) —
          // authError from resolveSession is the authoritative message.
        }
      }

      if (ok) {
        navigateRef.current('/dashboard', { replace: true });
        return { ok: true };
      }
      navigateRef.current('/login', { replace: true });
      return { ok: false };
    },
    [resolveSession],
  );

  /**
   * Dev-mode sign-in: POST /api/auth/dev-login (email + temp password) then
   * resolve the ERP user. Only wired to the UI in dev builds; the backend
   * rejects dev tokens in production.
   */
  const devLogin = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const me = await authService.devLogin(email, password);
      setUser(me);
      setAuthError(null);
      navigateRef.current('/dashboard', { replace: true });
      return { ok: true };
    },
    [],
  );

  /**
   * Complete the NEW_PASSWORD_REQUIRED challenge (invited employee first
   * login). The password goes straight from the form to Cognito via Amplify.
   */
  const completeNewPassword = useCallback(
    async (newPassword: string): Promise<boolean> => {
      await authService.completeNewPassword(newPassword);
      const ok = await resolveSession();
      if (ok) navigateRef.current('/dashboard', { replace: true });
      return ok;
    },
    [resolveSession],
  );

  const logout = useCallback(async () => {
    await authService.signOut();
    setUser(null);
    setAuthError(null);
    navigateRef.current('/login', { replace: true });
  }, []);

  const refreshSession = useCallback(async () => {
    bootingRef.current = true;
    const ok = await resolveSession();
    bootingRef.current = false;
    return ok;
  }, [resolveSession]);

  const value = useMemo(
    () => ({
      user,
      isLoading: loading,
      loading,
      isAuthenticated: user !== null,
      authError,
      login,
      devLogin,
      completeNewPassword,
      logout,
      refreshSession,
    }),
    [user, loading, authError, login, devLogin, completeNewPassword, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { apiErrorMessage };
