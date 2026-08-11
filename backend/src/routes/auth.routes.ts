import { Router } from 'express';
import { authenticate, requireCognitoOnly } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { devLoginSchema } from '../validators/auth.schema';
import { authController } from '../controllers/auth.controller';

const router = Router();

// Public: tells the frontend whether the first-admin setup flow may run.
router.get('/bootstrap-status', authController.bootstrapStatus);

// Public bootstrap: creates the FIRST ADMIN from a verified Cognito identity.
// Uses requireCognitoOnly (no app-user resolution — the user row does not
// exist yet). After bootstrap, returns ADMIN_ALREADY_INITIALIZED.
router.post('/bootstrap-admin', requireCognitoOnly, authController.bootstrapAdmin);

// Development-only login. NOT mounted in production (see routes/index.ts).
router.post('/dev-login', validate({ body: devLoginSchema }), authController.devLogin);

// Current user — works with both Cognito (prod) and dev tokens.
router.get('/me', authenticate, authController.me);

export default router;