import type { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/response';
import * as userService from '../services/user.service';
import {
  changeRoleSchema,
  inviteUserSchema,
  updateUserSchema,
  userListQuerySchema,
} from '../validators/user.schema';
import { idParamSchema } from '../validators/common.schema';

export const userController = {
  list: asyncHandler(async (req, res) => {
    const query = req.validated!.query as z.infer<typeof userListQuerySchema>;
    ok(res, await userService.listUsers(query));
  }),

  getById: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    ok(res, { user: await userService.getUserById(id) });
  }),

  /** POST /api/users/invite — create a Cognito identity + INVITED app user. */
  invite: asyncHandler(async (req, res) => {
    const body = req.validated!.body as z.infer<typeof inviteUserSchema>;
    // Dev mode returns tempPassword (undefined in Cognito mode) so the admin can
    // hand the credentials to the employee — no email is sent without AWS.
    const { user, tempPassword } = await userService.inviteUser(body, req.user!.id);
    ok(res, { user, ...(tempPassword ? { tempPassword } : {}) });
  }),

  /** PATCH /api/users/:id/role — controlled role change (incl. promotion to ADMIN). */
  changeRole: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    const { role } = req.validated!.body as z.infer<typeof changeRoleSchema>;
    ok(res, { user: await userService.changeUserRole(id, role, req.user!.id) });
  }),

  /** POST /api/users/:id/disable — DB-first lockout + Cognito AdminDisableUser. */
  disable: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    ok(res, { user: await userService.disableUser(id, req.user!.id) });
  }),

  /** POST /api/users/:id/enable — restore access + Cognito AdminEnableUser. */
  enable: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    ok(res, { user: await userService.enableUser(id, req.user!.id) });
  }),

  /** POST /api/users/:id/resend-invitation — INVITED users only. */
  resendInvitation: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    const { user, tempPassword } = await userService.resendInvitation(id, req.user!.id);
    ok(res, { user, ...(tempPassword ? { tempPassword } : {}) });
  }),

  /** PATCH /api/users/:id — profile edits only (name). */
  update: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    const body = req.validated!.body as z.infer<typeof updateUserSchema>;
    ok(res, { user: await userService.updateUser(id, body, req.user!.id) });
  }),
};
