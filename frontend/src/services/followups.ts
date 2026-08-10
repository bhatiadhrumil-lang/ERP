import { api } from './api';
import type { FollowUp, FollowUpStatus, Paginated } from '../types';

export interface FollowUpFilters {
  page?: number;
  limit?: number;
  status?: FollowUpStatus | '';
  assignedToId?: string;
  from?: string;
  to?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FollowUpInput {
  followUpDate: string;
  notes: string;
  assignedToId?: string | null;
  status?: FollowUpStatus;
}

export async function listFollowUps(filters: FollowUpFilters): Promise<Paginated<FollowUp>> {
  const { data } = await api.get<{ success: true; data: Paginated<FollowUp> }>('/followups', { params: filters });
  return data.data;
}

export async function listCustomerFollowUps(customerId: string, page = 1, limit = 20): Promise<Paginated<FollowUp>> {
  const { data } = await api.get<{ success: true; data: Paginated<FollowUp> }>(`/customers/${customerId}/followups`, {
    params: { page, limit },
  });
  return data.data;
}

export async function createFollowUp(customerId: string, input: FollowUpInput): Promise<FollowUp> {
  const { data } = await api.post<{ success: true; data: FollowUp }>(`/customers/${customerId}/followups`, input);
  return data.data;
}

export async function updateFollowUp(id: string, input: Partial<FollowUpInput>): Promise<FollowUp> {
  const { data } = await api.patch<{ success: true; data: FollowUp }>(`/followups/${id}`, input);
  return data.data;
}