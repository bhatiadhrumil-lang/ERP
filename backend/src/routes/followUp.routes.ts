import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { followUpController } from '../controllers/followUp.controller';
import { followUpListQuerySchema, updateFollowUpSchema } from '../validators/followUp.schema';
import { idParamSchema } from '../validators/common.schema';

const router = Router();

// Follow-up center: list across all customers + update any follow-up.
router.use(authenticate, requireRole('ADMIN', 'SALES'));

router.get('/', validate({ query: followUpListQuerySchema }), followUpController.listAll);
router.patch('/:id', validate({ params: idParamSchema, body: updateFollowUpSchema }), followUpController.update);

export default router;