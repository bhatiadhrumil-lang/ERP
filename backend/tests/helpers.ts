import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import type { UserRole } from '@prisma/client';
import { prisma } from '../src/config/prisma';

/** Wipes every table between tests — relies on FK CASCADE ordering. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "sales_challan_items", "sales_challans", "inventory_movements", "inventory", "products", "customer_follow_ups", "customers", "users" RESTART IDENTITY CASCADE`,
  );
}

let seq = 0;
const next = (): number => {
  seq += 1;
  return seq;
};

export interface TestUser {
  id: string;
  cognitoSub: string;
  email: string;
  role: UserRole;
}

export async function createUser(role: UserRole, overrides: { name?: string; isActive?: boolean } = {}): Promise<TestUser> {
  const n = next();
  const email = overrides.name ? `${overrides.name.toLowerCase().replace(/\s+/g, '-')}-${n}@test.local` : `${role.toLowerCase()}-${n}@test.local`;
  const user = await prisma.user.create({
    data: {
      cognitoSub: `test-sub-${role}-${n}`,
      name: overrides.name ?? role,
      email,
      role,
      isActive: overrides.isActive ?? true,
    },
  });
  return { id: user.id, cognitoSub: user.cognitoSub, email: user.email, role: user.role };
}

/** Mint a development JWT for a seeded/test user (dev auth strategy). */
export function devTokenFor(user: TestUser): string {
  return jwt.sign(
    { sub: user.cognitoSub, role: user.role, tokenType: 'dev' },
    'test-secret-only',
    { issuer: 'mini-erp-dev', audience: 'mini-erp-frontend', expiresIn: '1h', algorithm: 'HS256' },
  );
}

export async function createProduct(
  sku: string,
  stock: number,
  overrides: { minimumStock?: number; unitPrice?: string; isActive?: boolean } = {},
) {
  return prisma.product.create({
    data: {
      sku,
      name: `Product ${sku}`,
      category: 'Test',
      unitPrice: new Prisma.Decimal(overrides.unitPrice ?? '100.00'),
      minimumStock: overrides.minimumStock ?? 10,
      warehouseLocation: 'Aisle-T',
      isActive: overrides.isActive ?? true,
      inventory: { create: { quantity: stock } },
    },
    include: { inventory: true },
  });
}

export async function createCustomer(name = 'Test Customer'): Promise<{
  id: string;
  customerCode: string;
}> {
  const n = next();
  const customer = await prisma.customer.create({
    data: {
      customerCode: `CUS-TEST-${n}`,
      name,
      mobile: '+91 90000 00000',
      businessName: 'Test Business',
      customerType: 'RETAIL',
      status: 'ACTIVE',
    },
  });
  return { id: customer.id, customerCode: customer.customerCode };
}

export async function inventoryQuantity(productId: string): Promise<number> {
  const row = await prisma.inventory.findUnique({ where: { productId }, select: { quantity: true } });
  return row?.quantity ?? -1;
}

export async function movementCount(productId: string): Promise<number> {
  return prisma.inventoryMovement.count({ where: { productId } });
}