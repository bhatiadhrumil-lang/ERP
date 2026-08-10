import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { challanController } from '../controllers/challan.controller';
import {
  challanListQuerySchema,
  createChallanSchema,
  updateChallanSchema,
} from '../validators/challan.schema';
import { idParamSchema } from '../validators/common.schema';

const router = Router();

router.use(authenticate);

// Read: ADMIN, SALES, ACCOUNTS. Manage (create/confirm/cancel): ADMIN, SALES.
router.get(
  '/',
  requireRole('ADMIN', 'SALES', 'ACCOUNTS'),
  validate({ query: challanListQuerySchema }),
  challanController.list,
);
router.get('/:id', requireRole('ADMIN', 'SALES', 'ACCOUNTS'), validate({ params: idParamSchema }), challanController.getById);
router.post('/', requireRole('ADMIN', 'SALES'), validate({ body: createChallanSchema }), challanController.create);
router.patch('/:id', requireRole('ADMIN', 'SALES'), validate({ params: idParamSchema, body: updateChallanSchema }), challanController.update);
router.post('/:id/confirm', requireRole('ADMIN', 'SALES'), validate({ params: idParamSchema }), challanController.confirm);
router.post('/:id/cancel', requireRole('ADMIN', 'SALES'), validate({ params: idParamSchema }), challanController.cancel);

export default router;