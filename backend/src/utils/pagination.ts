import type { ListQuery, PaginatedResult } from '../types';

/** Wraps a page of rows into the standard paginated envelope. */
export function paginate<T>(
  items: T[],
  total: number,
  query: Pick<ListQuery, 'page' | 'limit'>,
): PaginatedResult<T> {
  const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
  return { items, total, page: query.page, limit: query.limit, totalPages };
}

/**
 * Builds a Prisma orderBy object from user input, restricted to an allowlist
 * of sortable fields. Unknown sort fields fall back to `fallback`.
 * Callers cast the result to the entity's OrderByWithRelationInput type.
 */
export function orderBy(
  query: { sortBy?: string; sortOrder: 'asc' | 'desc' },
  allowed: readonly string[],
  fallback = 'createdAt',
): Record<string, 'asc' | 'desc'> {
  const field = query.sortBy && allowed.includes(query.sortBy) ? query.sortBy : fallback;
  return { [field]: query.sortOrder };
}