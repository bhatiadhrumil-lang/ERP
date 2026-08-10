import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import { orderBy, paginate } from '../utils/pagination';
import type { ListQuery } from '../types';

export interface ProductFilters extends ListQuery {
  category?: string;
  isActive?: boolean;
  lowStock?: boolean;
}

const PRODUCT_SORTABLE = ['createdAt', 'updatedAt', 'name', 'sku', 'category', 'unitPrice'] as const;

const productSelect = {
  id: true,
  sku: true,
  name: true,
  category: true,
  unitPrice: true,
  minimumStock: true,
  warehouseLocation: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  inventory: { select: { quantity: true, updatedAt: true } },
} satisfies Prisma.ProductSelect;

/** Ids of products whose current stock is at or below their minimum. */
export async function lowStockProductIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT p.id
      FROM "products" p
      JOIN "inventory" i ON i."productId" = p.id
      WHERE p."isActive" = true AND i.quantity <= p."minimumStock"`,
  );
  return rows.map((r) => r.id);
}

export async function listProducts(filters: ProductFilters) {
  const where: Prisma.ProductWhereInput = {};
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { sku: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.category) where.category = { equals: filters.category, mode: 'insensitive' };
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.lowStock) where.id = { in: await lowStockProductIds() };

  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: productSelect,
      orderBy: orderBy(filters, PRODUCT_SORTABLE) as Prisma.ProductOrderByWithRelationInput,
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);
  return paginate(items, total, filters);
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, select: productSelect });
  if (!product) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Product not found');
  return product;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
  minimumStock: number;
  warehouseLocation: string;
  isActive?: boolean;
  /** Optional starting stock; when > 0 an initial IN movement is recorded. */
  initialQuantity?: number;
}

export async function createProduct(data: CreateProductInput) {
  const { initialQuantity = 0, ...rest } = data;
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: { ...rest, inventory: { create: { quantity: initialQuantity } } },
      select: productSelect,
    });
    if (initialQuantity > 0) {
      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          quantity: initialQuantity,
          movementType: 'IN',
          reason: 'Initial stock on product creation',
        },
      });
    }
    return product;
  });
}

export type UpdateProductInput = Omit<Prisma.ProductUncheckedUpdateInput, 'inventory' | 'movements' | 'challanItems'>;

export async function updateProduct(id: string, data: UpdateProductInput) {
  const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Product not found');
  return prisma.product.update({ where: { id }, data, select: productSelect });
}

export async function deleteProduct(id: string): Promise<void> {
  const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Product not found');
  try {
    await prisma.product.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new ApiError(
        409,
        ErrorCodes.CONFLICT,
        'Product has inventory movements or challan history and cannot be deleted; deactivate it instead',
      );
    }
    throw err;
  }
}