import { api } from './api';
import type { InventoryRow, Movement, MovementType, Paginated } from '../types';

export interface InventoryFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  lowStock?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface MovementFilters {
  page?: number;
  limit?: number;
  productId?: string;
  movementType?: MovementType | '';
  from?: string;
  to?: string;
}

export async function listInventory(filters: InventoryFilters): Promise<Paginated<InventoryRow>> {
  const { data } = await api.get<{ success: true; data: Paginated<InventoryRow> }>('/inventory', { params: filters });
  return data.data;
}

export async function getInventory(productId: string): Promise<InventoryRow> {
  const { data } = await api.get<{ success: true; data: InventoryRow }>(`/inventory/${productId}`);
  return data.data;
}

export interface AdjustStockInput {
  movementType: MovementType;
  quantity: number;
  reason: string;
}

export async function adjustStock(productId: string, input: AdjustStockInput): Promise<{ inventory: InventoryRow; movement: Movement }> {
  const { data } = await api.post<{ success: true; data: { inventory: InventoryRow; movement: Movement } }>(
    `/inventory/${productId}/adjust`,
    input,
  );
  return data.data;
}

export async function listMovements(filters: MovementFilters): Promise<Paginated<Movement>> {
  const { data } = await api.get<{ success: true; data: Paginated<Movement> }>('/inventory/movements', { params: filters });
  return data.data;
}