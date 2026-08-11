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

/**
 * Optional enum QUERY parameter: an explicit '' (what an "All/Any" select
 * sends) is treated as absent, so list endpoints accept `?status=` without
 * failing validation. Missing keys stay undefined; invalid non-empty values
 * are still rejected.
 *
 * The cast restores the literal union: zod widens to `string` when the enum
 * tuple arrives through a generic parameter.
 */
export const optionalQueryEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(values as unknown as [string, ...string[]]).optional(),
  ) as z.ZodType<T[number] | undefined>;

/** Optional UUID QUERY parameter: an explicit '' is treated as absent. */
export const optionalQueryUuid = z.preprocess((v) => (v === '' ? undefined : v), uuidSchema.optional());

/**
 * Optional boolean QUERY parameter ('true'/'false'): '' or missing is treated
 * as absent; present values are coerced to real booleans.
 */
export const optionalQueryBoolean = z.preprocess(
  (v) => (v === '' || v === undefined ? undefined : v),
  z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
);

/** Money with at most 2 decimal places (fits Decimal(12,2)). */
export const moneySchema = z
  .number()
  .positive('Unit price must be positive')
  .max(9999999999.99, 'Price too large')
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: 'Price can have at most 2 decimal places',
  });