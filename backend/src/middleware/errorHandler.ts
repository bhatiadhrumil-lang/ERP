import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/** 404 for unknown routes — kept out of the error envelope so it reads cleanly. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCodes.NOT_FOUND,
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

function prismaErrorToApiError(err: Prisma.PrismaClientKnownRequestError): ApiError {
  switch (err.code) {
    case 'P2002':
      return new ApiError(
        409,
        ErrorCodes.CONFLICT,
        `A record with the same ${String(err.meta?.target ?? 'unique value')} already exists`,
        { target: err.meta?.target },
      );
    case 'P2025':
      return new ApiError(404, ErrorCodes.NOT_FOUND, 'Record not found');
    case 'P2003':
      return new ApiError(
        409,
        ErrorCodes.CONFLICT,
        'This record is referenced by other records and cannot be deleted',
        { field: err.meta?.field_name },
      );
    default:
      return new ApiError(500, ErrorCodes.INTERNAL_ERROR, 'Database error');
  }
}

/**
 * Central error handler. Never exposes stack traces in responses.
 * In development the raw message is included for easier debugging.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const apiError = prismaErrorToApiError(err);
    res.status(apiError.statusCode).json({
      success: false,
      error: { code: apiError.code, message: apiError.message },
    });
    return;
  }

  logger.error('Unhandled error', err);
  res.status(500).json({
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: env.isProduction ? 'Internal server error' : (err as Error).message ?? 'Internal server error',
    },
  });
}