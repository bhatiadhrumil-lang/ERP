import jwt from 'jsonwebtoken';
import type { User, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { ApiError, ErrorCodes } from '../utils/ApiError';

const userSelect = {
  id: true,
  cognitoSub: true,
  name: true,
  email: true,
  role: true,
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

export async function findUserForDevLogin(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, cognitoSub: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user) throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'No dev user found with that email');
  if (!user.isActive) throw new ApiError(403, ErrorCodes.FORBIDDEN, 'User account is disabled');
  return user;
}

export type { UserRole };