import { z } from 'zod';
import { optionalQueryEnum, optionalQueryUuid, paginationQuerySchema } from './common.schema';

export const challanListQuerySchema = paginationQuerySchema.extend({
  customerId: optionalQueryUuid,
  status: optionalQueryEnum(['DRAFT', 'CONFIRMED', 'CANCELLED']),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const createChallanSchema = z
  .object({
    customerId: z.string().uuid('Invalid customer id'),
    items: z
      .array(
        z.object({
          productId: z.string().uuid('Invalid product id'),
          quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(1_000_000),
        }),
      )
      .min(1, 'At least one item is required')
      .max(100, 'Too many items'),
  })
  .strict();

export const updateChallanSchema = z
  .object({
    customerId: z.string().uuid('Invalid customer id').optional(),
    items: createChallanSchema.shape.items.optional(),
  })
  .strict()