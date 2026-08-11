import { api } from './apiClient';
import type { Paginated, User, UserRole, UserStatus } from '../types';

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  status?: UserStatus;
}

/** GET /api/users — paginated user list with search/role/status filters (ADMIN only). */
export async function listUsers(params: UserListParams = {}): Promise<Paginated<User>> {
  const { data } = await api.get<{ success: true; data: Paginated<User> }>('/users', { params });
  return data.data;
}

/** POST /api/users/invite — ADMIN invites an employee. Cognito emails the invitation; in dev mode the response carries the temp password instead. */
export async function inviteUser(input: {
  name: string;
  email: string;
  role: 'SALES' | 'WAREHOUSE' | 'ACCOUNTS';
}): Promise<{ user: User; tempPassword?: string }> {
  const { data } = await api.post<{ success: true; data: { user: User; tempPassword?: string } }>(
    '/users/invite',
    input,
  );
  return data.data;
}

/** PATCH /api/users/:id/role — controlled role change (ADMIN only). */
export async function changeUserRole(id: string, role: UserRole): Promise<User> {
  const { data } = await api.patch<{ success: true; data: { user: User } }>(`/users/${id}/role`, { role });
  return data.data.user;
}

/** POST /api/users/:id/disable — lock the user out (ADMIN only). */
export async function disableUser(id: string): Promise<User> {
  const { data } = await api.post<{ success: true; data: { user: User } }>(`/users/${id}/disable`);
  return data.data.user;
}

/** POST /api/users/:id/enable — restore access (ADMIN only). */
export async function enableUser(id: string): Promise<User> {
  const { data } = await api.post<{ success: true; data: { user: User } }>(`/users/${id}/enable`);
  return data.data.user;
}

/** POST /api/users/:id/resend-invitation — re-sends the Cognito invite email (ADMIN only). */
export async function resendInvitation(id: string): Promise<User> {
  const { data } = await api.post<{ success: true; data: { user: User } }>(`/users/${id}/resend-invitation`);
  return data.data.user;
}
