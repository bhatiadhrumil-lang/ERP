import type { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok } from '../utils/response';
import * as followUpService from '../services/followUp.service';
import {
  createFollowUpSchema,
  followUpListQuerySchema,
  updateFollowUpSchema,
} from '../validators/followUp.schema';
import { customerIdParamSchema, idParamSchema } from '../validators/common.schema';

export const followUpController = {
  /** GET /api/customers/:customerId/followups */
  listByCustomer: asyncHandler(async (req, res) => {
    const { customerId } = req.validated!.params as z.infer<typeof customerIdParamSchema>;
    const query = req.validated!.query as z.infer<typeof followUpListQuerySchema>;
    ok(res, await followUpService.listFollowUps(query, customerId));
  }),

  /** GET /api/followups — across all customers */
  listAll: asyncHandler(async (req, res) => {
    const query = req.validated!.query as z.infer<typeof followUpListQuerySchema>;
    ok(res, await followUpService.listFollowUps(query));
  }),

  /** POST /api/customers/:customerId/followups */
  create: asyncHandler(async (req, res) => {
    const { customerId } = req.validated!.params as z.infer<typeof customerIdParamSchema>;
    const body = req.validated!.body as z.infer<typeof createFollowUpSchema>;
    created(res, await followUpService.createFollowUp(customerId, body, req.user!.id));
  }),

  /** PATCH /api/followups/:id */
  update: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    const body = req.validated!.body as z.infer<typeof updateFollowUpSchema>;
    ok(res, await followUpService.updateFollowUp(id, body));
  }),
};