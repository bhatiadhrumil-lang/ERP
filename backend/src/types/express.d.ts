import type { AuthenticatedUser, ListQuery } from './index';
import type { CognitoClaims } from '../middleware/authMiddleware';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware. */
      user?: AuthenticatedUser;
      /** Set by the requireCognitoOnly middleware (bootstrap flow). */
      cognitoClaims?: CognitoClaims;
      /** Set by the validate middleware: { params?, query?, body? } */
      validated?: {
        params?: Record<string, string>;
        query?: Record<string, unknown> & ListQuery;
        body?: unknown;
      };
    }
  }
}

export {};