import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { productController } from '../controllers/product.controller';
import {
  createProductSchema,
  productListQuerySchema,
  updateProductSchema,
} from '../validators/product.schema';
import { idParamSchema } from '../validators/common.schema';

const router = Router();

router.use(authenticate);

// Read: ADMIN, SALES, WAREHOUSE. Write: ADMIN, WAREHOUSE.
router.get(
  '/',
  requireRole('ADMIN', 'SALES', 'WAREHOUSE'),
  validate({ query: productListQuerySchema }),
  productController.list,
);
router.get('/:id', requireRole('ADMIN', 'SALES', 'WAREHOUSE'), validate({ params: idParamSchema }), productController.getById);
router.post(
  '/',
  requireRole('ADMIN', 'WAREHOUSE'),
  validate({ body: createProductSchema }),
  productController.create,
);
router.patch(
  '/:id',
  requireRole('ADMIN', 'WAREHOUSE'),
  validate({ params: idParamSchema, body: updateProductSchema }),
  productController.update,
);
router.delete('/:id', requireRole('ADMIN', 'WAREHOUSE'), validate({ params: idParamSchema }), productController.remove);

export default router;