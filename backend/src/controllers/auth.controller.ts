import type { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/response';
import * as authService from '../services/auth.service';
import { devLoginSchema } from '../validators/auth.schema';

export const authController = {
  /** GET /api/auth/me — current user (always read fresh from the DB). */
  me: asyncHandler(async (req, res) => {
    ok(res, await authService.getCurrentUser(req.user!.id));
  }),

  /**
   * POST /api/auth/dev-login — development only.
   * Exchanges a seeded user's email for a locally-signed JWT.
   */
  devLogin: asyncHandler(async (req, res) => {
    const { email } = req.validated!.body as z.infer<typeof devLoginSchema>;
    const user = await authService.findUserForDevLogin(email);
    const token = authService.signDevToken(user);
    ok(res, { token, tokenType: 'dev', user });
  }),
};