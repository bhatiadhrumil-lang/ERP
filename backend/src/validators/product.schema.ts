import { z } from 'zod';
import { moneySchema, optionalQueryBoolean, paginationQuerySchema } from './common.schema';

export const productListQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().max(60).optional(),
  isActive: optionalQueryBoolean,
  lowStock: optionalQueryBoolean,
});

export const createProductSchema = z
  .object({
    sku: z.string().trim().min(2, 'SKU is required').max(50),
    name: z.string().trim().min(2, 'Name is required').max(160),
    category: z.string().trim().min(1, 'Category is required').max(60),
    unitPrice: moneySchema,
    minimumStock: z.coerce.number().int().min(0).default(5),
    warehouseLocation: z.string().trim().min(1, 'Warehouse location is required').max(80),
    isActive: z.boolean().optional(),
    /** Optional starting stock; creates an IN movement when provided. */
    initialQuantity: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export const updateProductSchema = createProductSchema.omit({ initialQuantity: true }).partial();