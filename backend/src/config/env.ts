import dotenv from 'dotenv';
import { z } from 'zod';

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