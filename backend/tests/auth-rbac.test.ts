import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetDb, createUser, devTokenFor, createProduct } from './helpers';

const app = createApp();

/**
 * Server-side RBAC (spec section 20). Frontend hiding is UX only —
 * these guarantees must hold at the API boundary.
 */
describe('Authentication & RBAC', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rejects requests without a bearer token', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed token', async () => {
    const res = await request(app).get('/api/customers').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('rejects a disabled user account', async () => {
    const disabled = await createUser('SALES', { name: 'Disabled', isActive: false });
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${devTokenFor(disabled)}`);
    expect(res.status).toBe(403);
  });

  it('dev-login issues a usable token for a seeded email (development authentication)', async () => {
    const user = await createUser('SALES', { name: 'DevLogin' });
    const login = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: user.email });
    expect(login.status).toBe(200);
    expect(login.body.data.token).toBeTruthy();

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(user.email);
    expect(me.body.data.role).toBe('SALES');
  });

  it('SALES can manage customers/challans but not users or inventory adjustments', async () => {
    const sales = await createUser('SALES', { name: 'Sales' });
    const auth = `Bearer ${devTokenFor(sales)}`;

    expect((await request(app).get('/api/customers').set('Authorization', auth)).status).toBe(200);

    const usersRes = await request(app).get('/api/users').set('Authorization', auth);
    expect(usersRes.status).toBe(403);

    const product = await createProduct('SKU-RBAC-1', 10);
    const adjust = await request(app)
      .post(`/api/inventory/${product.id}/adjust`)
      .set('Authorization', auth)
      .send({ movementType: 'IN', quantity: 1, reason: 'x' });
    expect(adjust.status).toBe(403);
  });

  it('WAREHOUSE can manage products/inventory but not customers', async () => {
    const warehouse = await createUser('WAREHOUSE', { name: 'Warehouse' });
    const auth = `Bearer ${devTokenFor(warehouse)}`;

    expect((await request(app).get('/api/products').set('Authorization', auth)).status).toBe(200);

    const createCustomer = await request(app)
      .post('/api/customers')
      .set('Authorization', auth)
      .send({
        name: 'Nope',
        mobile: '+91 90000 00000',
        businessName: 'Nope',
        customerType: 'RETAIL',
      });
    expect(createCustomer.status).toBe(403);
  });

  it('ACCOUNTS can view customers/challans/dashboard but not write', async () => {
    const accounts = await createUser('ACCOUNTS', { name: 'Accounts' });
    const auth = `Bearer ${devTokenFor(accounts)}`;

    expect((await request(app).get('/api/customers').set('Authorization', auth)).status).toBe(200);
    expect((await request(app).get('/api/challans').set('Authorization', auth)).status).toBe(200);
    expect((await request(app).get('/api/dashboard/summary').set('Authorization', auth)).status).toBe(200);

    const createCustomer = await request(app)
      .post('/api/customers')
      .set('Authorization', auth)
      .send({
        name: 'Nope',
        mobile: '+91 90000 00000',
        businessName: 'Nope',
        customerType: 'RETAIL',
      });
    expect(createCustomer.status).toBe(403);

    expect((await request(app).get('/api/users').set('Authorization', auth)).status).toBe(403);
  });

  it('ADMIN can access user management (admin-only surface)', async () => {
    const admin = await createUser('ADMIN', { name: 'Admin' });
    const auth = `Bearer ${devTokenFor(admin)}`;
    const res = await request(app).get('/api/users').set('Authorization', auth);
    expect(res.status).toBe(200);
  });

  it('ADMIN cannot deactivate their own account', async () => {
    const admin = await createUser('ADMIN', { name: 'Admin' });
    const auth = `Bearer ${devTokenFor(admin)}`;
    const res = await request(app)
      .patch(`/api/users/${admin.id}`)
      .set('Authorization', auth)
      .send({ isActive: false });
    expect(res.status).toBe(409);
  });
});