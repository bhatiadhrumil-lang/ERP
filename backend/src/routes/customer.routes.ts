import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { customerController } from '../controllers/customer.controller';
import { followUpController } from '../controllers/followUp.controller';
import {
  createCustomerSchema,
  customerListQuerySchema,
  updateCustomerSchema,
} from '../validators/customer.schema';
import { customerIdParamSchema, idParamSchema } from '../validators/common.schema';
import { createFollowUpSchema, followUpListQuerySchema } from '../validators/followUp.schema';

const router = Router();

router.use(authenticate);

// ---- Customers ------------------------------------------------------------
// Read: ADMIN, SALES, ACCOUNTS. Write: ADMIN, SALES.
router.get(
  '/',
  requireRole('ADMIN', 'SALES', 'ACCOUNTS'),
  validate({ query: customerListQuerySchema }),
  customerController.list,
);
router.get('/:id', requireRole('ADMIN', 'SALES', 'ACCOUNTS'), validate({ params: idParamSchema }), customerController.getById);
router.post(
  '/',
  requireRole('ADMIN', 'SALES'),
  validate({ body: createCustomerSchema }),
  customerController.create,
);
router.patch(
  '/:id',
  requireRole('ADMIN', 'SALES'),
  validate({ params: idParamSchema, body: updateCustomerSchema }),
  customerController.update,
);
router.delete('/:id', requireRole('ADMIN', 'SALES'), validate({ params: idParamSchema }), customerController.remove);

// ---- Customer follow-ups (nested) -----------------------------------------
// ADMIN, SALES manage follow-ups.
router.get(
  '/:customerId/followups',
  requireRole('ADMIN', 'SALES'),
  validate({ params: customerIdParamSchema, query: followUpListQuerySchema }),
  followUpController.listByCustomer,
);
router.post(
  '/:customerId/followups',
  requireRole('ADMIN', 'SALES'),
  validate({ params: customerIdParamSchema, body: createFollowUpSchema }),
  followUpController.create,
);

export default router;