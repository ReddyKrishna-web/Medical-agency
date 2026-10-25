import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from '../utils/logger';

let prisma: PrismaClient | null = null;

/** True when DATABASE_URL is present; the app can still run on MongoDB alone. */
export const isPostgresConfigured = (): boolean => Boolean(env.DATABASE_URL);

/**
 * Lazily created so the API can boot before the Supabase project is configured
 * (the login flow is cut over to Supabase in the next phase). Callers must treat
 * a missing configuration as a reported error, never as an empty result.
 */
export const getPrisma = (): PrismaClient => {
  if (!env.DATABASE_URL) {
    throw new Error('PostgreSQL is not configured: set DATABASE_URL (and DIRECT_URL for migrations) in backend/.env');
  }
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: { db: { url: env.DATABASE_URL } },
      log: env.isProduction ? ['error'] : ['warn', 'error'],
    });
  }
  return prisma;
};

export interface PostgresHealth {
  configured: boolean;
  connected: boolean;
  error?: string;
}

/** Safe health probe: never throws and never echoes the connection string. */
export const checkPostgres = async (): Promise<PostgresHealth> => {
  if (!isPostgresConfigured()) return { configured: false, connected: false };
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return { configured: true, connected: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('PostgreSQL health probe failed', { message: message.slice(0, 200) });
    return { configured: true, connected: false, error: 'PostgreSQL is not reachable' };
  }
};

export const disconnectPostgres = async (): Promise<void> => {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = null;
};
