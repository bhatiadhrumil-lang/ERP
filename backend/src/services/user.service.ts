import type { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import { orderBy, paginate } from '../utils/pagination';
import type { ListQuery } from '../types';

export interface UserFilters extends ListQuery {
  role?: UserRole;
  isActive?: boolean;
}

const USER_SORTABLE = ['createdAt', 'updatedAt', 'name', 'email'] as const;

const userSelect = {
  id: true,
  cognitoSub: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listUsers(filters: UserFilters) {
  const where: Prisma.UserWhereInput = {};
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.role) where.role = filters.role;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: orderBy(filters, USER_SORTABLE) as Prisma.UserOrderByWithRelationInput,
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);
  return paginate(items, total, filters);
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'User not found');
  return user;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
}

/**
 * Updates a user. An admin can manage other users freely but must not be able
 * to strip their own role or deactivate their own account.
 */
export async function updateUser(id: string, data: UpdateUserInput, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!user) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'User not found');

  if (id === actorId) {
    if (data.role !== undefined && data.role !== user.role) {
      throw new ApiError(409, ErrorCodes.CONFLICT, 'You cannot change your own role');
    }
    if (data.isActive === false) {
      throw new ApiError(409, ErrorCodes.CONFLICT, 'You cannot deactivate your own account');
    }
  }

  return prisma.user.update({ where: { id }, data, select: userSelect });
}