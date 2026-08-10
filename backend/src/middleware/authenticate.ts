import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import type { AuthenticatedUser } from '../types';

interface VerifiedClaims {
  sub: string;
  tokenType: 'cognito' | 'dev';
}

/**
 * Production strategy: validate an AWS Cognito access token.
 * - Verifies RS256 signature against the Cognito user pool's JWKS
 * - Enforces issuer (user pool) and audience (app client)
 * - The user's role always comes from the users table (never from token claims)
 */
const cognitoJwks: ReturnType<typeof createRemoteJWKSet> | null = (() => {
  if (!env.COGNITO_USER_POOL_ID) return null;
  const issuer = `https://cognito-idp.${env.AWS_REGION}.amazonaws.com/${env.COGNITO_USER_POOL_ID}`;
  return createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
})();

async function verifyCognitoToken(token: string): Promise<VerifiedClaims> {
  if (!cognitoJwks || !env.COGNITO_USER_POOL_ID || !env.COGNITO_CLIENT_ID) {
    throw new ApiError(500, ErrorCodes.AUTH_CONFIG_ERROR, 'Cognito is not configured on the server');
  }
  const issuer = `https://cognito-idp.${env.AWS_REGION}.amazonaws.com/${env.COGNITO_USER_POOL_ID}`;
  try {
    const { payload } = await jwtVerify(token, cognitoJwks, {
      issuer,
      audience: env.COGNITO_CLIENT_ID,
      algorithms: ['RS256'],
    });
    if (!payload.sub) throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Token has no subject');
    return { sub: payload.sub, tokenType: 'cognito' };
  } catch {
    throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Invalid or expired token');
  }
}

/**
 * Development-only strategy: validate a locally-signed HS256 JWT issued by
 * POST /api/auth/dev-login. NEVER enabled in production — the production path
 * exclusively accepts Cognito tokens.
 */
function verifyDevToken(token: string): VerifiedClaims {
  if (env.isProduction) {
    throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Dev tokens are not accepted in production');
  }
  if (!env.DEV_JWT_SECRET) {
    throw new ApiError(500, ErrorCodes.AUTH_CONFIG_ERROR, 'DEV_JWT_SECRET is not configured');
  }
  try {
    const payload = jwt.verify(token, env.DEV_JWT_SECRET, {
      issuer: 'mini-erp-dev',
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    if (!payload.sub) throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Token has no subject');
    return { sub: payload.sub, tokenType: 'dev' };
  } catch {
    throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Invalid or expired token');
  }
}

/**
 * Authentication middleware.
 * Accepts a Bearer JWT (Cognito in production, dev-signed outside production),
 * resolves the matching application user from the users table, and attaches
 * it to req.user. Role is always read from the database.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();

    const claims = env.isProduction
      ? await verifyCognitoToken(token)
      : verifyDevToken(token);

    const user = await prisma.user.findUnique({ where: { cognitoSub: claims.sub } });
    if (!user) {
      throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'User not found for this token');
    }
    if (!user.isActive) {
      throw new ApiError(403, ErrorCodes.FORBIDDEN, 'User account is disabled');
    }

    const authUser: AuthenticatedUser = {
      id: user.id,
      cognitoSub: user.cognitoSub,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    req.user = authUser;
    next();
  } catch (err) {
    next(err);
  }
}