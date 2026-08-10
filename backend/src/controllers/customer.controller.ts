import type { z } from 'zod';
import type { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok } from '../utils/response';
import * as customerService from '../services/customer.service';
import {
  createCustomerSchema,
  customerListQuerySchema,
  updateCustomerSchema,
} from '../validators/customer.schema';
import { idParamSchema } from '../validators/common.schema';

export const customerController = {
  list: asyncHandler(async (req, res) => {
    const query = req.validated!.query as z.infer<typeof customerListQuerySchema>;
    ok(res, await customerService.listCustomers(query));
  }),

  getById: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    ok(res, await customerService.getCustomerById(id));
  }),

  create: asyncHandler(async (req, res) => {
    const body = req.validated!.body as z.infer<typeof createCustomerSchema>;
    created(res, await customerService.createCustomer(body));
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    const body = req.validated!.body as z.infer<typeof updateCustomerSchema>;
    ok(res, await customerService.updateCustomer(id, body));
  }),

  remove: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    await customerService.deleteCustomer(id);
    (res as Response).status(204).end();
  }),
};