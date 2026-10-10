import type { NextFunction, Request, Response } from 'express';
import type { Types } from 'mongoose';
import { IdempotencyKeyModel } from '../models/idempotency-key.model';
import { AppError, ErrorCode } from '../utils/errors';
import { sha256 } from '../utils/crypto';
import { requireAuth } from '../utils/tenant';
import { logger } from '../utils/logger';

const HEADER = 'idempotency-key';
const MAX_KEY_LENGTH = 120;

const requestFingerprint = (req: Request): string =>
  sha256(`${req.method}|${req.originalUrl}|${JSON.stringify(req.body ?? {})}`);

/**
 * Replay-safe mutation guard. A repeated key with the same payload returns the
 * original response; a repeated key with a different payload is rejected.
 * In-progress records are released if the handler throws, so a failed attempt
 * can be retried with the same key.
 */
export const idempotency = (): ((req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  async (req, res, next) => {
    const key = req.header(HEADER)?.trim();
    if (!key) {
      next();
      return;
    }
    if (key.length > MAX_KEY_LENGTH || !/^[A-Za-z0-9._:-]+$/.test(key)) {
      next(
        new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          `${HEADER} header must be 1-${MAX_KEY_LENGTH} characters of A-Z, a-z, 0-9, dot, colon, underscore or dash`
        )
      );
      return;
    }

    const auth = requireAuth(req.auth);
    const fingerprint = requestFingerprint(req);

    try {
      const record = await IdempotencyKeyModel.findOneAndUpdate(
        { agencyId: auth.agencyId, userId: auth.userId, key },
        {
          $setOnInsert: {
            agencyId: auth.agencyId,
            userId: auth.userId,
            key,
            method: req.method,
            path: req.originalUrl,
            requestHash: fingerprint,
            status: 'IN_PROGRESS'
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const existing = record;
      if (!existing) {
        next();
        return;
      }

      if (existing.requestHash !== fingerprint) {
        next(
          new AppError(
            409,
            ErrorCode.IDEMPOTENCY_CONFLICT,
            'This idempotency key was already used with a different request payload'
          )
        );
        return;
      }

      if (existing.status === 'COMPLETED') {
        logger.debug('Replaying idempotent response', { key, path: req.originalUrl });
        res.status(existing.statusCode ?? 200).json(existing.responseBody);
        return;
      }

      // Another request with the same key is still running.
      const createdRecently = Date.now() - existing.createdAt.getTime() < 30_000;
      if (existing.status === 'IN_PROGRESS' && !createdRecently) {
        next(
          new AppError(
            409,
            ErrorCode.IDEMPOTENCY_CONFLICT,
            'A previous request with this idempotency key failed; retry with a new key'
          )
        );
        return;
      }

      req.idempotency = {
        key,
        recordId: existing._id,
        replayed: false,
        release: async () => {
          await IdempotencyKeyModel.deleteOne({ _id: existing._id, status: 'IN_PROGRESS' }).exec();
        },
        complete: async (statusCode: number, body: unknown, resourceId?: Types.ObjectId) => {
          await IdempotencyKeyModel.updateOne(
            { _id: existing._id },
            {
              $set: {
                status: 'COMPLETED',
                statusCode,
                responseBody: body as never,
                ...(resourceId ? { resourceId } : {})
              }
            }
          ).exec();
        }
      };

      next();
    } catch (error) {
      next(error);
    }
  };

export const IDEMPOTENCY_HEADER = HEADER;
