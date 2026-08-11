import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { userController } from '../controllers/user.controller';
import {
  changeRoleSchema,
  inviteUserSchema,
  updateUserSchema,
  userListQuerySchema,
} from '../validators/user.schema';
import { idParamSchema } from '../validators/common.schema';

const router = Router();

// User management is ADMIN-only.
router.use(authenticate, requireRole('ADMIN'));

// Invite must be declared before the /:id parameterized routes.
router.post('/invite', validate({ body: inviteUserSchema }), userController.invite);

router.get('/', validate({ query: userListQuerySchema }), userController.list);
router.get('/:id', validate({ params: idParamSchema }), userController.getById);

router.patch('/:id/role', validate({ params: idParamSchema, body: changeRoleSchema }), userController.changeRole);
router.post('/:id/disable', validate({ params: idParamSchema }), userController.disable);
router.post('/:id/enable', validate({ params: idParamSchema }), userController.enable);
router.post(
  '/:id/resend-invitation',
  validate({ params: idParamSchema }),
  userController.resendInvitation,
);

// Profile edits (name) — role changes and disable/enable use the dedicated routes.
router.patch('/:id', validate({ params: idParamSchema, body: updateUserSchema }), userController.update);

export default router;
