import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { ApiError, ErrorCodes } from '../utils/ApiError';

/**
 * RBAC middleware factory. The routes declare which roles may call them;
 * authorization is enforced server-side regardless of what the UI shows.
 *
 * Example:
 *   router.get('/customers', requireRole('ADMIN', 'SALES'), customerController.list)
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return next(new ApiError(401, ErrorCodes.UNAUTHORIZED, 'Authentication required'));
    }
    if (!roles.includes(user.role)) {
      return next(
        new ApiError(403, ErrorCodes.FORBIDDEN, 'You do not have permission to perform this action'),
      );
    }
    return next();
  };
}

export const adminOnly = requireRole('ADMIN');