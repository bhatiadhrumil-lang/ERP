import { api } from './api';
import type { AppUser } from './authService';

/** GET /api/auth/me — the application user (role from PostgreSQL, not Cognito). */
export async function fetchMe(): Promise<AppUser> {
  const { data } = await api.get<{ success: true; data: { user: AppUser } }>('/auth/me');
  return data.data.user;
}