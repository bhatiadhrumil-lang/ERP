import { api } from './api';
import type { Paginated, Product } from '../types';

export interface ProductFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  isActive?: boolean;
  lowStock?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ProductInput {
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
  minimumStock: number;
  warehouseLocation: string;
  isActive?: boolean;
  initialQuantity?: number;
}

export async function listProducts(filters: ProductFilters): Promise<Paginated<Product>> {
  const { data } = await api.get<{ success: true; data: Paginated<Product> }>('/products', { params: filters });
  return data.data;
}

export async function getProduct(id: string): Promise<Product> {
  const { data } = await api.get<{ success: true; data: Product }>(`/products/${id}`);
  return data.data;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { data } = await api.post<{ success: true; data: Product }>('/products', input);
  return data.data;
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  const { data } = await api.patch<{ success: true; data: Product }>(`/products/${id}`, input);
  return data.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`/products/${id}`);
}