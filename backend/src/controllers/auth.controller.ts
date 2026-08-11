import type { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/response';
import * as authService from '../services/auth.service';
import { verifyCognitoIdTokenOnly } from '../middleware/authMiddleware';
import { devLoginSchema } from '../validators/auth.schema';

export const authController = {
  /** GET /api/auth/me — current user (always read fresh from the DB). */
  me: asyncHandler(async (req, res) => {
    ok(res, { user: await authService.getCurrentUser(req.user!.id) });
  }),

  /**
   * GET /api/auth/bootstrap-status — public. Tells the frontend whether the
   * first-admin setup flow may still run. The backend remains the authority:
   * bootstrap-admin re-checks inside a lock, so hiding the UI is never enough.
   */
  bootstrapStatus: asyncHandler(async (_req, res) => {
    ok(res, { initialized: await authService.isAdminInitialized() });
  }),

  /**
   * POST /api/auth/bootstrap-admin — first-admin bootstrap.
   * Requires a verified Cognito access token (requireCognitoOnly); the Cognito
   * `sub` becomes the application user's cognitoSub with role ADMIN. Rejected
   * with ADMIN_ALREADY_INITIALIZED once any ADMIN exists.
   *
   * The optional body `idToken` (Cognito ID token) supplies the user's real
   * email/name: access tokens carry neither when the pool uses UUID usernames
   * (email as alias). The ID token is verified against the same pool/JWKS.
   */
  bootstrapAdmin: asyncHandler(async (req, res) => {
    const claims = req.cognitoClaims!;
    const idToken = (req.body as { idToken?: unknown } | undefined)?.idToken;
    let identity = claims;
    if (typeof idToken === 'string' && idToken.length > 0) {
      try {
        const idClaims = await verifyCognitoIdTokenOnly(idToken);
        identity = {
          ...claims,
          email: idClaims.email ?? claims.email,
          name: idClaims.name ?? claims.name,
        };
      } catch {
        // The access token already proved identity (sub); email/name are
        // metadata — fall back to the access-token claims rather than fail.
      }
    }
    ok(res, { user: await authService.bootstrapAdmin(identity) });
  }),

  /**
   * POST /api/auth/dev-login — development only.
   * Exchanges a seeded user's email for a locally-signed JWT.
   */
  devLogin: asyncHandler(async (req, res) => {
    const { email, password } = req.validated!.body as z.infer<typeof devLoginSchema>;
    const user = await authService.findUserForDevLogin(email, password);
    const token = authService.signDevToken(user);
    ok(res, { token, tokenType: 'dev', user });
  }),
};