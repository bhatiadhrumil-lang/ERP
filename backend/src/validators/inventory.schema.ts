import { z } from 'zod';
import { paginationQuerySchema } from './common.schema';

export const inventoryListQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().max(60).optional(),
  lowStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const movementsListQuerySchema = paginationQuerySchema.extend({
  productId: z.string().uuid('Invalid product id').optional(),
  movementType: z.enum(['IN', 'OUT']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const adjustInventorySchema = z
  .object({
    movementType: z.enum(['IN', 'OUT']),
    quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(1_000_000),
    reason: z.string().trim().min(3, 'Reason is required').max(300),
  })
  .strict();