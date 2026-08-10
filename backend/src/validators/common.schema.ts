import { z } from 'zod';

export const uuidSchema = z.string().uuid('Invalid UUID');

export const idParamSchema = z.object({
  id: uuidSchema,
});

export const customerIdParamSchema = z.object({
  customerId: uuidSchema,
});

export const productIdParamSchema = z.object({
  productId: uuidSchema,
});

/** Shared pagination + search + sort query validation. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  sortBy: z.string().trim().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Optional string that turns an explicit '' into null (allows clearing a field)
 * while leaving a missing key as undefined (allows PATCH partial updates).
 */
export const emptyToNull = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? null : v));

/** Money with at most 2 decimal places (fits Decimal(12,2)). */
export const moneySchema = z
  .number()
  .positive('Unit price must be positive')
  .max(9999999999.99, 'Price too large')
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: 'Price can have at most 2 decimal places',
  });