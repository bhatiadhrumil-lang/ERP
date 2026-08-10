import dotenv from 'dotenv';

/**
 * Test environment bootstrap. Runs in every worker BEFORE test files are
 * imported, so the app's env/prisma modules (imported lazily by test files)
 * pick up the test database and a fixed dev-JWT secret.
 */
dotenv.config({ quiet: true });

const testDbUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://mini_erp:mini_erp_dev_password@localhost:5432/mini_erp_test';

process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.DEV_JWT_SECRET = 'test-secret-only';
process.env.DEV_AUTH_ENABLED = 'true';
process.env.CORS_ORIGIN = 'http://localhost:5173';