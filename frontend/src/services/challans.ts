import { api } from './api';
import type { Challan, ChallanStatus, Paginated } from '../types';

export interface ChallanFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  status?: ChallanStatus | '';
  search?: string;
  from?: string;
  to?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ChallanItemInput {
  productId: string;
  quantity: number;
}

export interface ChallanInput {
  customerId: string;
  items: ChallanItemInput[];
}

export async function listChallans(filters: ChallanFilters): Promise<Paginated<Challan>> {
  const { data } = await api.get<{ success: true; data: Paginated<Challan> }>('/challans', { params: filters });
  return data.data;
}

export async function getChallan(id: string): Promise<Challan> {
  const { data } = await api.get<{ success: true; data: Challan }>(`/challans/${id}`);
  return data.data;
}

export async function createChallan(input: ChallanInput): Promise<Challan> {
  const { data } = await api.post<{ success: true; data: Challan }>('/challans', input);
  return data.data;
}

export async function updateChallan(id: string, input: Partial<ChallanInput>): Promise<Challan> {
  const { data } = await api.patch<{ success: true; data: Challan }>(`/challans/${id}`, input);
  return data.data;
}

export async function confirmChallan(id: string): Promise<Challan> {
  const { data } = await api.post<{ success: true; data: Challan }>(`/challans/${id}/confirm`);
  return data.data;
}

export async function cancelChallan(id: string): Promise<Challan> {
  const { data } = await api.post<{ success: true; data: Challan }>(`/challans/${id}/cancel`);
  return data.data;
}