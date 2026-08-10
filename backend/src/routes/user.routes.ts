import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { userController } from '../controllers/user.controller';
import { updateUserSchema, userListQuerySchema } from '../validators/user.schema';
import { idParamSchema } from '../validators/common.schema';

const router = Router();

// User management is ADMIN-only.
router.use(authenticate, requireRole('ADMIN'));

router.get('/', validate({ query: userListQuerySchema }), userController.list);
router.get('/:id', validate({ params: idParamSchema }), userController.getById);
router.patch('/:id', validate({ params: idParamSchema, body: updateUserSchema }), userController.update);

export default router;