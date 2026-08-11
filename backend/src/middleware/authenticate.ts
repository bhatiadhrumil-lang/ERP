/**
 * Backwards-compatible alias.
 *
 * The authentication middleware (Cognito JWT verification + dev-token
 * fallback + PostgreSQL user resolution) lives in `authMiddleware.ts`;
 * existing route files import it from `./authenticate`.
 */
export { authenticate, requireCognitoOnly } from './authMiddleware';
export type { CognitoClaims } from './authMiddleware';
