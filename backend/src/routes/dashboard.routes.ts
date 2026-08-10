import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { dashboardController } from '../controllers/dashboard.controller';

const router = Router();

// Reporting: ADMIN, SALES, ACCOUNTS.
router.use(authenticate, requireRole('ADMIN', 'SALES', 'ACCOUNTS'));

router.get('/summary', dashboardController.summary);
router.get('/low-stock', dashboardController.lowStock);
router.get('/recent-challans', dashboardController.recentChallans);
router.get('/recent-activity', dashboardController.recentActivity);

export default router;