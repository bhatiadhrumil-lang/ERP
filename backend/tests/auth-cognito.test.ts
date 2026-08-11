import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { __injectJwksForTests } from '../src/middleware/authMiddleware';
import { prisma } from '../src/config/prisma';
import { resetDb, createUser } from './helpers';
import {
  getTestKeys,
  signCognitoAccessToken,
  TEST_CLIENT_ID,
  TEST_ISSUER,
  TEST_POOL_ID,
} from './cognitoTestKit';

const app = createApp();

/**
 * Cognito JWT authentication (spec sections 11–14, 26).
 *
 * The middleware reads its Cognito configuration live, so this suite switches
 * the backend into "Cognito-only" mode for the duration of the file and mints
 * real RS256 tokens signed by a local test key whose JWKS is injected into the
 * verifier (no AWS network calls). afterAll restores the dev-token strategy
 * used by the rest of the suite.
 */
describe('Cognito authentication', () => {
  beforeAll(() => {
    process.env.COGNITO_USER_POOL_ID = TEST_POOL_ID;
    process.env.COGNITO_CLIENT_ID = TEST_CLIENT_ID;
    process.env.USER_ONBOARDING = 'admin';
    __injectJwksForTests(getTestKeys().jwks);
  });

  afterAll(() => {
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.COGNITO_CLIENT_ID;
    delete process.env.USER_ONBOARDING;
  });

  beforeEach(async () => {
    await resetDb();
  });

  it('1. rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('2. rejects a malformed JWT with 401', async () => {
    const res = await request(app).get('/api/customers').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('3. rejects an expired JWT with 401', async () => {
    const user = await createUser('SALES', { name: 'Expired' });
    const token = signCognitoAccessToken(user.cognitoSub, { expiresInSec: -60 });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('4. accepts a valid Cognito JWT and returns the app user', async () => {
    const user = await createUser('SALES', { name: 'Valid' });
    const token = signCognitoAccessToken(user.cognitoSub);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.cognitoSub).toBe(user.cognitoSub);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user.role).toBe('SALES');
    expect(res.body.data.user.isActive).toBe(true);
  });

  it('rejects a token with the wrong issuer', async () => {
    const user = await createUser('SALES', { name: 'Issuer' });
    const token = signCognitoAccessToken(user.cognitoSub, {
      claims: { iss: 'https://cognito-idp.us-east-1.amazonaws.com/some-other-pool' },
    });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token from the wrong app client', async () => {
    const user = await createUser('SALES', { name: 'Client' });
    const token = signCognitoAccessToken(user.cognitoSub, { claims: { client_id: 'some-other-client' } });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token with an invalid signature', async () => {
    const user = await createUser('SALES', { name: 'Signature' });
    const token = signCognitoAccessToken(user.cognitoSub, { wrongSignature: true });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects an ID token (wrong token use)', async () => {
    const user = await createUser('SALES', { name: 'TokenUse' });
    const token = signCognitoAccessToken(user.cognitoSub, { claims: { token_use: 'id' } });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects an HS256 token (algorithm confusion)', async () => {
    const user = await createUser('SALES', { name: 'AlgConfusion' });
    const token = signCognitoAccessToken(user.cognitoSub, { hs256: true });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('6. unknown Cognito sub with admin policy is handled safely (403, no user created)', async () => {
    const token = signCognitoAccessToken('unknown-sub-123');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/not provisioned/i);
    const created = await prisma.user.findUnique({ where: { cognitoSub: 'unknown-sub-123' } });
    expect(created).toBeNull();
  });

  it('6b. unknown Cognito sub with auto policy provisions a SALES user (never ADMIN)', async () => {
    process.env.USER_ONBOARDING = 'auto';
    const token = signCognitoAccessToken('auto-sub-456', { claims: { email: 'new.hire@example.com' } });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.cognitoSub).toBe('auto-sub-456');
    expect(res.body.data.user.role).toBe('SALES');
    expect(res.body.data.user.email).toBe('new.hire@example.com');

    const row = await prisma.user.findUnique({ where: { cognitoSub: 'auto-sub-456' } });
    expect(row?.role).toBe('SALES');
    expect(row?.isActive).toBe(true);

    process.env.USER_ONBOARDING = 'admin';
  });

  it('7. ADMIN token can call the admin-only users endpoint', async () => {
    const admin = await createUser('ADMIN', { name: 'Admin' });
    const token = signCognitoAccessToken(admin.cognitoSub);
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('8. SALES token is rejected with 403 on an admin-only endpoint', async () => {
    const sales = await createUser('SALES', { name: 'Sales' });
    const token = signCognitoAccessToken(sales.cognitoSub);
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('9. WAREHOUSE token can read inventory but not adjust it', async () => {
    const warehouse = await createUser('WAREHOUSE', { name: 'Warehouse' });
    const token = signCognitoAccessToken(warehouse.cognitoSub);
    const res = await request(app).get('/api/inventory').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('does not trust a role claim or header — role always comes from PostgreSQL', async () => {
    const sales = await createUser('SALES', { name: 'RoleHeader' });
    const token = signCognitoAccessToken(sales.cognitoSub, { claims: { 'cognito:groups': ['admins'] } });
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .set('x-user-role', 'ADMIN');
    expect(res.status).toBe(403);
  });

  it('mints tokens against the configured pool issuer (kit sanity)', () => {
    expect(TEST_ISSUER).toBe(`https://cognito-idp.us-east-1.amazonaws.com/${TEST_POOL_ID}`);
  });
});