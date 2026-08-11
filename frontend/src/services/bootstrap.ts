import { api } from './apiClient';
import { authService } from './authService';
import type { AppUser } from './authService';

export interface BootstrapStatus {
  initialized: boolean;
}

/** GET /api/auth/bootstrap-status — public; whether the first ADMIN exists. */
export async function getBootstrapStatus(): Promise<BootstrapStatus> {
  const { data } = await api.get<{ success: true; data: BootstrapStatus }>('/auth/bootstrap-status');
  return data.data;
}

/**
 * POST /api/auth/bootstrap-admin — promotes the current verified Cognito
 * identity to the first ADMIN. Only succeeds when no ADMIN exists yet
 * (backend-enforced with an advisory lock); otherwise 409
 * ADMIN_ALREADY_INITIALIZED.
 */
export async function bootstrapAdmin(): Promise<AppUser> {
  // Send the ID token too: on pools with UUID usernames (email as alias) the
  // access token carries no email, but the ID token does.
  const idToken = await authService.getIdToken();
  const { data } = await api.post<{ success: true; data: { user: AppUser } }>(
    '/auth/bootstrap-admin',
    idToken ? { idToken } : {},
  );
  return data.data.user;
}
