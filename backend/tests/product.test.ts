import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDb, createUser, devTokenFor, createProduct } from './helpers';
import * as inventoryService from '../src/services/inventory.service';

const app = createApp();

describe('Product API', () => {
  let warehouse: Awaited<ReturnType<typeof createUser>>;
  let whAuth: string;

  beforeEach(async () => {
    await resetDb();
    warehouse = await createUser('WAREHOUSE', { name: 'Warehouse' });
    whAuth = `Bearer ${devTokenFor(warehouse)}`;
  });

  it('creates a product with initial stock and a matching IN movement', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', whAuth)
      .send({
        sku: 'SKU-NEW-1',
        name: 'Test Widget',
        category: 'Test',
        unitPrice: 249.99,
        minimumStock: 5,
        warehouseLocation: 'Aisle-Z',
        initialQuantity: 25,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.inventory.quantity).toBe(25);

    const movement = await import('../src/config/prisma').then((m) =>
      m.prisma.inventoryMovement.findFirst({
        where: { productId: res.body.data.id },
      }),
    );
    expect(movement).not.toBeNull();
    expect(movement!.movementType).toBe('IN');
    expect(movement!.quantity).toBe(25);
  });

  it('rejects a duplicate SKU with 409', async () => {
    await createProduct('SKU-DUP-1', 10);

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', whAuth)
      .send({
        sku: 'SKU-DUP-1',
        name: 'Dup',
        category: 'Test',
        unitPrice: 10,
        minimumStock: 1,
        warehouseLocation: 'A',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects a price with more than two decimals', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', whAuth)
      .send({
        sku: 'SKU-PRICE-1',
        name: 'Bad Price',
        category: 'Test',
        unitPrice: 10.999,
        minimumStock: 1,
        warehouseLocation: 'A',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('deletes a product with movement history (409 instead of silent data loss)', async () => {
    const product = await createProduct('SKU-DEL-1', 10);
    await inventoryService.adjustStock(
      product.id,
      { movementType: 'IN', quantity: 5, reason: 'Test restock' },
      warehouse.id,
    );

    const res = await request(app)
      .delete(`/api/products/${product.id}`)
      .set('Authorization', whAuth);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('filters by low stock', async () => {
    await createProduct('SKU-LOW-1', 3, { minimumStock: 10 }); // LOW
    await createProduct('SKU-OK-1', 50, { minimumStock: 10 }); // OK

    const low = await request(app)
      .get('/api/products')
      .set('Authorization', whAuth)
      .query({ lowStock: 'true' });

    expect(low.body.data.total).toBe(1);
    expect(low.body.data.items[0].sku).toBe('SKU-LOW-1');

    const all = await request(app)
      .get('/api/products')
      .set('Authorization', whAuth)
      .query({ lowStock: 'false' });

    expect(all.body.data.total).toBe(2);
  });

  it('accepts empty-string isActive/lowStock filters ("All" selects)', async () => {
    await createProduct('SKU-E-1', 10);

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', whAuth)
      .query({ isActive: '', lowStock: '' });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
  });
});