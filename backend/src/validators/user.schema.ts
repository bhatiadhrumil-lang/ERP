import { z } from 'zod';
import { optionalQueryBoolean, optionalQueryEnum, paginationQuerySchema } from './common.schema';

export const userListQuerySchema = paginationQuerySchema.extend({
  role: optionalQueryEnum(['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS']),
  status: optionalQueryEnum(['INVITED', 'ACTIVE', 'DISABLED']),
  isActive: optionalQueryBoolean,
});

/**
 * Invite an employee. The invitee's role is chosen by the ADMIN — ADMIN is
 * deliberately NOT a selectable target role here: new administrators can only
 * be created by the first-admin bootstrap or by an explicit role change.
 */
export const inviteUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(120),
    email: z.string().trim().email('Enter a valid email address').max(254),
    role: z.enum(['SALES', 'WAREHOUSE', 'ACCOUNTS']),
  })
  .strict();

/** Role change (admin-only). ADMIN is an allowed TARGET here (controlled promotion). */
export const changeRoleSchema = z
  .object({
    role: z.enum(['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS']),
  })
  .strict();

/** Profile edits only — role changes and disable/enable have dedicated endpoints. */
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(120).optional(),
  })
  .strict();
