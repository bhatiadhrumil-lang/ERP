import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { resetDb, createUser, devTokenFor, createProduct, inventoryQuantity, movementCount } from './helpers';

const app = createApp();

describe('Inventory API', () => {
  let warehouse: Awaited<ReturnType<typeof createUser>>;
  let whAuth: string;

  beforeEach(async () => {
    await resetDb();
    warehouse = await createUser('WAREHOUSE', { name: 'Warehouse' });
    whAuth = `Bearer ${devTokenFor(warehouse)}`;
  });

  it('IN adjustment increases stock and appends to the audit ledger', async () => {
    const product = await createProduct('SKU-INV-1', 10);

    const res = await request(app)
      .post(`/api/inventory/${product.id}/adjust`)
      .set('Authorization', whAuth)
      .send({ movementType: 'IN', quantity: 15, reason: 'Purchase order received' });

    expect(res.status).toBe(200);
    expect(res.body.data.inventory.quantity).toBe(25);
    expect(res.body.data.movement.movementType).toBe('IN');

    const movement = await prisma.inventoryMovement.findFirst({
      where: { productId: product.id, movementType: 'IN' },
    });
    expect(movement?.reason).toBe('Purchase order received');
    expect(movement?.createdById).toBe(warehouse.id);
  });

  it('OUT adjustment decreases stock', async () => {
    const product = await createProduct('SKU-INV-2', 40);
    const res = await request(app)
      .post(`/api/inventory/${product.id}/adjust`)
      .set('Authorization', whAuth)
      .send({ movementType: 'OUT', quantity: 12, reason: 'Damaged stock write-off' });

    expect(res.status).toBe(200);
    expect(res.body.data.inventory.quantity).toBe(28);
  });

  it('rejects OUT beyond available stock — nothing changes', async () => {
    const product = await createProduct('SKU-INV-3', 10);
    const movementsBefore = await movementCount(product.id);

    const res = await request(app)
      .post(`/api/inventory/${product.id}/adjust`)
      .set('Authorization', whAuth)
      .send({ movementType: 'OUT', quantity: 999, reason: 'Should fail' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await inventoryQuantity(product.id)).toBe(10);
    expect(await movementCount(product.id)).toBe(movementsBefore);
  });

  it('rejects a non-positive adjustment quantity at validation time', async () => {
    const product = await createProduct('SKU-INV-4', 10);
    const res = await request(app)
      .post(`/api/inventory/${product.id}/adjust`)
      .set('Authorization', whAuth)
      .send({ movementType: 'IN', quantity: 0, reason: 'Nope' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lists movement history with product info and filters', async () => {
    const productA = await createProduct('SKU-INV-A', 10);
    const productB = await createProduct('SKU-INV-B', 10);
    await request(app)
      .post(`/api/inventory/${productA.id}/adjust`)
      .set('Authorization', whAuth)
      .send({ movementType: 'IN', quantity: 5, reason: 'Restock A' });
    await request(app)
      .post(`/api/inventory/${productB.id}/adjust`)
      .set('Authorization', whAuth)
      .send({ movementType: 'OUT', quantity: 3, reason: 'Issue B' });

    const all = await request(app)
      .get('/api/inventory/movements')
      .set('Authorization', whAuth);
    expect(all.body.data.total).toBe(2);

    const filtered = await request(app)
      .get(`/api/inventory/movements?productId=${productA.id}`)
      .set('Authorization', whAuth);
    expect(filtered.body.data.total).toBe(1);
    expect(filtered.body.data.items[0].product.sku).toBe('SKU-INV-A');

    const outOnly = await request(app)
      .get('/api/inventory/movements?movementType=OUT')
      .set('Authorization', whAuth);
    expect(outOnly.body.data.total).toBe(1);
    expect(outOnly.body.data.items[0].quantity).toBe(3);
  });
});