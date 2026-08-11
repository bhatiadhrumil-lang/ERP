import type { NextFunction, Request, Response } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { CognitoJwtVerifierSingleUserPool } from 'aws-jwt-verify/cognito-verifier';
import type { Jwks } from 'aws-jwt-verify/jwk';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { env, getCognitoConfig, getOnboardingDefaultRole, getOnboardingPolicy } from '../config/env';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import type { AuthenticatedUser } from '../types';

/** Claims extracted from a verified token. Role NEVER comes from the token. */
interface VerifiedClaims {
  sub: string;
  email?: string;
  name?: string;
  username?: string;
  tokenType: 'cognito' | 'dev';
}

/** Public shape of verified Cognito claims (used by the bootstrap flow). */
export type CognitoClaims = Pick<VerifiedClaims, 'sub' | 'email' | 'name' | 'username'>;

type CognitoVerifier = CognitoJwtVerifierSingleUserPool<{
  userPoolId: string;
  tokenUse: 'access';
  clientId: string;
}>;

type CognitoIdVerifier = CognitoJwtVerifierSingleUserPool<{
  userPoolId: string;
  tokenUse: 'id';
  clientId: string;
}>;

/**
 * Cognito verifier, created lazily and cached keyed by the exact configuration
 * (user pool + app client). The JWKS endpoint is fetched from the user pool
 * automatically on first verification — signing keys are never hardcoded.
 */
let verifierCache: { key: string; verifier: CognitoVerifier } | null = null;

function getCognitoVerifier(): CognitoVerifier | null {
  const { poolId, clientId } = getCognitoConfig();
  if (!poolId || !clientId) return null;
  const key = `${poolId}|${clientId}`;
  if (verifierCache?.key === key) return verifierCache.verifier;
  const verifier = CognitoJwtVerifier.create<{ userPoolId: string; tokenUse: 'access'; clientId: string }>({
    userPoolId: poolId,
    tokenUse: 'access',
    clientId,
  }) as CognitoVerifier;
  verifierCache = { key, verifier };
  return verifier;
}

/** ID-token verifier (same pool/JWKS, token_use=id). Cached separately. */
let idVerifierCache: { key: string; verifier: CognitoIdVerifier } | null = null;

function getCognitoIdVerifier(): CognitoIdVerifier | null {
  const { poolId, clientId } = getCognitoConfig();
  if (!poolId || !clientId) return null;
  const key = `${poolId}|${clientId}`;
  if (idVerifierCache?.key === key) return idVerifierCache.verifier;
  const verifier = CognitoJwtVerifier.create<{ userPoolId: string; tokenUse: 'id'; clientId: string }>({
    userPoolId: poolId,
    tokenUse: 'id',
    clientId,
  }) as CognitoIdVerifier;
  idVerifierCache = { key, verifier };
  return verifier;
}

/**
 * Test seam: injects a fixed JWKS into the cached verifiers (access + id) so
 * the test suite can mint/verify real RS256 tokens without a network fetch to
 * AWS. Never called in production code paths.
 */
export function __injectJwksForTests(jwks: Jwks): void {
  const accessVerifier = getCognitoVerifier();
  if (accessVerifier) accessVerifier.cacheJwks(jwks);
  const idVerifier = getCognitoIdVerifier();
  if (idVerifier) idVerifier.cacheJwks(jwks);
}

/**
 * Validate a Cognito access token:
 *  - RS256 signature against the user pool's JWKS (auto-fetched)
 *  - issuer (the user pool), token_use (access), app client id (client_id claim)
 *  - expired, malformed and wrongly-signed tokens are all rejected
 */
async function verifyCognitoToken(token: string): Promise<VerifiedClaims> {
  const verifier = getCognitoVerifier();
  if (!verifier) {
    throw new ApiError(500, ErrorCodes.AUTH_CONFIG_ERROR, 'Cognito is not configured on the server');
  }
  try {
    const payload = await verifier.verify(token);
    if (!payload.sub) throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Token has no subject');
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      username: typeof payload.username === 'string' ? payload.username : undefined,
      tokenType: 'cognito',
    };
  } catch {
    // Never leak JWT verification details to the client.
    throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Invalid or expired token');
  }
}

/**
 * Verify a Cognito access token WITHOUT resolving an application user.
 *
 * Used by the first-admin bootstrap route: the bootstrap identity has no
 * `users` row yet (creating it IS the operation), so the normal
 * `authenticate` middleware (which resolves the app user) cannot be used.
 * Accepts Cognito tokens only — never dev tokens.
 */
export async function verifyCognitoTokenOnly(token: string): Promise<VerifiedClaims> {
  return verifyCognitoToken(token);
}

/**
 * Verify a Cognito ID token (token_use=id) — same pool/JWKS as the access
 * verifier. ID tokens carry the user attributes (email, name) that access
 * tokens omit. Used by the bootstrap flow to recover the admin's real email
 * on pools where Cognito generates UUID usernames (email is an alias).
 * Returns claims with tokenType 'cognito'; never resolves an app user.
 */
export async function verifyCognitoIdTokenOnly(token: string): Promise<VerifiedClaims> {
  const verifier = getCognitoIdVerifier();
  if (!verifier) {
    throw new ApiError(500, ErrorCodes.AUTH_CONFIG_ERROR, 'Cognito is not configured on the server');
  }
  try {
    const payload = await verifier.verify(token);
    if (!payload.sub) throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Token has no subject');
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      username: typeof payload.username === 'string' ? payload.username : undefined,
      tokenType: 'cognito',
    };
  } catch {
    throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Invalid or expired token');
  }
}

/**
 * Express middleware: verifies a Cognito access token and attaches the claims
 * to `req.cognitoClaims` WITHOUT resolving an application user. Used by the
 * first-admin bootstrap route (see verifyCognitoTokenOnly).
 */
export async function requireCognitoOnly(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Authentication required');
    }
    const token = header.slice('Bearer '.length).trim();
    req.cognitoClaims = await verifyCognitoToken(token);
    next();
  } catch (err) {
    next(err);
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
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      tokenType: 'dev',
    };
  } catch {
    throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Invalid or expired token');
  }
}

/**
 * Cognito sub → PostgreSQL user synchronization.
 *
 * Cognito owns identity; PostgreSQL owns the ERP user (role, status, isActive).
 * The application user is always looked up fresh from the database — the token
 * never carries the ERP role, and no user-supplied role header is ever trusted.
 *
 * Lifecycle handling:
 *  - DISABLED users are rejected with 403 USER_DISABLED even though Cognito
 *    authentication succeeded — the app database is the authorization authority.
 *  - INVITED users (admin-created, first-time password setup not yet completed)
 *    become ACTIVE on their first authenticated request: a valid Cognito access
 *    token can only exist after onboarding completed, so reaching this point IS
 *    the completion signal.
 *
 * Unknown identities are handled per the configured onboarding policy:
 *  - `admin` (default): reject with 403 until an administrator provisions the user.
 *  - `auto`: create the user with the safe default role (SALES) — never ADMIN.
 */
async function resolveAppUser(claims: VerifiedClaims): Promise<AuthenticatedUser> {
  const existing = await prisma.user.findUnique({ where: { cognitoSub: claims.sub } });
  if (existing) {
    if (existing.status === 'DISABLED' || !existing.isActive) {
      throw new ApiError(
        403,
        ErrorCodes.USER_DISABLED,
        'Your account has been disabled. Contact an administrator.',
      );
    }
    if (existing.status === 'INVITED') {
      await prisma.user.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE', isActive: true },
      });
    }
    return {
      id: existing.id,
      cognitoSub: existing.cognitoSub,
      name: existing.name,
      email: existing.email,
      role: existing.role,
      status: existing.status === 'INVITED' ? 'ACTIVE' : existing.status,
    };
  }

  if (getOnboardingPolicy() !== 'auto') {
    throw new ApiError(403, ErrorCodes.FORBIDDEN, 'Account not provisioned. Contact an administrator.');
  }

  const email = claims.email ?? claims.username;
  if (!email) {
    throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Token does not carry an email claim');
  }
  const name = claims.name ?? email.split('@')[0] ?? email;
  const created = await prisma.user.upsert({
    where: { cognitoSub: claims.sub },
    update: {},
    create: {
      cognitoSub: claims.sub,
      name,
      email: email.toLowerCase(),
      role: getOnboardingDefaultRole(),
      status: 'ACTIVE',
      isActive: true,
    },
  });
  return {
    id: created.id,
    cognitoSub: created.cognitoSub,
    name: created.name,
    email: created.email,
    role: created.role,
    status: created.status,
  };
}

/**
 * Authentication middleware.
 *
 * Strategy is selected by configuration (read live for testability):
 *  - Cognito configured → Cognito access tokens are accepted (any env).
 *  - Outside production with DEV_AUTH_ENABLED, a locally-signed dev token is
 *    also accepted as a fallback so seeded users keep working in development
 *    even when a real user pool is configured (Cognito is tried first).
 *  - Production accepts ONLY Cognito tokens; otherwise → 500
 *    AUTH_CONFIG_ERROR (fails fast on a broken setup).
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Authentication required');
    }
    const token = header.slice('Bearer '.length).trim();

    let claims: VerifiedClaims | null = null;
    const cognito = getCognitoConfig();
    const devEnabled = env.isDevAuthEnabled;

    if (cognito.poolId && cognito.clientId) {
      try {
        claims = await verifyCognitoToken(token);
      } catch (err) {
        if (!devEnabled) throw err;
        // Development convenience: fall through to the dev verifier below.
      }
    }

    if (!claims) {
      if (!devEnabled) {
        throw new ApiError(500, ErrorCodes.AUTH_CONFIG_ERROR, 'No authentication strategy is configured');
      }
      claims = verifyDevToken(token);
    }

    req.user = await resolveAppUser(claims);
    next();
  } catch (err) {
    next(err);
  }
}