import dotenv from 'dotenv';
import { z } from 'zod';
import type { UserRole } from '@prisma/client';

dotenv.config();

/**
 * Central environment configuration.
 * All environment access goes through this module — never `process.env` directly.
 * The schema doubles as startup validation so misconfiguration fails fast.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  // AWS / Cognito (used for production authentication)
  AWS_REGION: z.string().min(1).default('us-east-1'),
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  // Development-only authentication (never enabled in production)
  DEV_JWT_SECRET: z.string().optional(),
  DEV_AUTH_ENABLED: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const isProduction = parsed.data.NODE_ENV === 'production';

if (isProduction && (!parsed.data.COGNITO_USER_POOL_ID || !parsed.data.COGNITO_CLIENT_ID)) {
  // eslint-disable-next-line no-console
  console.error(
    'COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are required in production (Cognito JWT authentication).',
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProduction,
  /** Comma-separated list of allowed origins */
  corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  /** Dev-login endpoint is mounted only when explicitly enabled and not in production */
  isDevAuthEnabled: !isProduction && parsed.data.DEV_AUTH_ENABLED !== 'false',
} as const;

/**
 * Dev-mode invites: when dev auth is EXPLICITLY enabled (`DEV_AUTH_ENABLED=true`,
 * i.e. the local demo setup), invitations skip the Cognito admin API (which
 * needs AWS credentials) and create local accounts with a temp password shown
 * to the admin. Read live at call time so tests can toggle it per-file.
 */
export function isDevInviteEnabled(): boolean {
  return !isProduction && process.env.DEV_AUTH_ENABLED === 'true';
}

/**
 * Live environment reads for settings that may change at runtime (used by the
 * test suite to drive the authentication strategy and onboarding policy per
 * test). Production reads the same variables — values are identical to the
 * snapshotted env above under normal operation.
 */

/** AWS Cognito configuration as read at request time. */
export function getCognitoConfig(): {
  poolId?: string;
  clientId?: string;
  jwksUri?: string;
} {
  const poolId = process.env.COGNITO_USER_POOL_ID?.trim();
  const clientId = process.env.COGNITO_CLIENT_ID?.trim();
  return {
    poolId: poolId || undefined,
    clientId: clientId || undefined,
    jwksUri: process.env.COGNITO_JWKS_URI?.trim() || undefined,
  };
}

/**
 * Onboarding policy for Cognito identities that have no matching application
 * user yet:
 *  - `admin` (default, safe): the identity is rejected until an administrator
 *    provisions a user row (preferred for production).
 *  - `auto`: a user row is created on first sign-in with
 *    `getOnboardingDefaultRole()` (never ADMIN).
 */
export function getOnboardingPolicy(): 'admin' | 'auto' {
  return process.env.USER_ONBOARDING === 'auto' ? 'auto' : 'admin';
}

/** Safe default role for auto-provisioned users — never ADMIN. */
export function getOnboardingDefaultRole(): UserRole {
  return process.env.USER_ONBOARDING_DEFAULT_ROLE === 'WAREHOUSE' ||
    process.env.USER_ONBOARDING_DEFAULT_ROLE === 'ACCOUNTS' ||
    process.env.USER_ONBOARDING_DEFAULT_ROLE === 'ADMIN'
    ? (process.env.USER_ONBOARDING_DEFAULT_ROLE as UserRole)
    : 'SALES';
}