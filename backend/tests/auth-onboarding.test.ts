// IMPORT ORDER MATTERS: cognitoAdminMock registers the AWS SDK mock, so it
// must be imported before any module that transitively imports the SDK.
// This file runs in Cognito mode: dev invites (DEV_AUTH_ENABLED=true) must be
// OFF. Files run sequentially in one worker, so delete any leaked value BEFORE
// importing the app modules (env.ts caches isDevAuthEnabled at import time).
delete process.env.DEV_AUTH_ENABLED;

import { getCognitoState } from './cognitoAdminMock';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { __injectJwksForTests } from '../src/middleware/authMiddleware';
import { prisma } from '../src/config/prisma';
import { resetDb, createUser, devTokenFor } from './helpers';
import {
  getTestKeys,
  signCognitoAccessToken,
  signCognitoIdToken,
  TEST_CLIENT_ID,
  TEST_POOL_ID,
} from './cognitoTestKit';

const app = createApp();
const cognitoState = getCognitoState();

/**
 * User onboarding + admin user management (spec sections 2, 7–17, 24–26, 31).
 *
 * Runs in Cognito mode (real RS256 tokens minted in-test against the injected
 * JWKS) with the Cognito ADMIN SDK fully mocked — no AWS calls are made.
 */
describe('User onboarding & administration', () => {
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
    cognitoState.reset();
  });

  const adminAuth = async () => {
    const admin = await createUser('ADMIN', { name: 'Bootstrap Admin' });
    return `Bearer ${devTokenFor(admin)}`;
  };

  describe('1. First-admin bootstrap', () => {
    it('1. bootstrap succeeds when no ADMIN exists — creates the ADMIN with ACTIVE status', async () => {
      const token = signCognitoAccessToken('bootstrap-sub-1', {
        claims: { email: 'first.admin@example.com', name: 'First Admin' },
      });
      const res = await request(app)
        .post('/api/auth/bootstrap-admin')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.user.status).toBe('ACTIVE');
      expect(res.body.data.user.isActive).toBe(true);
      expect(res.body.data.user.cognitoSub).toBe('bootstrap-sub-1');

      const row = await prisma.user.findUnique({ where: { cognitoSub: 'bootstrap-sub-1' } });
      expect(row?.role).toBe('ADMIN');
      expect(row?.status).toBe('ACTIVE');
    });

    it('bootstrap falls back to the username claim when the access token has no email (real Cognito shape)', async () => {
      // Real Cognito ACCESS tokens carry `username` (the signup email) but not
      // the `email` claim — that lives in the ID token. No claims passed here.
      const token = signCognitoAccessToken('bootstrap-sub-email');
      const res = await request(app)
        .post('/api/auth/bootstrap-admin')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.user.email).toBe('bootstrap-sub-email@test.example');

      const row = await prisma.user.findUnique({ where: { cognitoSub: 'bootstrap-sub-email' } });
      expect(row?.email).toBe('bootstrap-sub-email@test.example');
    });

    it('bootstrap takes the real email from the ID token when the pool uses UUID usernames', async () => {
      // Pools configured with email-as-alias generate UUID usernames, so the
      // access token's `username` claim is a UUID — not the email. The ID token
      // carries the real `email`; the bootstrap flow must prefer it.
      const token = signCognitoAccessToken('bootstrap-sub-idtoken', {
        claims: { username: '4f3f1f2e-0000-4000-8000-000000000000' },
      });
      const idToken = signCognitoIdToken('bootstrap-sub-idtoken', {
        claims: { email: 'real.admin@example.com', name: 'Real Admin' },
      });
      const res = await request(app)
        .post('/api/auth/bootstrap-admin')
        .set('Authorization', `Bearer ${token}`)
        .send({ idToken });
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.user.email).toBe('real.admin@example.com');
      expect(res.body.data.user.name).toBe('Real Admin');

      const row = await prisma.user.findUnique({ where: { cognitoSub: 'bootstrap-sub-idtoken' } });
      expect(row?.email).toBe('real.admin@example.com');
    });

    it('bootstrap ignores an invalid ID token and falls back to access-token claims', async () => {
      const token = signCognitoAccessToken('bootstrap-sub-badid', {
        claims: { username: 'uuid-username-only' },
      });
      const res = await request(app)
        .post('/api/auth/bootstrap-admin')
        .set('Authorization', `Bearer ${token}`)
        .send({ idToken: 'not.a.jwt' });
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.user.email).toBe('uuid-username-only');

      const row = await prisma.user.findUnique({ where: { cognitoSub: 'bootstrap-sub-badid' } });
      expect(row?.email).toBe('uuid-username-only');
    });

    it('bootstrap-status flips to initialized after the first admin is created', async () => {
      expect((await request(app).get('/api/auth/bootstrap-status')).body.data.initialized).toBe(false);

      const token = signCognitoAccessToken('bootstrap-sub-2', { claims: { email: 'a@example.com' } });
      await request(app).post('/api/auth/bootstrap-admin').set('Authorization', `Bearer ${token}`);

      expect((await request(app).get('/api/auth/bootstrap-status')).body.data.initialized).toBe(true);
    });

    it('2. a second public admin bootstrap fails with ADMIN_ALREADY_INITIALIZED', async () => {
      const first = signCognitoAccessToken('bootstrap-sub-3', { claims: { email: 'a@example.com' } });
      await request(app).post('/api/auth/bootstrap-admin').set('Authorization', `Bearer ${first}`);

      const second = signCognitoAccessToken('bootstrap-sub-4', { claims: { email: 'b@example.com' } });
      const res = await request(app)
        .post('/api/auth/bootstrap-admin')
        .set('Authorization', `Bearer ${second}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ADMIN_ALREADY_INITIALIZED');
    });

    it('the same Cognito identity cannot bootstrap twice (USER_ALREADY_PROVISIONED)', async () => {
      const token = signCognitoAccessToken('bootstrap-sub-5', { claims: { email: 'a@example.com' } });
      await request(app).post('/api/auth/bootstrap-admin').set('Authorization', `Bearer ${token}`);
      const res = await request(app)
        .post('/api/auth/bootstrap-admin')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USER_ALREADY_PROVISIONED');
    });

    it('bootstrap rejects dev (non-Cognito) tokens with 401', async () => {
      const admin = await createUser('ADMIN', { name: 'Temp' });
      const res = await request(app)
        .post('/api/auth/bootstrap-admin')
        .set('Authorization', `Bearer ${devTokenFor(admin)}`);
      expect(res.status).toBe(401);
    });

    it('3. there is no public employee self-registration route', async () => {
      const res = await request(app).post('/api/auth/signup').send({
        name: 'Hacker',
        email: 'hacker@example.com',
        password: 'Whatever123!',
        role: 'SALES',
      });
      expect(res.status).toBe(404);
    });

    it('ADMIN role is never accepted from request input — bootstrap ignores any role field', async () => {
      const token = signCognitoAccessToken('bootstrap-sub-6', {
        claims: { email: 'a@example.com', name: 'A' },
      });
      const res = await request(app)
        .post('/api/auth/bootstrap-admin')
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'SUPERUSER' });
      // The bootstrap route never reads a role from the body — the created
      // user is ADMIN because that is the only thing bootstrap can create.
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.user.email).toBe('a@example.com');
    });
  });

  describe('2. Invite employees', () => {
    it.each(['SALES', 'WAREHOUSE', 'ACCOUNTS'] as const)(
      '4/5/6. ADMIN can invite a %s employee — Cognito user created + app user INVITED',
      async (role) => {
        const auth = await adminAuth();
        const res = await request(app)
          .post('/api/users/invite')
          .set('Authorization', auth)
          .send({ name: 'John Smith', email: `john-${role.toLowerCase()}@example.com`, role });
        expect(res.status).toBe(200);
        expect(res.body.data.user.role).toBe(role);
        expect(res.body.data.user.status).toBe('INVITED');
        expect(res.body.data.user.isActive).toBe(true);

        const email = `john-${role.toLowerCase()}@example.com`;
        expect(cognitoState.exists(email)).toBe(true);
        const row = await prisma.user.findUnique({ where: { email } });
        expect(row?.status).toBe('INVITED');
        expect(row?.role).toBe(role);
        expect(row?.cognitoSub).toBe(`cognito-sub-${email}`);
      },
    );

    it('7. invite rejects ADMIN as a target role (400 VALIDATION_ERROR)', async () => {
      const auth = await adminAuth();
      const res = await request(app)
        .post('/api/users/invite')
        .set('Authorization', auth)
        .send({ name: 'Bad', email: 'bad@example.com', role: 'ADMIN' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(cognitoState.exists('bad@example.com')).toBe(false);
    });

    it('7b. invite rejects an arbitrary invalid role (400 VALIDATION_ERROR)', async () => {
      const auth = await adminAuth();
      const res = await request(app)
        .post('/api/users/invite')
        .set('Authorization', auth)
        .send({ name: 'Bad', email: 'bad@example.com', role: 'SUPERUSER' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('8/9. a non-admin receives 403 on /api/users/invite', async () => {
      const sales = await createUser('SALES', { name: 'Sales' });
      const res = await request(app)
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${devTokenFor(sales)}`)
        .send({ name: 'John', email: 'john@example.com', role: 'SALES' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('inviting an email that already exists in the app returns 409', async () => {
      const auth = await adminAuth();
      const existing = await createUser('SALES', { name: 'Taken' });
      const res = await request(app)
        .post('/api/users/invite')
        .set('Authorization', auth)
        .send({ name: 'John', email: existing.email, role: 'SALES' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('3. Invitation status lifecycle', () => {
    it('10. an invited user has INVITED status until their first authenticated request', async () => {
      const auth = await adminAuth();
      const invite = await request(app)
        .post('/api/users/invite')
        .set('Authorization', auth)
        .send({ name: 'New Hire', email: 'newhire@example.com', role: 'SALES' });
      expect(invite.body.data.user.status).toBe('INVITED');

      const row = await prisma.user.findUnique({ where: { email: 'newhire@example.com' } });
      expect(row?.status).toBe('INVITED');
    });

    it('11. first authenticated request flips INVITED → ACTIVE (onboarding completed)', async () => {
      const invited = await createUser('SALES', { name: 'Invited', status: 'INVITED' });
      const token = signCognitoAccessToken(invited.cognitoSub);
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.status).toBe('ACTIVE');

      const row = await prisma.user.findUnique({ where: { id: invited.id } });
      expect(row?.status).toBe('ACTIVE');
      expect(row?.isActive).toBe(true);
    });

    it('12. a disabled user is rejected with 403 USER_DISABLED even with a valid Cognito token', async () => {
      const disabled = await createUser('SALES', { name: 'Disabled', status: 'DISABLED', isActive: false });
      const token = signCognitoAccessToken(disabled.cognitoSub);
      const res = await request(app).get('/api/customers').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('USER_DISABLED');
      expect(res.body.error.message).toMatch(/disabled/i);
    });
  });

  describe('4. Admin user management', () => {
    it('13. ADMIN can disable a user — DB locked out + Cognito disabled', async () => {
      const auth = await adminAuth();
      const target = await createUser('SALES', { name: 'Victim' });
      cognitoState.users.set(target.email, {
        sub: target.cognitoSub,
        username: target.email,
        enabled: true,
        status: 'ACTIVE',
      });

      const res = await request(app)
        .post(`/api/users/${target.id}/disable`)
        .set('Authorization', auth);
      expect(res.status).toBe(200);
      expect(res.body.data.user.status).toBe('DISABLED');
      expect(res.body.data.user.isActive).toBe(false);
      expect(cognitoState.isEnabled(target.email)).toBe(false);
    });

    it('14. ADMIN can enable a user — DB restored + Cognito enabled', async () => {
      const auth = await adminAuth();
      const target = await createUser('SALES', { name: 'Revived', status: 'DISABLED', isActive: false });
      cognitoState.users.set(target.email, {
        sub: target.cognitoSub,
        username: target.email,
        enabled: false,
        status: 'DISABLED',
      });

      const res = await request(app)
        .post(`/api/users/${target.id}/enable`)
        .set('Authorization', auth);
      expect(res.status).toBe(200);
      expect(res.body.data.user.status).toBe('ACTIVE');
      expect(res.body.data.user.isActive).toBe(true);
      expect(cognitoState.isEnabled(target.email)).toBe(true);
    });

    it('15. ADMIN can change an employee role (stored in PostgreSQL only)', async () => {
      const auth = await adminAuth();
      const target = await createUser('SALES', { name: 'Promotable' });
      const res = await request(app)
        .patch(`/api/users/${target.id}/role`)
        .set('Authorization', auth)
        .send({ role: 'WAREHOUSE' });
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('WAREHOUSE');

      const row = await prisma.user.findUnique({ where: { id: target.id } });
      expect(row?.role).toBe('WAREHOUSE');
    });

    it('16. the final ADMIN cannot be disabled (self-disable blocked)', async () => {
      const admin = await createUser('ADMIN', { name: 'Sole Admin' });
      const res = await request(app)
        .post(`/api/users/${admin.id}/disable`)
        .set('Authorization', `Bearer ${devTokenFor(admin)}`);
      expect(res.status).toBe(409);
    });

    it('16b. with two admins, one may disable the other and the disabled one loses access', async () => {
      const adminA = await createUser('ADMIN', { name: 'Admin A' });
      const adminB = await createUser('ADMIN', { name: 'Admin B' });
      cognitoState.users.set(adminB.email, {
        sub: adminB.cognitoSub,
        username: adminB.email,
        enabled: true,
        status: 'ACTIVE',
      });

      const disable = await request(app)
        .post(`/api/users/${adminB.id}/disable`)
        .set('Authorization', `Bearer ${devTokenFor(adminA)}`);
      expect(disable.status).toBe(200);

      const bToken = signCognitoAccessToken(adminB.cognitoSub);
      const access = await request(app).get('/api/customers').set('Authorization', `Bearer ${bToken}`);
      expect(access.status).toBe(403);
      expect(access.body.error.code).toBe('USER_DISABLED');
    });

    it('17. the final ADMIN cannot demote themselves (LAST_ADMIN)', async () => {
      const admin = await createUser('ADMIN', { name: 'Sole Admin' });
      const res = await request(app)
        .patch(`/api/users/${admin.id}/role`)
        .set('Authorization', `Bearer ${devTokenFor(admin)}`)
        .send({ role: 'SALES' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('LAST_ADMIN');
    });

    it('17b. an admin may promote an employee to ADMIN (controlled action)', async () => {
      const auth = await adminAuth();
      const target = await createUser('SALES', { name: 'Future Admin' });
      const res = await request(app)
        .patch(`/api/users/${target.id}/role`)
        .set('Authorization', auth)
        .send({ role: 'ADMIN' });
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('ADMIN');
    });

    it('resend-invitation works for INVITED users and asks Cognito to RESEND', async () => {
      const auth = await adminAuth();
      const invite = await request(app)
        .post('/api/users/invite')
        .set('Authorization', auth)
        .send({ name: 'Waiting', email: 'waiting@example.com', role: 'SALES' });
      const id = invite.body.data.user.id;

      const res = await request(app)
        .post(`/api/users/${id}/resend-invitation`)
        .set('Authorization', auth);
      expect(res.status).toBe(200);
      const lastCall = cognitoState.createCalls[cognitoState.createCalls.length - 1];
      expect(lastCall?.username).toBe('waiting@example.com');
      expect(lastCall?.messageAction).toBe('RESEND');
    });

    it('resend-invitation is refused for ACTIVE users', async () => {
      const auth = await adminAuth();
      const active = await createUser('SALES', { name: 'Active' });
      const res = await request(app)
        .post(`/api/users/${active.id}/resend-invitation`)
        .set('Authorization', auth);
      expect(res.status).toBe(409);
    });

    it('user list supports status and role filters', async () => {
      const auth = await adminAuth();
      await createUser('SALES', { name: 'A Sales' });
      await createUser('WAREHOUSE', { name: 'A Warehouse' });
      await createUser('SALES', { name: 'B Sales', status: 'INVITED' });

      const byRole = await request(app).get('/api/users?role=WAREHOUSE').set('Authorization', auth);
      expect(byRole.body.data.total).toBe(1);
      expect(byRole.body.data.items.every((u: { role: string }) => u.role === 'WAREHOUSE')).toBe(true);

      const byStatus = await request(app).get('/api/users?status=INVITED').set('Authorization', auth);
      expect(byStatus.body.data.total).toBe(1);
      expect(byStatus.body.data.items[0].status).toBe('INVITED');

      const search = await request(app).get('/api/users?search=B%20Sales').set('Authorization', auth);
      expect(search.body.data.total).toBe(1);
    });
  });
});
