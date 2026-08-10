import { Router } from 'express';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/response';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import customerRoutes from './customer.routes';
import followUpRoutes from './followUp.routes';
import productRoutes from './product.routes';
import inventoryRoutes from './inventory.routes';
import challanRoutes from './challan.routes';
import dashboardRoutes from './dashboard.routes';

const router = Router();

/**
 * GET /api/health — public readiness probe (suitable for an ALB health check).
 * Always returns 200 when the process is up; reports DB connectivity as data.
 */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let db: 'up' | 'down' = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    ok(res, {
      status: 'ok',
      db,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      env: env.NODE_ENV,
    });
  }),
);

// Authentication. Public (dev-login) + authenticated routes are declared inside.
router.use('/auth', authRoutes);

// Everything below /auth/me requires a valid JWT.
router.use('/users', userRoutes);
router.use('/customers', customerRoutes);
router.use('/followups', followUpRoutes);
router.use('/products', productRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/challans', challanRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;