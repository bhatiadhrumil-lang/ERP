import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ZodError } from 'zod';
import { ApiError, ErrorCodes } from '../utils/ApiError';

interface ValidationSchemas {
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
}

/**
 * Zod validation middleware factory.
 * Parses the declared request parts and stores the typed result on
 * req.validated; invalid input produces a consistent VALIDATION_ERROR:
 *
 *   { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: [...] } }
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed: NonNullable<Request['validated']> = {};
      if (schemas.params) parsed.params = schemas.params.parse(req.params);
      if (schemas.query) parsed.query = schemas.query.parse(req.query);
      if (schemas.body) parsed.body = schemas.body.parse(req.body);
      req.validated = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
          path: issue.path.join('.') || '(root)',
          message: issue.message,
        }));
        next(new ApiError(400, ErrorCodes.VALIDATION_ERROR, 'Invalid request', details));
        return;
      }
      next(err);
    }
  };
}