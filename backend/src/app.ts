import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import apiRoutes from './routes';
import { logger } from './utils/logger';

/**
 * Express application factory.
 * Kept separate from server.ts so tests can build the app without listening.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', apiRoutes);

  // 404s for anything unmatched, then the central error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info(`App created (env=${env.NODE_ENV}, cors=${env.corsOrigins.join(', ')})`);
  return app;
}