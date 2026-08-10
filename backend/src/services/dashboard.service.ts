import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface DashboardSummary {
  totalCustomers: number;
  activeCustomers: number;
  totalProducts: number;
  lowStockProducts: number;
  pendingFollowUps: number;
  draftChallans: number;
  confirmedChallans: number;
  cancelledChallans: number;
}

export async function getSummary(): Promise<DashboardSummary> {
  const [
    totalCustomers,
    activeCustomers,
    totalProducts,
    pendingFollowUps,
    draftChallans,
    confirmedChallans,
    cancelledChallans,
    lowStockRows,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { status: 'ACTIVE' } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.customerFollowUp.count({ where: { status: 'PENDING' } }),
    prisma.salesChallan.count({ where: { status: 'DRAFT' } }),
    prisma.salesChallan.count({ where: { status: 'CONFIRMED' } }),
    prisma.salesChallan.count({ where: { status: 'CANCELLED' } }),
    prisma.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`SELECT COUNT(*)::int AS count
        FROM "inventory" i
        JOIN "products" p ON p.id = i."productId"
        WHERE p."isActive" = true AND i.quantity <= p."minimumStock"`,
    ),
  ]);

  return {
    totalCustomers,
    activeCustomers,
    totalProducts,
    lowStockProducts: lowStockRows[0]?.count ?? 0,
    pendingFollowUps,
    draftChallans,
    confirmedChallans,
    cancelledChallans,
  };
}

export async function getLowStock() {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      sku: string;
      name: string;
      category: string;
      unitPrice: string;
      minimumStock: number;
      warehouseLocation: string;
      quantity: number;
    }>
  >(
    Prisma.sql`SELECT p.id AS id, p.sku AS sku, p.name AS name, p.category AS category,
        p."unitPrice"::text AS "unitPrice", p."minimumStock"::int AS "minimumStock",
        p."warehouseLocation" AS "warehouseLocation", i.quantity::int AS quantity
      FROM "products" p
      JOIN "inventory" i ON i."productId" = p.id
      WHERE p."isActive" = true AND i.quantity <= p."minimumStock"
      ORDER BY (i.quantity - p."minimumStock") ASC
      LIMIT 50`,
  );
  return rows;
}

export async function getRecentChallans(limit = 8) {
  return prisma.salesChallan.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      challanNumber: true,
      status: true,
      totalQuantity: true,
      createdAt: true,
      customer: { select: { id: true, name: true, customerCode: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export interface ActivityEntry {
  id: string;
  type: 'MOVEMENT' | 'CHALLAN';
  title: string;
  detail: string;
  createdAt: Date;
  movementType?: 'IN' | 'OUT';
  status?: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
}

/** Merged chronological feed of the latest inventory movements and challans. */
export async function getRecentActivity(limit = 12): Promise<ActivityEntry[]> {
  const [movements, challans] = await Promise.all([
    prisma.inventoryMovement.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        quantity: true,
        movementType: true,
        reason: true,
        createdAt: true,
        product: { select: { name: true, sku: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.salesChallan.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        challanNumber: true,
        status: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    }),
  ]);

  const feed: ActivityEntry[] = [
    ...movements.map((m) => ({
      id: `m-${m.id}`,
      type: 'MOVEMENT' as const,
      title: `${m.movementType === 'IN' ? 'Stock in' : 'Stock out'} — ${m.product.name}`,
      detail: `${m.quantity} × ${m.product.sku} · ${m.reason}`,
      createdAt: m.createdAt,
      movementType: m.movementType,
    })),
    ...challans.map((c) => ({
      id: `c-${c.id}`,
      type: 'CHALLAN' as const,
      title: `Challan ${c.challanNumber} ${c.status.toLowerCase()}`,
      detail: c.customer.name,
      createdAt: c.createdAt,
      status: c.status,
    })),
  ];

  return feed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}