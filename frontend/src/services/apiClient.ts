import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { authService } from './authService';

/**
 * Authenticated Axios client.
 *
 * Every request pulls the current Cognito access token from the Amplify
 * session (fetchAuthSession) and sends it as `Authorization: Bearer <token>`.
 * Tokens are never stored in localStorage by our code — Amplify manages the
 * session, and the backend is the authority for authorization.
 */
const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await authService.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

/** Extracts a human-readable message from any API failure. */
export function apiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body?.error?.message) return body.error.message;
    if (err.code === 'ERR_NETWORK') return 'Cannot reach the server. Is the backend running?';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Unexpected error';
}

/** Invoked when the session is genuinely invalid/expired (after one retry). */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/**
 * On 401: refresh/recheck the session once and retry exactly once (guards
 * against infinite retry loops). If still unauthorized, notify the app so it
 * can redirect to login.
 */
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;

    if (status === 401 && original && !original._retried) {
      original._retried = true;
      // fetchAuthSession transparently refreshes the tokens when possible.
      const token = await authService.getAccessToken();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        try {
          return await api(original);
        } catch (retryErr) {
          if (axios.isAxiosError(retryErr) && retryErr.response?.status === 401) {
            onUnauthorized?.();
          }
          return Promise.reject(retryErr);
        }
      }
    }

    if (status === 401) onUnauthorized?.();
    return Promise.reject(error);
  },
);

export { AxiosError };