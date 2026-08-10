import type { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/response';
import * as inventoryService from '../services/inventory.service';
import {
  adjustInventorySchema,
  inventoryListQuerySchema,
  movementsListQuerySchema,
} from '../validators/inventory.schema';
import { productIdParamSchema } from '../validators/common.schema';

export const inventoryController = {
  list: asyncHandler(async (req, res) => {
    const query = req.validated!.query as z.infer<typeof inventoryListQuerySchema>;
    ok(res, await inventoryService.listInventory(query));
  }),

  getByProduct: asyncHandler(async (req, res) => {
    const { productId } = req.validated!.params as z.infer<typeof productIdParamSchema>;
    ok(res, await inventoryService.getInventoryByProduct(productId));
  }),

  adjust: asyncHandler(async (req, res) => {
    const { productId } = req.validated!.params as z.infer<typeof productIdParamSchema>;
    const body = req.validated!.body as z.infer<typeof adjustInventorySchema>;
    ok(res, await inventoryService.adjustStock(productId, body, req.user!.id));
  }),

  movements: asyncHandler(async (req, res) => {
    const query = req.validated!.query as z.infer<typeof movementsListQuerySchema>;
    ok(res, await inventoryService.listMovements(query));
  }),
};