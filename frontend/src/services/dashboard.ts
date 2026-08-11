import { api } from './api';
import type { DashboardSummary, LowStockItem, Paginated, RecentActivityItem } from '../types';

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