import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import { orderBy, paginate } from '../utils/pagination';
import type { ListQuery } from '../types';
import { lowStockProductIds } from './product.service';

export interface InventoryFilters extends ListQuery {
  category?: string;
  lowStock?: boolean;
}

export interface MovementFilters extends ListQuery {
  productId?: string;
  movementType?: 'IN' | 'OUT';
  from?: Date;
  to?: Date;
}

const INVENTORY_SORTABLE = ['updatedAt', 'quantity'] as const;
const INVENTORY_DEFAULT_SORT = 'updatedAt';
const MOVEMENT_SORTABLE = ['createdAt'] as const;

const inventorySelect = {
  id: true,
  productId: true,
  quantity: true,
  updatedAt: true,
  product: {
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      unitPrice: true,
      minimumStock: true,
      warehouseLocation: true,
      isActive: true,
    },
  },
} satisfies Prisma.InventorySelect;

const movementSelect = {
  id: true,
  productId: true,
  quantity: true,
  movementType: true,
  reason: true,
  createdById: true,
  createdAt: true,
  product: { select: { id: true, sku: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.InventoryMovementSelect;

export type StockStatus = 'OK' | 'LOW' | 'OUT';

export async function listInventory(filters: InventoryFilters) {
  const where: Prisma.InventoryWhereInput = {};
  const productWhere: Prisma.ProductWhereInput = {};
  if (filters.search) {
    productWhere.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { sku: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.category) productWhere.category = { equals: filters.category, mode: 'insensitive' };
  if (Object.keys(productWhere).length > 0) where.product = productWhere;
  if (filters.lowStock) where.productId = { in: await lowStockProductIds() };

  const [total, rows] = await Promise.all([
    prisma.inventory.count({ where }),
    prisma.inventory.findMany({
      where,
      select: inventorySelect,
      orderBy: orderBy(filters, INVENTORY_SORTABLE, INVENTORY_DEFAULT_SORT) as Prisma.InventoryOrderByWithRelationInput,
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  const items = rows.map((row) => ({
    ...row,
    stockStatus: (row.quantity <= 0 ? 'OUT' : row.quantity <= row.product.minimumStock ? 'LOW' : 'OK') as StockStatus,
  }));
  return paginate(items, total, filters);
}

export async function getInventoryByProduct(productId: string) {
  const inventory = await prisma.inventory.findUnique({ where: { productId }, select: inventorySelect });
  if (!inventory) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'No inventory record for this product');
  return inventory;
}

export interface AdjustStockInput {
  movementType: 'IN' | 'OUT';
  quantity: number;
  reason: string;
}

/**
 * Stock adjustment — atomic IN/OUT movement.
 * The inventory row is locked FOR UPDATE so two concurrent adjustments can
 * never oversell. Every change writes an audit movement.
 */
export async function adjustStock(productId: string, data: AdjustStockInput, userId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, sku: true } });
  if (!product) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Product not found');

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; quantity: number }>>(
      Prisma.sql`SELECT id, quantity FROM "inventory" WHERE "productId" = ${productId} FOR UPDATE`,
    );
    const current = locked[0]?.quantity ?? 0;

    if (data.movementType === 'OUT' && data.quantity > current) {
      throw new ApiError(409, ErrorCodes.INSUFFICIENT_STOCK, `Only ${current} units of ${product.sku} available`, {
        productId,
        sku: product.sku,
        available: current,
        requested: data.quantity,
      });
    }

    const nextQuantity = data.movementType === 'IN' ? current + data.quantity : current - data.quantity;

    const inventory = await tx.inventory.upsert({
      where: { productId },
      create: { productId, quantity: nextQuantity },
      update: { quantity: nextQuantity },
      select: inventorySelect,
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        productId,
        quantity: data.quantity,
        movementType: data.movementType,
        reason: data.reason,
        createdById: userId,
      },
      select: movementSelect,
    });

    return { inventory, movement };
  });
}

export async function listMovements(filters: MovementFilters) {
  const where: Prisma.InventoryMovementWhereInput = {};
  if (filters.productId) where.productId = filters.productId;
  if (filters.movementType) where.movementType = filters.movementType;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const [total, items] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      select: movementSelect,
      orderBy: orderBy(filters, MOVEMENT_SORTABLE) as Prisma.InventoryMovementOrderByWithRelationInput,
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);
  return paginate(items, total, filters);
}