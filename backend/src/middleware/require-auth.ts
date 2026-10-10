import type { RequestHandler } from 'express';
import { AppError } from '../utils/errors';
import { requireAuth as resolveAuth } from '../utils/tenant';

/**
 * Terminal middleware: 401 when the request is not authenticated. Route handlers
 * then call `requireAuth(req.auth)` to obtain the typed context.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const requireAuth: RequestHandler<any, any, any, any, any> = (req, _res, next) => {
  if (!req.auth) {
    next(AppError.unauthorized());
    return;
  }
  try {
    resolveAuth(req.auth);
    next();
  } catch (error) {
    next(error);
  }
};
/* eslint-enable @typescript-eslint/no-explicit-any */
