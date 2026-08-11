import { z } from 'zod';

/**
 * Development-login payload (dev mode only).
 * `password` is required for dev-created accounts (temp password from the
 * invite); seeded/Cognito users without a local password keep the legacy
 * email-only behavior.
 */
export const devLoginSchema = z
  .object({
    email: z.string().trim().email('Invalid email'),
    password: z.string().optional(),
  })
  .strict();