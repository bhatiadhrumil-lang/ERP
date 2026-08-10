import { execSync } from 'node:child_process';
import * as path from 'node:path';
import dotenv from 'dotenv';

/**
 * Runs once before the whole suite: applies Prisma migrations to the TEST
 * database so tests always run against the exact production schema.
 */
export default async function globalSetup(): Promise<void> {
  dotenv.config({ quiet: true });
  const testDbUrl =
    process.env.TEST_DATABASE_URL ?? 'postgresql://mini_erp:mini_erp_dev_password@localhost:5432/mini_erp_test';
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'pipe',
  });
  // eslint-disable-next-line no-console
  console.log(`[global-setup] migrations applied to ${testDbUrl.split('@')[1]}`);
}