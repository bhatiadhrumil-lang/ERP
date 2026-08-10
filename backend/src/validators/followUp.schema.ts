import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.schema';

export const followUpListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  assignedToId: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const createFollowUpSchema = z
  .object({
    followUpDate: z.coerce.date(),
    notes: z.string().trim().min(1, 'Notes are required').max(2000),
    assignedToId: uuidSchema.optional().nullable(),
    status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  })
  .strict();

export const updateFollowUpSchema = createFollowUpSchema.partial();