import { api } from './api';
import type { Customer, CustomerStatus, CustomerType, Paginated } from '../types';

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  customerType?: CustomerType | '';
  status?: CustomerStatus | '';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export async function listCustomers(filters: CustomerFilters): Promise<Paginated<Customer>> {
  const { data } = await api.get<{ success: true; data: Paginated<Customer> }>('/customers', { params: clean(filters) });
  return data.data;
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data } = await api.get<{ success: true; data: Customer }>(`/customers/${id}`);
  return data.data;
}

export interface CustomerInput {
  name: string;
  mobile: string;
  email?: string;
  businessName: string;
  gstNumber?: string;
  customerType: CustomerType;
  status?: CustomerStatus;
  address?: string;
  nextFollowUpDate?: string;
  notes?: string;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const { data } = await api.post<{ success: true; data: Customer }>('/customers', input);
  return data.data;
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer> {
  const { data } = await api.patch<{ success: true; data: Customer }>(`/customers/${id}`, input);
  return data.data;
}

export async function deleteCustomer(id: string): Promise<void> {
  await api.delete(`/customers/${id}`);
}

function clean(filters: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''));
}