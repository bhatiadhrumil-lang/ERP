import type { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/response';
import * as userService from '../services/user.service';
import { updateUserSchema, userListQuerySchema } from '../validators/user.schema';
import { idParamSchema } from '../validators/common.schema';

export const userController = {
  list: asyncHandler(async (req, res) => {
    const query = req.validated!.query as z.infer<typeof userListQuerySchema>;
    ok(res, await userService.listUsers(query));
  }),

  getById: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    ok(res, await userService.getUserById(id));
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    const body = req.validated!.body as z.infer<typeof updateUserSchema>;
    ok(res, await userService.updateUser(id, body, req.user!.id));
  }),
};