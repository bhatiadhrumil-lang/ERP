import type { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok } from '../utils/response';
import * as challanService from '../services/challan.service';
import {
  challanListQuerySchema,
  createChallanSchema,
  updateChallanSchema,
} from '../validators/challan.schema';
import { idParamSchema } from '../validators/common.schema';

export const challanController = {
  list: asyncHandler(async (req, res) => {
    const query = req.validated!.query as z.infer<typeof challanListQuerySchema>;
    ok(res, await challanService.listChallans(query));
  }),

  getById: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    ok(res, await challanService.getChallanById(id));
  }),

  create: asyncHandler(async (req, res) => {
    const body = req.validated!.body as z.infer<typeof createChallanSchema>;
    created(res, await challanService.createChallan(body, req.user!.id));
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    const body = req.validated!.body as z.infer<typeof updateChallanSchema>;
    ok(res, await challanService.updateChallan(id, body));
  }),

  confirm: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    ok(res, await challanService.confirmChallan(id, req.user!.id));
  }),

  cancel: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    ok(res, await challanService.cancelChallan(id, req.user!.id));
  }),
};