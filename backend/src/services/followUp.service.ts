import type { FollowUpStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import { orderBy, paginate } from '../utils/pagination';
import type { ListQuery } from '../types';

export interface FollowUpFilters extends ListQuery {
  status?: FollowUpStatus;
  assignedToId?: string;
  from?: Date;
  to?: Date;
}

const FOLLOWUP_SORTABLE = ['createdAt', 'updatedAt', 'followUpDate'] as const;

const followUpSelect = {
  id: true,
  customerId: true,
  assignedToId: true,
  createdById: true,
  followUpDate: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: { id: true, name: true, customerCode: true, businessName: true, mobile: true },
  },
  assignedTo: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.CustomerFollowUpSelect;

function buildWhere(filters: FollowUpFilters, customerId?: string): Prisma.CustomerFollowUpWhereInput {
  const where: Prisma.CustomerFollowUpWhereInput = {};
  if (customerId) where.customerId = customerId;
  else if (filters.search) {
    where.customer = {
      OR: [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { businessName: { contains: filters.search, mode: 'insensitive' } },
        { mobile: { contains: filters.search } },
      ],
    };
  }
  if (filters.status) where.status = filters.status;
  if (filters.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters.from || filters.to) {
    where.followUpDate = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  return where;
}

export async function listFollowUps(filters: FollowUpFilters, customerId?: string) {
  const where = buildWhere(filters, customerId);
  const [total, items] = await Promise.all([
    prisma.customerFollowUp.count({ where }),
    prisma.customerFollowUp.findMany({
      where,
      select: followUpSelect,
      orderBy: orderBy(filters, FOLLOWUP_SORTABLE) as Prisma.CustomerFollowUpOrderByWithRelationInput,
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);
  return paginate(items, total, filters);
}

export interface CreateFollowUpInput {
  followUpDate: Date;
  notes: string;
  assignedToId?: string | null;
  status?: FollowUpStatus;
}

export async function createFollowUp(customerId: string, data: CreateFollowUpInput, createdById: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Customer not found');
  return prisma.customerFollowUp.create({
    data: {
      customerId,
      followUpDate: data.followUpDate,
      notes: data.notes,
      assignedToId: data.assignedToId ?? null,
      status: data.status ?? 'PENDING',
      createdById,
    },
    select: followUpSelect,
  });
}

export type UpdateFollowUpInput = Prisma.CustomerFollowUpUncheckedUpdateInput;

export async function updateFollowUp(id: string, data: UpdateFollowUpInput) {
  const existing = await prisma.customerFollowUp.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Follow-up not found');
  return prisma.customerFollowUp.update({ where: { id }, data, select: followUpSelect });
}