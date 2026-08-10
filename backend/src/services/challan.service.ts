import { Prisma } from '@prisma/client';
import type { ChallanStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import { generateChallanNumber } from '../utils/codes';
import { orderBy, paginate } from '../utils/pagination';
import type { ListQuery } from '../types';

export interface ChallanItemInput {
  productId: string;
  quantity: number;
}

export interface CreateChallanInput {
  customerId: string;
  items: ChallanItemInput[];
}

export interface ChallanFilters extends ListQuery {
  customerId?: string;
  status?: ChallanStatus;
  from?: Date;
  to?: Date;
}

const CHALLAN_SORTABLE = ['createdAt', 'updatedAt', 'challanNumber', 'totalQuantity', 'status'] as const;

const challanDetailSelect = {
  id: true,
  challanNumber: true,
  customerId: true,
  totalQuantity: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: { id: true, name: true, customerCode: true, businessName: true, mobile: true, address: true },
  },
  createdBy: { select: { id: true, name: true } },
  items: {
    select: {
      id: true,
      productId: true,
      productNameSnapshot: true,
      skuSnapshot: true,
      unitPriceSnapshot: true,
      quantity: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.SalesChallanSelect;

const challanListSelect = {
  id: true,
  challanNumber: true,
  customerId: true,
  totalQuantity: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true, customerCode: true, businessName: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.SalesChallanSelect;

/** Sum quantities for duplicate product lines so one product appears once. */
function mergeItemQuantities(items: ChallanItemInput[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  }
  return merged;
}

interface ResolvedItem {
  productId: string;
  quantity: number;
  name: string;
  sku: string;
  unitPrice: Prisma.Decimal;
}

type PrismaLike = Pick<Prisma.TransactionClient, 'product' | 'inventory'>;

/** Loads products, validates existence + active status, returns snapshot data. */
async function resolveItems(
  items: ChallanItemInput[],
  client: PrismaLike,
): Promise<ResolvedItem[]> {
  const merged = mergeItemQuantities(items);
  const products = await client.product.findMany({
    where: { id: { in: [...merged.keys()] } },
    select: { id: true, sku: true, name: true, unitPrice: true, isActive: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const resolved: ResolvedItem[] = [];
  for (const [productId, quantity] of merged) {
    const product = byId.get(productId);
    if (!product) {
      throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, `Unknown product: ${productId}`, { productId });
    }
    if (!product.isActive) {
      throw new ApiError(409, ErrorCodes.CONFLICT, `Product ${product.sku} is inactive and cannot be sold`, {
        sku: product.sku,
      });
    }
    resolved.push({
      productId,
      quantity,
      name: product.name,
      sku: product.sku,
      unitPrice: product.unitPrice,
    });
  }
  return resolved;
}

/** Verifies current stock covers every line (used for draft creation validation). */
async function assertSufficientStock(
  client: PrismaLike,
  resolved: ResolvedItem[],
): Promise<void> {
  const rows = await client.inventory.findMany({
    where: { productId: { in: resolved.map((r) => r.productId) } },
    select: { productId: true, quantity: true },
  });
  const stock = new Map(rows.map((r) => [r.productId, r.quantity]));
  const shortages = resolved
    .filter((r) => (stock.get(r.productId) ?? 0) < r.quantity)
    .map((r) => ({
      sku: r.sku,
      name: r.name,
      requested: r.quantity,
      available: stock.get(r.productId) ?? 0,
    }));
  if (shortages.length > 0) {
    throw new ApiError(409, ErrorCodes.INSUFFICIENT_STOCK, 'Insufficient stock for one or more items', {
      items: shortages,
    });
  }
}

export async function listChallans(filters: ChallanFilters) {
  const where: Prisma.SalesChallanWhereInput = {};
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.status) where.status = filters.status;
  if (filters.search) where.challanNumber = { contains: filters.search.toUpperCase() };
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const [total, items] = await Promise.all([
    prisma.salesChallan.count({ where }),
    prisma.salesChallan.findMany({
      where,
      select: challanListSelect,
      orderBy: orderBy(filters, CHALLAN_SORTABLE) as Prisma.SalesChallanOrderByWithRelationInput,
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);
  return paginate(items, total, filters);
}

export async function getChallanById(id: string) {
  const challan = await prisma.salesChallan.findUnique({ where: { id }, select: challanDetailSelect });
  if (!challan) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Challan not found');
  return challan;
}

/**
 * Creates a DRAFT challan.
 * Product name/SKU/unit price are snapshotted onto each item so historical
 * challans stay correct even if the product master changes later.
 * Draft creation validates against current stock (UX guard); the authoritative
 * locked stock check happens at confirmation.
 */
export async function createChallan(data: CreateChallanInput, userId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: data.customerId }, select: { id: true } });
  if (!customer) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Customer not found');

  const resolved = await resolveItems(data.items, prisma);
  await assertSufficientStock(prisma, resolved);
  const totalQuantity = resolved.reduce((sum, r) => sum + r.quantity, 0);

  // Regenerate on the (astronomically unlikely) challan number collision.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const challanNumber = generateChallanNumber();
    try {
      return await prisma.$transaction(async (tx) =>
        tx.salesChallan.create({
          data: {
            challanNumber,
            customerId: data.customerId,
            totalQuantity,
            createdById: userId,
            items: {
              create: resolved.map((r) => ({
                productId: r.productId,
                quantity: r.quantity,
                productNameSnapshot: r.name,
                skuSnapshot: r.sku,
                unitPriceSnapshot: r.unitPrice,
              })),
            },
          },
          select: challanDetailSelect,
        }),
      );
    } catch (err) {
      if (
        attempt < 2 &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        String(err.meta?.target).includes('challanNumber')
      ) {
        continue;
      }
      throw err;
    }
  }
  throw new ApiError(500, ErrorCodes.INTERNAL_ERROR, 'Could not allocate a unique challan number');
}

/**
 * Edits a DRAFT challan (customer and/or items — items are replaced entirely,
 * snapshots refreshed). Confirmed/cancelled challans are immutable.
 */
export async function updateChallan(id: string, data: { customerId?: string; items?: ChallanItemInput[] }) {
  const existing = await prisma.salesChallan.findUnique({
    where: { id },
    select: { id: true, status: true, customerId: true },
  });
  if (!existing) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Challan not found');
  if (existing.status !== 'DRAFT') {
    throw new ApiError(409, ErrorCodes.CONFLICT, 'Only DRAFT challans can be edited');
  }

  if (data.customerId && data.customerId !== existing.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId }, select: { id: true } });
    if (!customer) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Customer not found');
  }

  let resolved: ResolvedItem[] | undefined;
  if (data.items) {
    resolved = await resolveItems(data.items, prisma);
    await assertSufficientStock(prisma, resolved);
  }

  return prisma.$transaction(async (tx) => {
    if (resolved) {
      await tx.salesChallanItem.deleteMany({ where: { challanId: id } });
    }
    return tx.salesChallan.update({
      where: { id },
      data: {
        ...(data.customerId ? { customerId: data.customerId } : {}),
        ...(resolved
          ? {
              totalQuantity: resolved.reduce((sum, r) => sum + r.quantity, 0),
              items: {
                create: resolved.map((r) => ({
                  productId: r.productId,
                  quantity: r.quantity,
                  productNameSnapshot: r.name,
                  skuSnapshot: r.sku,
                  unitPriceSnapshot: r.unitPrice,
                })),
              },
            }
          : {}),
      },
      select: challanDetailSelect,
    });
  });
}

/**
 * CRITICAL BUSINESS RULE — atomic challan confirmation.
 *
 * Within a single database transaction:
 *  1. verify the challan exists and is DRAFT
 *  2. lock every involved inventory row FOR UPDATE (sorted order → no deadlocks)
 *  3. verify each item's stock; on ANY shortage the whole transaction rejects
 *  4. decrement inventory, write OUT movements referencing the challan
 *  5. transition DRAFT -> CONFIRMED
 *
 * Inventory can never decrease without a confirmation, a confirmation never
 * happens without inventory reduction, and partial updates are impossible —
 * any failure rolls everything back.
 */
export async function confirmChallan(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const challan = await tx.salesChallan.findUnique({ where: { id }, include: { items: true } });
    if (!challan) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Challan not found');
    if (challan.status === 'CONFIRMED') {
      throw new ApiError(409, ErrorCodes.CONFLICT, 'Challan is already confirmed');
    }
    if (challan.status === 'CANCELLED') {
      throw new ApiError(409, ErrorCodes.CONFLICT, 'A cancelled challan cannot be confirmed');
    }

    const productIds = challan.items.map((i) => i.productId).sort();
    const locked = await tx.$queryRaw<Array<{ productId: string; quantity: number }>>(
      Prisma.sql`SELECT "productId", quantity FROM "inventory"
        WHERE "productId" IN (${Prisma.join(productIds)})
        FOR UPDATE`,
    );
    const stockById = new Map(locked.map((r) => [r.productId, r.quantity]));

    const shortages = challan.items
      .filter((item) => (stockById.get(item.productId) ?? 0) < item.quantity)
      .map((item) => ({
        productId: item.productId,
        requested: item.quantity,
        available: stockById.get(item.productId) ?? 0,
      }));
    if (shortages.length > 0) {
      throw new ApiError(
        409,
        ErrorCodes.INSUFFICIENT_STOCK,
        'Insufficient stock — challan confirmation rejected',
        { items: shortages },
      );
    }

    for (const item of challan.items) {
      await tx.inventory.update({
        where: { productId: item.productId },
        data: { quantity: { decrement: item.quantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          quantity: item.quantity,
          movementType: 'OUT',
          reason: `Sales challan ${challan.challanNumber} confirmation`,
          createdById: userId,
        },
      });
    }

    return tx.salesChallan.update({
      where: { id },
      data: { status: 'CONFIRMED' },
      select: challanDetailSelect,
    });
  });
}

/**
 * Challan cancellation.
 *  - DRAFT     -> CANCELLED: no stock impact.
 *  - CONFIRMED -> CANCELLED: compensating IN movements restore the stock
 *    at the moment of cancellation (inside the same transaction), so the
 *    audit ledger stays complete and no stock is silently modified.
 */
export async function cancelChallan(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const challan = await tx.salesChallan.findUnique({ where: { id }, include: { items: true } });
    if (!challan) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Challan not found');
    if (challan.status === 'CANCELLED') {
      throw new ApiError(409, ErrorCodes.CONFLICT, 'Challan is already cancelled');
    }

    if (challan.status === 'DRAFT') {
      return tx.salesChallan.update({
        where: { id },
        data: { status: 'CANCELLED' },
        select: challanDetailSelect,
      });
    }

    // CONFIRMED -> CANCELLED with compensating restock, atomic with the flip.
    const productIds = challan.items.map((i) => i.productId).sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT "productId" FROM "inventory"
        WHERE "productId" IN (${Prisma.join(productIds)})
        FOR UPDATE`,
    );
    for (const item of challan.items) {
      await tx.inventory.upsert({
        where: { productId: item.productId },
        create: { productId: item.productId, quantity: item.quantity },
        update: { quantity: { increment: item.quantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          quantity: item.quantity,
          movementType: 'IN',
          reason: `Sales challan ${challan.challanNumber} cancellation (restock)`,
          createdById: userId,
        },
      });
    }

    return tx.salesChallan.update({
      where: { id },
      data: { status: 'CANCELLED' },
      select: challanDetailSelect,
    });
  });
}