import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env';
import { AppError, ErrorCode } from '../utils/errors';

const handler = (req: Request, res: Response): void => {
  res.status(429).json({
    success: false,
    error: {
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many requests. Please slow down and try again shortly.'
    }
  });
};

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  // Rate limiting must not break a health probe.
  skip: (req: Request) => req.path === '/health' || req.path === '/api/health'
};

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  ...shared
});

/** Stricter window for credential endpoints to slow brute force attempts. */
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  ...shared,
  skipSuccessfulRequests: true
});

/** Writes that create expensive server-side work. */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  ...shared
});

export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  ...shared
});

/**
 * Unauthenticated, IP-scoped limiter for public web forms. Kept deliberately
 * strict because the endpoint is reachable without a session, and every
 * attempt — including a rejected one — counts against the budget, so a
 * malformed payload cannot be used to probe the API for free.
 */
export const publicFormLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  ...shared
});

export const assertRateLimitConfigured = (): void => {
  if (!env.RATE_LIMIT_MAX || !env.AUTH_RATE_LIMIT_MAX) {
    throw AppError.internal('Rate limiting is not configured');
  }
};
