import type { ClientSession, Types } from 'mongoose';
import { CounterModel } from '../models/counter.model';
import { AppError, ErrorCode } from '../utils/errors';

export type CounterKey = 'order' | 'invoice' | 'payment' | 'customer' | 'salesman';

const MAX_ATTEMPTS = 6;

/**
 * Atomically increment a per-agency, per-year counter.
 *
 * `findOneAndUpdate` with `$inc` + `upsert` is a single atomic server-side
 * operation, so two concurrent order creations can never be handed the same
 * sequence value. A unique index on (agencyId, key, period) means a losing race
 * surfaces as a duplicate key error, which is retried (bounded) rather than
 * swallowed.
 */
export const nextSequence = async (
  agencyId: Types.ObjectId,
  key: CounterKey,
  year: number,
  session?: ClientSession
): Promise<number> => {
  const period = String(year);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const counter = await CounterModel.findOneAndUpdate(
        { agencyId, key, period },
        // `$inc` creates the field on insert, so no `$setOnInsert` for `value`
        // (setting both would be a conflicting update path in MongoDB).
        { $inc: { value: 1 }, $setOnInsert: { agencyId, key, period } },
        { upsert: true, new: true, setDefaultsOnInsert: true, session }
      ).exec();

      if (!counter) {
        throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'Sequence generator returned no counter');
      }
      return counter.value;
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 11000 && attempt < MAX_ATTEMPTS) {
        // Another request created the counter document first; retry the increment.
        continue;
      }
      throw error;
    }
  }

  throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'Could not allocate a document number, please retry');
};

export const formatSequentialNumber = (prefix: string, year: number, value: number, padding: number): string =>
  `${prefix.toUpperCase()}-${year}-${String(value).padStart(Math.max(1, padding), '0')}`;
