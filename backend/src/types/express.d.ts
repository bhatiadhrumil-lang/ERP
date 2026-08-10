import type { AuthenticatedUser, ListQuery } from './index';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware. */
      user?: AuthenticatedUser;
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