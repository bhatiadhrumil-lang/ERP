import jwt from 'jsonwebtoken';
import type { User, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { verifyDevPassword } from './devPassword';

const userSelect = {
  id: true,
  cognitoSub: true,
  name: true,
  email: true,
  role: true,
  status: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Current user as seen by /api/auth/me — always read fresh from the DB. */
export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user) throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'User not found');
  return user;
}

/** True once at least one non-disabled ADMIN application user exists. */
export async function isAdminInitialized(): Promise<boolean> {
  const adminCount = await prisma.user.count({
    where: { role: 'ADMIN', status: { not: 'DISABLED' } },
  });
  return adminCount > 0;
}

/**
 * Advisory lock key for the bootstrap critical section. A fixed Postgres
 * advisory lock serializes concurrent bootstrap attempts so exactly one
 * ADMIN can ever be created through the public bootstrap path.
 */
const BOOTSTRAP_LOCK_KEY = 727001;

/**
 * First-admin bootstrap: grants the ADMIN role to a verified Cognito identity
 * that has no application user row yet. This is the ONLY public path that can
 * ever create an ADMIN — the role is never accepted from request input.
 *
 * Race-safe: a Postgres advisory xact lock serializes concurrent attempts,
 * and the admin-existence check happens inside the same transaction.
 *
 * Email source: Cognito ACCESS tokens carry `username` (the signup email, since
 * this app uses email as the Cognito username) but NOT the `email` claim —
 * that lives in the ID token. So bootstrap falls back to `username` when
 * `email` is absent.
 */
export async function bootstrapAdmin(claims: { sub: string; email?: string; name?: string; username?: string }) {
  const email = (claims.email ?? claims.username ?? '').trim().toLowerCase();
  if (!email) {
    throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Token does not carry an email claim');
  }

  const existing = await prisma.user.findUnique({ where: { cognitoSub: claims.sub } });
  if (existing) {
    throw new ApiError(
      409,
      ErrorCodes.USER_ALREADY_PROVISIONED,
      'This Cognito identity is already provisioned in the application',
    );
  }

  const name = claims.name?.trim() || email.split('@')[0] || email;

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`;
    const adminCount = await tx.user.count({
      where: { role: 'ADMIN', status: { not: 'DISABLED' } },
    });
    if (adminCount > 0) {
      throw new ApiError(
        409,
        ErrorCodes.ADMIN_ALREADY_INITIALIZED,
        'Initial administrator setup has already been completed.',
      );
    }
    return tx.user.create({
      data: {
        cognitoSub: claims.sub,
        name,
        email,
        role: 'ADMIN',
        status: 'ACTIVE',
        isActive: true,
      },
      select: userSelect,
    });
  });

  logger.info(`[audit] action=bootstrap-admin actor=${email} role=ADMIN`);
  return created;
}

/**
 * Development-only login: exchanges a seeded user's email for a locally-signed
 * JWT. Never mounted in production — production tokens come exclusively from
 * AWS Cognito. No passwords exist anywhere in this system.
 */
export function signDevToken(user: Pick<User, 'cognitoSub' | 'name' | 'email' | 'role'>): string {
  if (!env.DEV_JWT_SECRET) {
    throw new ApiError(500, ErrorCodes.AUTH_CONFIG_ERROR, 'DEV_JWT_SECRET is not configured');
  }
  return jwt.sign(
    {
      sub: user.cognitoSub,
      role: user.role,
      name: user.name,
      email: user.email,
      tokenType: 'dev',
    },
    env.DEV_JWT_SECRET,
    {
      issuer: 'mini-erp-dev',
      audience: 'mini-erp-frontend',
      algorithm: 'HS256',
      expiresIn: '12h',
    },
  );
}

export async function findUserForDevLogin(email: string, password?: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      cognitoSub: true,
      name: true,
      email: true,
      role: true,
      status: true,
      isActive: true,
      devPasswordHash: true,
    },
  });
  if (!user) throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'No dev user found with that email');
  if (user.status === 'DISABLED' || !user.isActive) {
    throw new ApiError(403, ErrorCodes.USER_DISABLED, 'Your account has been disabled. Contact an administrator.');
  }
  // Dev-created accounts (invites without Cognito) are protected by the temp
  // password. Cognito-backed users (seeded, bootstrap admin) have no local
  // password and keep the legacy email-only dev-login.
  if (user.devPasswordHash) {
    if (!password) {
      throw new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Password is required for this account');
    }
    if (!verifyDevPassword(password, user.devPasswordHash)) {
      throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Incorrect email or password.');
    }
  }
  const { devPasswordHash: _hash, ...safe } = user;
  return safe;
}

export type { UserRole };