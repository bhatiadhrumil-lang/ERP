/**
 * Domain error with an HTTP status code and a stable machine-readable code.
 * The central error handler maps this to the API error envelope:
 *   { success: false, error: { code, message, details? } }
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Stable error codes used across the API. */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  AUTH_CONFIG_ERROR: 'AUTH_CONFIG_ERROR',
  USER_DISABLED: 'USER_DISABLED',
  ADMIN_ALREADY_INITIALIZED: 'ADMIN_ALREADY_INITIALIZED',
  USER_ALREADY_PROVISIONED: 'USER_ALREADY_PROVISIONED',
  LAST_ADMIN: 'LAST_ADMIN',
  COGNITO_ERROR: 'COGNITO_ERROR',
} as const;