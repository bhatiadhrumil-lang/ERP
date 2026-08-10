import { api } from './api';
import type { DashboardSummary, LowStockItem, Paginated, RecentActivityItem, User } from '../types';

export async function getSummary(): Promise<DashboardSummary> {
  const { data } = await api.get<{ success: true; data: DashboardSummary }>('/dashboard/summary');
  return data.data;
}

export async function getLowStock(): Promise<LowStockItem[]> {
  const { data } = await api.get<{ success: true; data: LowStockItem[] }>('/dashboard/low-stock');
  return data.data;
}

export async function getRecentChallans(): Promise<Paginated<unknown>> {
  const { data } = await api.get<{ success: true; data: Paginated<unknown> }>('/dashboard/recent-challans');
  return data.data;
}

export async function getRecentActivity(): Promise<RecentActivityItem[]> {
  const { data } = await api.get<{ success: true; data: RecentActivityItem[] }>('/dashboard/recent-activity');
  return data.data;
}

export async function listUsers(): Promise<Paginated<User>> {
  const { data } = await api.get<{ success: true; data: Paginated<User> }>('/users', { params: { limit: 100 } });
  return data.data;
}

export async function updateUser(id: string, input: { role?: string; isActive?: boolean; name?: string }): Promise<User> {
  const { data } = await api.patch<{ success: true; data: User }>(`/users/${id}`, input);
  return data.data;
}