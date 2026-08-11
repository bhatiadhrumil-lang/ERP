// IMPORT ORDER MATTERS: DEV_AUTH_ENABLED must be set before the app modules
// are imported (env.ts caches isDevAuthEnabled at import time), and
// cognitoAdminMock registers the AWS SDK mock before anything transitively
// imports the SDK. Files run sequentially in one worker, so set it explicitly
// regardless of what earlier files left behind.
process.env.DEV_AUTH_ENABLED = 'true';

import { getCognitoState } from './cognitoAdminMock';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { resetDb, createUser, devTokenFor } from './helpers';

const app = createApp();
const cognitoState = getCognitoState();

/**
 * Dev-mode invites (no AWS): when DEV_AUTH_ENABLED=true the invite flow skips
 * the Cognito admin API entirely — the account is created locally with a temp
 * password returned to the admin, and the employee signs in via dev-login.
 */
describe('Dev-mode invites (no AWS credentials)', () => {
  beforeAll(() => {
    process.env.COGNITO_USER_POOL_ID = 'test-pool-dev-invite';
    process.env.COGNITO_CLIENT_ID = 'test-client-dev-invite';
  });

  afterAll(() => {
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.COGNITO_CLIENT_ID;
    delete process.env.DEV_AUTH_ENABLED;
  });

  beforeEach(async () => {
    await resetDb();
    cognitoState.reset();
  });

  const adminAuth = async () => {
    const admin = await createUser('ADMIN', { name: 'Dev Admin' });
    return `Bearer ${devTokenFor(admin)}`;
  };

  it('invite creates a local ACTIVE account with a temp password and never touches Cognito', async () => {
    const auth = await adminAuth();
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', auth)
      .send({ name: 'Jane Dev', email: 'jane.dev@example.com', role: 'SALES' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.status).toBe('ACTIVE');
    expect(res.body.data.user.role).toBe('SALES');
    expect(res.body.data.user.cognitoSub).toMatch(/^dev-/);
    expect(typeof res.body.data.tempPassword).toBe('string');
    expect(res.body.data.tempPassword).toMatch(/^Temp!/);

    // No Cognito admin operation was performed.
    expect(cognitoState.exists('jane.dev@example.com')).toBe(false);

    const row = await prisma.user.findUnique({ where: { email: 'jane.dev@example.com' } });
    expect(row?.status).toBe('ACTIVE');
    expect(row?.cognitoSub).toMatch(/^dev-/);
    expect(row?.devPasswordHash).toMatch(/^scrypt\$/);
  });

  it('the invited employee signs in via dev-login with the temp password', async () => {
    const auth = await adminAuth();
    const invite = await request(app)
      .post('/api/users/invite')
      .set('Authorization', auth)
      .send({ name: 'John Dev', email: 'john.dev@example.com', role: 'WAREHOUSE' });
    const tempPassword = invite.body.data.tempPassword as string;

    const res = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: 'john.dev@example.com', password: tempPassword });
    expect(res.status).toBe(200);
    expect(res.body.data.tokenType).toBe('dev');
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.role).toBe('WAREHOUSE');
    expect(res.body.data.user).not.toHaveProperty('devPasswordHash');
  });

  it('dev-login rejects a wrong temp password with 401', async () => {
    const auth = await adminAuth();
    await request(app)
      .post('/api/users/invite')
      .set('Authorization', auth)
      .send({ name: 'Sneaky Dev', email: 'sneaky@example.com', role: 'ACCOUNTS' });

    const res = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: 'sneaky@example.com', password: 'Temp!wrong-password' });
    expect(res.status).toBe(401);
  });

  it('dev-login requires a password for dev-created accounts (400 without one)', async () => {
    const auth = await adminAuth();
    await request(app)
      .post('/api/users/invite')
      .set('Authorization', auth)
      .send({ name: 'NoPass Dev', email: 'nopass@example.com', role: 'SALES' });

    const res = await request(app).post('/api/auth/dev-login').send({ email: 'nopass@example.com' });
    expect(res.status).toBe(400);
  });

  it('legacy seeded users still dev-login by email only (no local password)', async () => {
    const seeded = await createUser('SALES', { name: 'Seeded Sales' });
    const res = await request(app).post('/api/auth/dev-login').send({ email: seeded.email });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(seeded.email);
  });

  it('dev-mode invite cannot create an ADMIN via the role field (400 VALIDATION_ERROR)', async () => {
    const auth = await adminAuth();
    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', auth)
      .send({ name: 'Bad', email: 'bad@example.com', role: 'ADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(cognitoState.exists('bad@example.com')).toBe(false);
  });
});
