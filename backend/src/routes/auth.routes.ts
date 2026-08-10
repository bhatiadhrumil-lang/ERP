import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { devLoginSchema } from '../validators/auth.schema';
import { authController } from '../controllers/auth.controller';

const router = Router();

// Development-only login. NOT mounted in production (see routes/index.ts).
router.post('/dev-login', validate({ body: devLoginSchema }), authController.devLogin);

// Current user — works with both Cognito (prod) and dev tokens.
router.get('/me', authenticate, authController.me);

export default router;