import { z } from 'zod';

/** Development-login payload (dev mode only) — email of a seeded user. */
export const devLoginSchema = z
  .object({
    email: z.string().trim().email('Invalid email'),
  })
  .strict();