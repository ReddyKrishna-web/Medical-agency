import type { NextFunction, Request, Response } from 'express';

/**
 * Express 5 route handlers may be async. This wrapper makes the intent explicit
 * and forwards any rejection to the Express error pipeline.
 */
export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): AsyncRequestHandler =>
  (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
