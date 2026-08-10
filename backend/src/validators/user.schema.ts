import { z } from 'zod';
import { paginationQuerySchema } from './common.schema';

export const userListQuerySchema = paginationQuerySchema.extend({
  role: z.enum(['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS']).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(120).optional(),
    role: z.enum(['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS']).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();