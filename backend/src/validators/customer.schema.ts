import { z } from 'zod';
import { emptyToNull, optionalQueryEnum, paginationQuerySchema } from './common.schema';

export const customerListQuerySchema = paginationQuerySchema.extend({
  customerType: optionalQueryEnum(['RETAIL', 'WHOLESALE', 'DISTRIBUTOR']),
  status: optionalQueryEnum(['LEAD', 'ACTIVE', 'INACTIVE']),
});

export const createCustomerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(120),
    mobile: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s-]{8,15}$/, 'Invalid mobile number'),
    email: emptyToNull(120).refine((v) => v === null || z.string().email().safeParse(v).success, {
      message: 'Invalid email address',
    }),
    businessName: z.string().trim().min(2, 'Business name is required').max(160),
    gstNumber: emptyToNull(20),
    customerType: z.enum(['RETAIL', 'WHOLESALE', 'DISTRIBUTOR']),
    status: z.enum(['LEAD', 'ACTIVE', 'INACTIVE']).optional(),
    address: emptyToNull(500),
    nextFollowUpDate: z.coerce.date().optional().nullable(),
    notes: emptyToNull(2000),
  })
  .strict();

export const updateCustomerSchema = createCustomerSchema.partial();