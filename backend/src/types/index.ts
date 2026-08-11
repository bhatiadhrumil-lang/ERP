import type { UserRole, UserStatus } from '@prisma/client';

/** The authenticated user attached to the request by the auth middleware. */
export interface AuthenticatedUser {
  id: string;
  cognitoSub: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

/** Standard paginated list response shape. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Parsed & validated query parameters for list endpoints. */
export interface ListQuery {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}