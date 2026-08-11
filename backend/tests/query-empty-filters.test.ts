import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDb, createUser, devTokenFor, createCustomer, createProduct } from './helpers';
import { createChallan } from '../src/services/challan.service';
import { createFollowUp } from '../src/services/followUp.service';

const app = createApp();

/**
 * Regression tests for the "All/Any" select bug: list pages send empty-string
 * query params (`?status=&customerId=`) when the default "All statuses" /
 * "All customers" option is active. The query schemas must treat '' as
 * absent instead of failing validation (which surfaced as a generic
 * "Something went wrong" error state on the Follow-ups and Challans pages).
 */
describe('List endpoints accept "All/Any" empty-string filters', () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let adminAuth: string;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser('ADMIN', { name: 'Admin' });
    adminAuth = `Bearer ${devTokenFor(admin)}`;
  });

  it('GET /api/challans tolerates empty status + customerId (All selects)', async () => {
    const customer = await createCustomer('Challan Co');
    const product = await createProduct('SKU-EF-1', 50);
    await createChallan({ customerId: customer.id, items: [{ productId: product.id, quantity: 5 }] }, admin.id);

    const res = await request(app)
      .get('/api/challans')
      .set('Authorization', adminAuth)
      .query({ status: '', customerId: '', limit: 20 });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].challanNumber).toMatch(/^CH-/);
  });

  it('GET /api/followups tolerates empty status (All select)', async () => {
    const customer = await createCustomer('Follow Co');
    await createFollowUp(customer.id, { followUpDate: new Date('2026-08-20T10:00:00Z'), notes: 'Check in' }, admin.id);

    const res = await request(app)
      .get('/api/followups')
      .set('Authorization', adminAuth)
      .query({ status: '', limit: 15 });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
  });

  it('invalid non-empty filter values are still rejected (400)', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', adminAuth)
      .query({ status: 'BOGUS' });

    expect(res.status).toBe(400);
  });
});
