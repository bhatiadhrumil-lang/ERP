import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDb, createUser, devTokenFor, createCustomer } from './helpers';
import * as challanService from '../src/services/challan.service';

const app = createApp();

describe('Customer API', () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let adminAuth: string;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser('ADMIN', { name: 'Admin' });
    adminAuth = `Bearer ${devTokenFor(admin)}`;
  });

  it('creates a customer with an auto-generated code', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', adminAuth)
      .send({
        name: 'Ramesh Kumar',
        mobile: '+91 98111 22334',
        email: 'ramesh@example.in',
        businessName: 'Ramesh Traders',
        gstNumber: '06AABCK1234F1Z5',
        customerType: 'WHOLESALE',
        status: 'ACTIVE',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customerCode).toMatch(/^CUS-/);
    expect(res.body.data.name).toBe('Ramesh Kumar');
  });

  it('rejects an invalid customer payload with a consistent validation envelope', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', adminAuth)
      .send({ name: 'X', mobile: 'not-a-phone', businessName: '', customerType: 'B2B' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('searches customers by name/business/mobile with pagination', async () => {
    await createCustomer('Alpha Traders');
    await createCustomer('Beta Enterprises');

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', adminAuth)
      .query({ search: 'alpha', limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].name).toBe('Alpha Traders');
    expect(res.body.data.page).toBe(1);
  });

  it('updates an existing customer', async () => {
    const customer = await createCustomer('Gamma Stores');

    const res = await request(app)
      .patch(`/api/customers/${customer.id}`)
      .set('Authorization', adminAuth)
      .send({ status: 'INACTIVE', notes: 'Closed shop' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('INACTIVE');
    expect(res.body.data.notes).toBe('Closed shop');
  });

  it('rejects deleting a customer that has challans (audit safety)', async () => {
    const customer = await createCustomer('Locked Customer');
    const product = await import('./helpers').then((h) => h.createProduct('SKU-LOCK-1', 50));

    await challanService.createChallan(
      { customerId: customer.id, items: [{ productId: product.id, quantity: 5 }] },
      admin.id,
    );

    const res = await request(app)
      .delete(`/api/customers/${customer.id}`)
      .set('Authorization', adminAuth);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 404 for an unknown customer', async () => {
    const res = await request(app)
      .get('/api/customers/00000000-0000-4000-8000-000000000000')
      .set('Authorization', adminAuth);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});