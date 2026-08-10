import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/response';
import * as dashboardService from '../services/dashboard.service';

export const dashboardController = {
  summary: asyncHandler(async (_req, res) => {
    ok(res, await dashboardService.getSummary());
  }),

  lowStock: asyncHandler(async (_req, res) => {
    ok(res, await dashboardService.getLowStock());
  }),

  recentChallans: asyncHandler(async (_req, res) => {
    ok(res, await dashboardService.getRecentChallans());
  }),

  recentActivity: asyncHandler(async (_req, res) => {
    ok(res, await dashboardService.getRecentActivity());
  }),
};