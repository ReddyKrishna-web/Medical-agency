import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { AppError, ErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';
import { env } from '../config/env';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * A MongoDB outage surfaces as the driver's `MongoServerSelectionError` (or a
 * buffering timeout), not always as mongoose's own subclass, so match on the
 * error identity as well as the class. It must not be reported as a generic 500.
 */
const isDatabaseUnavailable = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  if (error instanceof mongoose.Error.MongooseServerSelectionError) return true;
  const candidate = error as { name?: string; message?: string };
  const name = candidate.name ?? '';
  const message = candidate.message ?? '';
  return (
    name === 'MongoServerSelectionError' ||
    name === 'MongooseServerSelectionError' ||
    name === 'MongoNetworkError' ||
    name === 'MongoNotConnectedError' ||
    /buffering timed out/i.test(message)
  );
};

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: number }).code === 11000;

const duplicateKeyMessage = (error: unknown): string => {
  const keys = (error as { keyValue?: Record<string, unknown> }).keyValue ?? {};
  const fields = Object.keys(keys);
  if (fields.includes('email')) return 'An account with this email address already exists';
  if (fields.includes('orderNumber')) return 'A duplicate order number was generated; please retry';
  if (fields.includes('invoiceNumber')) return 'A duplicate invoice number was generated; please retry';
  if (fields.includes('reference')) return 'A payment with this reference already exists';
  if (fields.includes('sku')) return 'A product with this SKU already exists';
  if (fields.includes('slug')) return 'A record with this slug already exists';
  return 'A record with these unique values already exists';
};

/** Never leak internals in production; log everything, expose only AppError messages. */
export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let body: ErrorBody = { code: ErrorCode.INTERNAL_ERROR, message: 'Unexpected server error' };

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    body = { code: error.code, message: error.message };
    if (error.details !== undefined) body.details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 422;
    body = {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    };
  } else if (error instanceof MulterError) {
    statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 422;
    body =
      error.code === 'LIMIT_FILE_SIZE'
        ? {
            code: ErrorCode.PAYLOAD_TOO_LARGE,
            message: `Uploaded file exceeds the ${env.MAX_FILE_SIZE_MB} MB limit`
          }
        : { code: ErrorCode.VALIDATION_ERROR, message: `Upload failed: ${error.message}` };
  } else if (isDuplicateKeyError(error)) {
    statusCode = 409;
    body = { code: ErrorCode.DUPLICATE_RESOURCE, message: duplicateKeyMessage(error) };
  } else if (error instanceof mongoose.Error.ValidationError) {
    statusCode = 422;
    body = {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'The submitted data is not valid',
      details: Object.values(error.errors).map((item) => ({
        path: item.path,
        message: item.message
      }))
    };
  } else if (error instanceof mongoose.Error.CastError) {
    statusCode = 400;
    body = { code: ErrorCode.INVALID_IDENTIFIER, message: `Invalid value for ${error.path}` };
  } else if (error instanceof mongoose.Error.DocumentNotFoundError) {
    statusCode = 404;
    body = { code: ErrorCode.NOT_FOUND, message: 'Resource was not found' };
  } else if (isDatabaseUnavailable(error)) {
    statusCode = 503;
    body = {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'The service is temporarily unavailable. Please try again shortly.'
    };
  } else if (error instanceof Error) {
    statusCode = 500;
    if (!env.isProduction && error.name === 'TokenExpiredError') {
      statusCode = 401;
      body = { code: ErrorCode.TOKEN_EXPIRED, message: 'Token has expired' };
    }
  }

  const logMeta = {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    userId: req.auth?.userId?.toString(),
    agencyId: req.auth?.agencyId?.toString(),
    statusCode,
    error: error instanceof Error ? { name: error.name, message: error.message } : error
  };

  if (statusCode >= 500) logger.error('Request failed', logMeta);
  else logger.warn('Request rejected', logMeta);

  if (res.headersSent) return;

  res.status(statusCode).json({
    success: false,
    error: body
  });
};

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(
    new AppError(404, ErrorCode.NOT_FOUND, `Route ${req.method} ${req.originalUrl} was not found`)
  );
};
