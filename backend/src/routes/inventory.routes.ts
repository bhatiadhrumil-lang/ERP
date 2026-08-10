import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { inventoryController } from '../controllers/inventory.controller';
import {
  adjustInventorySchema,
  inventoryListQuerySchema,
  movementsListQuerySchema,
} from '../validators/inventory.schema';
import { productIdParamSchema } from '../validators/common.schema';

const router = Router();

router.use(authenticate);

// Stock levels: ADMIN, SALES, WAREHOUSE can view. Adjustments: ADMIN, WAREHOUSE.
router.get(
  '/movements',
  requireRole('ADMIN', 'WAREHOUSE'),
  validate({ query: movementsListQuerySchema }),
  inventoryController.movements,
);
router.get(
  '/',
  requireRole('ADMIN', 'SALES', 'WAREHOUSE'),
  validate({ query: inventoryListQuerySchema }),
  inventoryController.list,
);
router.get(
  '/:productId',
  requireRole('ADMIN', 'SALES', 'WAREHOUSE'),
  validate({ params: productIdParamSchema }),
  inventoryController.getByProduct,
);
router.post(
  '/:productId/adjust',
  requireRole('ADMIN', 'WAREHOUSE'),
  validate({ params: productIdParamSchema, body: adjustInventorySchema }),
  inventoryController.adjust,
);

export default router;