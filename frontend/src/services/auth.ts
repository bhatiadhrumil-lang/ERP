import { api } from './api';
import type { AuthSession, User } from '../types';

export async function devLogin(email: string): Promise<AuthSession> {
  const { data } = await api.post<{ success: true; data: AuthSession }>('/auth/dev-login', { email });
  return data.data;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<{ success: true; data: User }>('/auth/me');
  return data.data;
}