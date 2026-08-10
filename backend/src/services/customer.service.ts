import { Prisma } from '@prisma/client';
import type { CustomerStatus, CustomerType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import { generateCustomerCode } from '../utils/codes';
import { orderBy, paginate } from '../utils/pagination';
import type { ListQuery } from '../types';

export interface CustomerFilters extends ListQuery {
  customerType?: CustomerType;
  status?: CustomerStatus;
}

const CUSTOMER_SORTABLE = [
  'createdAt',
  'updatedAt',
  'name',
  'businessName',
  'mobile',
  'customerCode',
  'customerType',
  'status',
  'nextFollowUpDate',
] as const;

const customerSelect = {
  id: true,
  customerCode: true,
  name: true,
  mobile: true,
  email: true,
  businessName: true,
  gstNumber: true,
  customerType: true,
  status: true,
  address: true,
  nextFollowUpDate: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { followUps: true, salesChallans: true } },
} satisfies Prisma.CustomerSelect;

function buildWhere(filters: CustomerFilters): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {};
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { businessName: { contains: filters.search, mode: 'insensitive' } },
      { customerCode: { contains: filters.search, mode: 'insensitive' } },
      { mobile: { contains: filters.search } },
    ];
  }
  if (filters.customerType) where.customerType = filters.customerType;
  if (filters.status) where.status = filters.status;
  return where;
}

export async function listCustomers(filters: CustomerFilters) {
  const where = buildWhere(filters);
  const [total, items] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      select: customerSelect,
      orderBy: orderBy(filters, CUSTOMER_SORTABLE) as Prisma.CustomerOrderByWithRelationInput,
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);
  return paginate(items, total, filters);
}

export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findUnique({ where: { id }, select: customerSelect });
  if (!customer) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Customer not found');
  return customer;
}

export type CreateCustomerInput = Omit<Prisma.CustomerUncheckedCreateInput, 'customerCode'>;

export async function createCustomer(data: CreateCustomerInput) {
  // customerCode is generated server-side; retry a couple of times on the
  // (astronomically unlikely) unique collision.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.customer.create({
        data: { ...data, customerCode: generateCustomerCode() },
        select: customerSelect,
      });
    } catch (err) {
      if (
        attempt < 2 &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        String(err.meta?.target).includes('customerCode')
      ) {
        continue;
      }
      throw err;
    }
  }
  throw new ApiError(500, ErrorCodes.INTERNAL_ERROR, 'Could not allocate a unique customer code');
}

export type UpdateCustomerInput = Prisma.CustomerUncheckedUpdateInput;

export async function updateCustomer(id: string, data: UpdateCustomerInput) {
  const existing = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Customer not found');
  return prisma.customer.update({ where: { id }, data, select: customerSelect });
}

export async function deleteCustomer(id: string): Promise<void> {
  const existing = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, ErrorCodes.NOT_FOUND, 'Customer not found');
  try {
    await prisma.customer.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new ApiError(
        409,
        ErrorCodes.CONFLICT,
        'Customer has linked challans or follow-ups and cannot be deleted',
      );
    }
    throw err;
  }
}