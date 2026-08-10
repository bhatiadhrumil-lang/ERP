import type { z } from 'zod';
import type { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok } from '../utils/response';
import * as productService from '../services/product.service';
import {
  createProductSchema,
  productListQuerySchema,
  updateProductSchema,
} from '../validators/product.schema';
import { idParamSchema } from '../validators/common.schema';

export const productController = {
  list: asyncHandler(async (req, res) => {
    const query = req.validated!.query as z.infer<typeof productListQuerySchema>;
    ok(res, await productService.listProducts(query));
  }),

  getById: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    ok(res, await productService.getProductById(id));
  }),

  create: asyncHandler(async (req, res) => {
    const body = req.validated!.body as z.infer<typeof createProductSchema>;
    created(res, await productService.createProduct(body));
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    const body = req.validated!.body as z.infer<typeof updateProductSchema>;
    ok(res, await productService.updateProduct(id, body));
  }),

  remove: asyncHandler(async (req, res) => {
    const { id } = req.validated!.params as z.infer<typeof idParamSchema>;
    await productService.deleteProduct(id);
    (res as Response).status(204).end();
  }),
};