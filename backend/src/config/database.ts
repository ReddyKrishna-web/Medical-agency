import mongoose, { type ClientSession, type ConnectOptions } from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

export interface TransactionCapability {
  supported: boolean;
  reason: string;
}

let transactionCapability: TransactionCapability = {
  supported: false,
  reason: 'not probed yet'
};

export const getTransactionCapability = (): TransactionCapability => transactionCapability;

/**
 * Probe whether the connected deployment can run multi-document transactions.
 * A single-node standalone mongod cannot; the app then uses the documented
 * conditional-update + compensation saga (see services/stock.service.ts).
 */
const probeTransactions = async (connection: mongoose.Connection): Promise<void> => {
  if (!env.ALLOW_TRANSACTIONS) {
    transactionCapability = {
      supported: false,
      reason: 'ALLOW_TRANSACTIONS=false (disabled by configuration)'
    };
    logger.warn('Multi-document transactions are disabled by configuration');
    return;
  }

  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      await connection.db?.collection('__transaction_probe__').findOne({}, { session });
    });
    transactionCapability = { supported: true, reason: 'replica set or sharded cluster available' };
    logger.info('MongoDB transactions are available');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    transactionCapability = {
      supported: false,
      reason: `deployment cannot start a transaction (${message.slice(0, 160)})`
    };
    logger.warn('MongoDB transactions unavailable; using compensated saga for stock safety', {
      reason: transactionCapability.reason
    });
  } finally {
    await session.endSession();
  }
};

export const connectDatabase = async (uriOverride?: string): Promise<mongoose.Connection> => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  const options: ConnectOptions = {
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    maxPoolSize: 20,
    minPoolSize: 2,
    autoIndex: !env.isProduction,
    family: 4
  };

  mongoose.set('strictQuery', true);
  // `sanitizeFilter` is intentionally NOT enabled: every filter in this codebase is
  // built server side from zod-validated, allow-listed values, and mongoose's global
  // filter wrapping would break legitimate `$in` operators on enum fields.
  // User-supplied payloads are cleaned by `middleware/sanitize` and `validate`.

  // An override is used by the test harness (in-memory MongoDB).
  await mongoose.connect(uriOverride ?? env.MONGODB_URI, options);
  logger.info('MongoDB connected', { database: mongoose.connection.name });

  if (env.isProduction) {
    // Indexes are created explicitly on boot in production.
    await mongoose.connection.syncIndexes().catch((error: unknown) => {
      logger.error('Index synchronisation failed', { error });
      throw error;
    });
  }

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (error: unknown) => logger.error('MongoDB connection error', { error }));

  await probeTransactions(mongoose.connection);

  return mongoose.connection;
};

export const disconnectDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close(false);
  logger.info('MongoDB connection closed');
};

export const isDatabaseHealthy = (): boolean => mongoose.connection.readyState === 1;

/**
 * Run `work` inside a transaction when the deployment supports it, otherwise run
 * it directly. Callers must be written so the no-transaction path is still safe
 * (conditional updates + compensating writes).
 */
export const withOptionalTransaction = async <T>(
  work: (session?: ClientSession) => Promise<T>,
  options: { label: string }
): Promise<T> => {
  if (!transactionCapability.supported) {
    return work(undefined);
  }

  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result!;
  } catch (error) {
    if (isTransactionUnsupported(error)) {
      transactionCapability = { supported: false, reason: 'transaction aborted: deployment rejected it' };
      logger.warn('Falling back to compensated saga after transaction failure', { label: options.label });
      return work(undefined);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

export const isTransactionUnsupported = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: number | string; codeName?: string; message?: string };
  const message = candidate.message ?? '';
  return (
    candidate.code === 20 ||
    candidate.code === 303 ||
    candidate.code === 'IllegalOperation' ||
    candidate.codeName === 'NoSuchTransaction' ||
    candidate.codeName === 'IllegalOperation' ||
    /transaction numbers are only allowed on a replica set member or mongos/i.test(message) ||
    /Transaction numbers are only allowed/i.test(message)
  );
};

export { mongoose };
