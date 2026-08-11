import type { Prisma, UserRole, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../config/prisma';
import { isDevInviteEnabled } from '../config/env';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { orderBy, paginate } from '../utils/pagination';
import type { ListQuery } from '../types';
import * as cognitoAdminService from './cognitoAdminService';
import { generateTempPassword, hashDevPassword } from './devPassword';

export interface UserFilters extends ListQuery {
  role?: UserRole;
  status?: UserStatus;
  isActive?: boolean;
}

const USER_SORTABLE = ['createdAt', 'updatedAt', 'name', 'email'] as const;

const userSelect = {
  id: true,
  cognitoSub: true,
  name: true,
  email: true,
  role: true,
  status: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Number of non-disabled ADMIN users (optionally excluding one user). */
function countActiveAdmins(excludeUserId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      role: 'ADMIN',
      status: { not: 'DISABLED' },
    },
  });
}

async function actorEmail(actorId: string): Promise<string> {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { email: true } });
  return actor?.email ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listUsers(filters: UserFilters) {
  const where: Prisma.UserWhereInput = {};
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.role) where.role = filters.role;
  if (filters.status) where.status = filters.status;
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

// ---------------------------------------------------------------------------
// Invite (ADMIN only — the invitee can never pick their own role)
// ---------------------------------------------------------------------------

export async function inviteUser(
  input: { name: string; email: string; role: 'SALES' | 'WAREHOUSE' | 'ACCOUNTS' },
  actorId: string,
) {
  const email = input.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError(409, ErrorCodes.CONFLICT, 'A user with that email already exists');
  }

  // Dev mode (no AWS credentials): create a local account with a temp password
  // shown to the admin. The employee signs in via the dev-login form.
  if (isDevInviteEnabled()) {
    const tempPassword = generateTempPassword();
    const user = await prisma.user.create({
      data: {
        // `dev-` prefix marks a locally-created identity (no Cognito user).
        cognitoSub: `dev-${randomUUID()}`,
        name: input.name,
        email,
        role: input.role,
        status: 'ACTIVE',
        isActive: true,
        devPasswordHash: hashDevPassword(tempPassword),
      },
      select: userSelect,
    });
    logger.info(`[audit] action=user.invite-dev actor=${await actorEmail(actorId)} target=${email} role=${input.role}`);
    return { user, tempPassword };
  }

  // 1. Create the Cognito identity; Cognito emails the invitation + temporary
  //    password. No password ever passes through this application.
  const cognitoUser = await cognitoAdminService.createInvitedUser({
    name: input.name,
    email,
  });

  // 2. Store the application user, keyed by the Cognito `sub`.
  try {
    const user = await prisma.user.create({
      data: {
        cognitoSub: cognitoUser.cognitoSub,
        name: input.name,
        email,
        role: input.role,
        status: 'INVITED',
        isActive: true,
      },
      select: userSelect,
    });
    logger.info(
      `[audit] action=user.invite actor=${await actorEmail(actorId)} target=${email} role=${input.role}`,
    );
    return { user, tempPassword: undefined };
  } catch (err) {
    // Compensation: the Cognito identity was created but the DB write failed —
    // remove the orphaned Cognito user so the email stays usable.
    await cognitoAdminService.deleteCognitoUser(email);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Role changes (ADMIN only)
// ---------------------------------------------------------------------------

export async function changeUserRole(id: string, role: UserRole, actorId: string) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, status: true },
  });
  if (!target) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'User not found');

  if (target.role === role) {
    return prisma.user.findUnique({ where: { id }, select: userSelect });
  }

  // Never allow removing the final ADMIN — whether demoting someone else or
  // accidentally demoting yourself.
  if (target.role === 'ADMIN') {
    const admins = await countActiveAdmins();
    if (admins <= 1) {
      throw new ApiError(409, ErrorCodes.LAST_ADMIN, 'Cannot demote the last remaining ADMIN');
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role },
    select: userSelect,
  });
  logger.info(
    `[audit] action=user.change-role actor=${await actorEmail(actorId)} target=${updated.email} role=${role}`,
  );
  return updated;
}

// ---------------------------------------------------------------------------
// Disable / enable (ADMIN only)
// ---------------------------------------------------------------------------

/**
 * Disable a user. Strategy: the application database is updated FIRST (it is
 * the authorization authority — a disabled row is rejected with 403
 * USER_DISABLED regardless of Cognito), then Cognito is disabled. If the
 * Cognito call fails the divergence is logged, never silent: the user is
 * locked out of the app either way.
 */
export async function disableUser(id: string, actorId: string) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, status: true },
  });
  if (!target) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'User not found');

  if (id === actorId) {
    throw new ApiError(409, ErrorCodes.CONFLICT, 'You cannot disable your own account');
  }
  if (target.role === 'ADMIN') {
    const admins = await countActiveAdmins();
    if (admins <= 1) {
      throw new ApiError(409, ErrorCodes.LAST_ADMIN, 'Cannot disable the last remaining ADMIN');
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { status: 'DISABLED', isActive: false },
    select: userSelect,
  });
  await cognitoAdminService.disableCognitoUser(target.email);
  logger.info(`[audit] action=user.disable actor=${await actorEmail(actorId)} target=${target.email}`);
  return updated;
}

/** Enable a disabled user — DB first, then Cognito (failures logged). */
export async function enableUser(id: string, actorId: string) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, status: true },
  });
  if (!target) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'User not found');

  const updated = await prisma.user.update({
    where: { id },
    data: { status: 'ACTIVE', isActive: true },
    select: userSelect,
  });
  await cognitoAdminService.enableCognitoUser(target.email);
  logger.info(`[audit] action=user.enable actor=${await actorEmail(actorId)} target=${target.email}`);
  return updated;
}

// ---------------------------------------------------------------------------
// Resend invitation (ADMIN only)
// ---------------------------------------------------------------------------

/** Re-sends the Cognito invitation email (new temporary password). */
export async function resendInvitation(id: string, actorId: string) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, status: true, devPasswordHash: true },
  });
  if (!target) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'User not found');
  if (target.status !== 'INVITED') {
    throw new ApiError(409, ErrorCodes.CONFLICT, 'Invitations can only be resent for INVITED users');
  }

  // Dev mode: rotate the local temp password instead of calling Cognito.
  if (isDevInviteEnabled()) {
    const tempPassword = generateTempPassword();
    await prisma.user.update({
      where: { id },
      data: { devPasswordHash: hashDevPassword(tempPassword) },
    });
    logger.info(`[audit] action=user.resend-invitation-dev actor=${await actorEmail(actorId)} target=${target.email}`);
    return { user: await prisma.user.findUnique({ where: { id }, select: userSelect }), tempPassword };
  }

  await cognitoAdminService.resendInvitation(target.email);
  logger.info(`[audit] action=user.resend-invitation actor=${await actorEmail(actorId)} target=${target.email}`);
  return { user: await prisma.user.findUnique({ where: { id }, select: userSelect }), tempPassword: undefined };
}

// ---------------------------------------------------------------------------
// Profile edits (ADMIN only)
// ---------------------------------------------------------------------------

export interface UpdateUserInput {
  name?: string;
}

export async function updateUser(id: string, data: UpdateUserInput, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!user) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'User not found');
  void actorId;

  return prisma.user.update({ where: { id }, data, select: userSelect });
}
