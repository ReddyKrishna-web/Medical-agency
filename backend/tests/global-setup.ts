/**
 * Vitest global setup: environment only.
 *
 * Test credentials and flags are defined here because `src/config/env.ts` is
 * imported (and validated) as soon as any application module is loaded, which
 * happens before a per-file setup hook could assign them. The in-memory MongoDB
 * replica set itself is started and stopped per test file in `setup.ts` so it is
 * always torn down before vitest closes the worker.
 */
export default function globalSetup(): void {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-access-secret-value-0123456789abcdef';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-value-0123456789abcdefGHI';
  process.env.BCRYPT_ROUNDS = '4';
  process.env.EMAIL_CONFIG = 'console';
  process.env.FILE_STORAGE_CONFIG = 'local';
  process.env.LOCAL_STORAGE_PATH = './storage/test-uploads';
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.ALLOW_TRANSACTIONS = 'true';
  process.env.RATE_LIMIT_MAX = '10000';
  process.env.AUTH_RATE_LIMIT_MAX = '10000';
}
