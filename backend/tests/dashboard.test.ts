import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { resetDb, createUser, devTokenFor, createProduct, createCustomer } from './helpers';
import { createChallan, confirmChallan } from '../src/services/challan.service';
import { adjustStock } from '../src/services/inventory.service';

const app = createApp();

describe('Dashboard API', () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let auth: string;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser('ADMIN', { name: 'Admin' });
    auth = `Bearer ${devTokenFor(admin)}`;
  });

  it('returns zeroed metrics on an empty database', async () => {
    const res = await request(app).get('/api/dashboard/summary').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalCustomers: 0,
      activeCustomers: 0,
      totalProducts: 0,
      lowStockProducts: 0,
      pendingFollowUps: 0,
      draftChallans: 0,
      confirmedChallans: 0,
    });
  });

  it('reflects customers, products, low stock, follow-ups and challans', async () => {
    // Customers: 2 active, 1 lead, 1 inactive
    for (let i = 0; i < 2; i += 1) await createCustomer(`Active ${i}`);
    const lead = await createCustomer('Lead Person');
    const inactive = await createCustomer('Inactive Person');
    await prisma.customer.update({ where: { id: inactive.id }, data: { status: 'INACTIVE' } });
    await prisma.customer.update({ where: { id: lead.id }, data: { status: 'LEAD' } });

    // Products: one low-stock, one healthy
    const low = await createProduct('SKU-DASH-LOW', 2, { minimumStock: 10 });
    await createProduct('SKU-DASH-OK', 50, { minimumStock: 10 });

    // Pending follow-up
    await prisma.customerFollowUp.create({
      data: {
        customerId: lead.id,
        followUpDate: new Date(Date.now() + 86400000),
        notes: 'Call soon',
        status: 'PENDING',
      },
    });

    // One draft + one confirmed challan
    const draft = await createChallan(
      { customerId: lead.id, items: [{ productId: low.id, quantity: 1 }] },
      admin.id,
    );
    const confirmed = await createChallan(
      { customerId: lead.id, items: [{ productId: low.id, quantity: 1 }] },
      admin.id,
    );
    await confirmChallan(confirmed.id, admin.id);

    const res = await request(app).get('/api/dashboard/summary').set('Authorization', auth);
    expect(res.body.data).toMatchObject({
      totalCustomers: 4,
      activeCustomers: 2,
      totalProducts: 2,
      lowStockProducts: 1,
      pendingFollowUps: 1,
      draftChallans: 1,
      confirmedChallans: 1,
    });
  });

  it('lists low-stock products in urgency order', async () => {
    const urgent = await createProduct('SKU-DASH-URGENT', 1, { minimumStock: 10 }); // deficit 9
    await createProduct('SKU-DASH-MILD', 9, { minimumStock: 10 }); // deficit 1
    await adjustStock(urgent.id, { movementType: 'IN', quantity: 5, reason: 'restock' }, admin.id);

    const res = await request(app).get('/api/dashboard/low-stock').set('Authorization', auth);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    // Most urgent deficit first (ASC by quantity - minimumStock)
    const first = res.body.data[0];
    expect(first.sku).toBe('SKU-DASH-URGENT');
  });

  it('returns recent challans with customer info', async () => {
    const customer = await createCustomer('Recent Buyer');
    const product = await createProduct('SKU-DASH-RECENT', 30);
    await createChallan({ customerId: customer.id, items: [{ productId: product.id, quantity: 3 }] }, admin.id);

    const res = await request(app).get('/api/dashboard/recent-challans').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].customer.name).toBe('Recent Buyer');
  });
});