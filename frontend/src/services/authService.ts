import {
  confirmResetPassword,
  confirmSignIn,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resetPassword,
  resendSignUpCode,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth';
import { isCognitoConfigured } from '../config/amplify';
import { api } from './apiClient';

/**
 * Clean wrappers around the AWS Amplify Cognito API.
 *
 * All Cognito-specific implementation lives in this module — the rest of the
 * app calls authService.* and never touches aws-amplify directly.
 *
 * Cognito owns credentials and the session (tokens live in Amplify's
 * in-memory/local-storage session, never in our code): we never store
 * passwords or JWTs ourselves.
 */

export interface SignUpInput {
  /** Optional display name; defaults to the local part of the email. */
  name?: string;
  email: string;
  password: string;
}

/** Application user as returned by GET /api/auth/me. */
export interface AppUser {
  id: string;
  cognitoSub: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'SALES' | 'WAREHOUSE' | 'ACCOUNTS';
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Dev-mode session (no AWS): the backend signs a local JWT via
 * POST /api/auth/dev-login. Stored in localStorage ONLY in dev builds; the
 * api client falls back to it when Amplify has no Cognito session.
 */
const DEV_TOKEN_KEY = 'mini-erp-dev-token';

function getStoredDevToken(): string | null {
  try {
    return localStorage.getItem(DEV_TOKEN_KEY);
  } catch {
    return null;
  }
}

function clearStoredDevToken(): void {
  try {
    localStorage.removeItem(DEV_TOKEN_KEY);
  } catch {
    // ignore storage failures (private mode etc.)
  }
}

/** True when a dev-mode session token is present (survives page reloads). */
export function hasDevToken(): boolean {
  return getStoredDevToken() !== null;
}

/** Discriminated result of a Cognito sign-in attempt. */
export type SignInResult =
  | { status: 'DONE' }
  | { status: 'NEW_PASSWORD_REQUIRED' };

/** User-friendly message for the Cognito/Amplify error names we care about. */
export function authErrorMessage(err: unknown): string {
  const name = typeof err === 'object' && err !== null && 'name' in err ? String((err as { name: unknown }).name) : '';
  switch (name) {
    case 'UserNotFoundException':
      return 'No account found for that email.';
    case 'NotAuthorizedException':
      return 'Incorrect email or password.';
    case 'UserNotConfirmedException':
      return 'Your email is not verified yet. Check your inbox for the verification code.';
    case 'UsernameExistsException':
      return 'An account with that email already exists.';
    case 'InvalidPasswordException':
      return 'Password does not meet the requirements (min 8 chars, letters, numbers, symbol).';
    case 'CodeMismatchException':
      return 'The verification code is incorrect.';
    case 'ExpiredCodeException':
      return 'The verification code has expired. Request a new one.';
    case 'CodeDeliveryFailureException':
      return 'Unable to send the code. Check the email address and try again.';
    case 'InvalidParameterException':
      return 'Invalid input. Check the code and email address, then try again.';
    case 'LimitExceededException':
      return 'Too many attempts. Please try again later.';
    default:
      return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  }
}

export const authService = {
  /** Verify that AnonymousCredentials were not misconfigured; warns only. */
  async ensureConfigured(): Promise<void> {
    if (!isCognitoConfigured) {
      throw new Error('Cognito is not configured (missing VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_CLIENT_ID).');
    }
  },

  /** Sign up a new user in Cognito. Throws mapped user-friendly errors. */
  async signUp({ name, email, password }: SignUpInput): Promise<void> {
    await this.ensureConfigured();
    try {
      const displayName = name?.trim() || email.split('@')[0] || email;
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            name: displayName,
          },
          autoSignIn: { enabled: false },
        },
      });
    } catch (err) {
      throw new Error(authErrorMessage(err));
    }
  },

  /**
   * Start the password reset flow: Cognito emails a confirmation code to the
   * account's verified email address.
   */
  async resetPassword(email: string): Promise<void> {
    await this.ensureConfigured();
    try {
      await resetPassword({ username: email });
    } catch (err) {
      throw new Error(authErrorMessage(err));
    }
  },

  /** Complete the password reset with the emailed code and a new password. */
  async confirmResetPassword(email: string, code: string, newPassword: string): Promise<void> {
    await this.ensureConfigured();
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
    } catch (err) {
      throw new Error(authErrorMessage(err));
    }
  },

  /** Confirm a pending sign-up with the emailed verification code. */
  async confirmSignUp(email: string, code: string): Promise<void> {
    await this.ensureConfigured();
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
    } catch (err) {
      throw new Error(authErrorMessage(err));
    }
  },

  /** Re-send the verification code for a pending sign-up. */
  async resendSignUpCode(email: string): Promise<void> {
    await this.ensureConfigured();
    try {
      await resendSignUpCode({ username: email });
    } catch (err) {
      throw new Error(authErrorMessage(err));
    }
  },

  /**
   * Sign in with email + password via Cognito. Session managed by Amplify.
   *
   * Admin-created employees (invitations) must set a password on first login —
   * Cognito then returns the NEW_PASSWORD_REQUIRED challenge. The caller shows
   * the "Set your new password" form and completes it via completeNewPassword.
   */
  async signIn(email: string, password: string): Promise<SignInResult> {
    await this.ensureConfigured();
    try {
      const result = await signIn({ username: email, password });
      const step = String(result.nextStep?.signInStep ?? 'DONE');
      if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD') {
        return { status: 'NEW_PASSWORD_REQUIRED' };
      }
      if (step !== 'DONE') {
        if (step === 'CONFIRM_SIGN_UP_WITH_CODE') {
          throw new Error('Your email is not verified yet. Check your inbox for the verification code.');
        }
        throw new Error('Additional verification is required for this account.');
      }
      return { status: 'DONE' };
    } catch (err) {
      throw new Error(authErrorMessage(err));
    }
  },

  /**
   * Complete the NEW_PASSWORD_REQUIRED challenge (first login of an invited
   * employee). The password is sent straight to Cognito by Amplify — it never
   * touches our backend or any of our code paths.
   */
  async completeNewPassword(newPassword: string): Promise<void> {
    await this.ensureConfigured();
    try {
      await confirmSignIn({ challengeResponse: newPassword });
    } catch (err) {
      throw new Error(authErrorMessage(err));
    }
  },

  /** Sign out of Cognito (local session) and any dev-mode session. */
  async signOut(): Promise<void> {
    try {
      await signOut();
    } catch {
      // Amplify throws when already signed out — ignore and clear locally anyway.
    }
    clearStoredDevToken();
  },

  /**
   * Dev-mode sign-in (demo without AWS): exchanges email + temp password for a
   * locally-signed JWT from the backend. The token is stored locally and used
   * by the api client until sign-out. Never available in production builds.
   */
  async devLogin(email: string, password: string): Promise<AppUser> {
    const { data } = await api.post<{
      success: true;
      data: { token: string; user: AppUser };
    }>('/auth/dev-login', { email, password });
    try {
      localStorage.setItem(DEV_TOKEN_KEY, data.data.token);
    } catch {
      // ignore storage failures — the session just won't survive a reload
    }
    return data.data.user;
  },

  /** Current Cognito user; rejects when there is no session. */
  async getCurrentUser(): Promise<{ userId: string; username: string }> {
    try {
      const user = await getCurrentUser();
      return { userId: user.userId, username: user.username };
    } catch {
      throw new Error('NO_SESSION');
    }
  },

  /** Current Cognito access token (JWT) via fetchAuthSession — never cached by us. */
  async getAccessToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession();
      const cognito = session.tokens?.accessToken?.toString() ?? null;
      if (cognito) return cognito;
    } catch {
      // no Cognito session — fall through to the dev token
    }
    // Dev-mode fallback (demo without AWS): the locally-signed JWT.
    return getStoredDevToken();
  },

  /**
   * Current Cognito ID token (JWT). ID tokens carry the user attributes
   * (email, name) that access tokens omit — needed by the bootstrap flow on
   * pools where Cognito generates UUID usernames. Null when signed out.
   */
  async getIdToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() ?? null;
    } catch {
      return null;
    }
  },
};