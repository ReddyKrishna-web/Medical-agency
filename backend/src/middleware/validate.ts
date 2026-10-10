import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { AppError, ErrorCode } from '../utils/errors';

type Source = 'body' | 'query' | 'params';

const parse = (schema: ZodTypeAny, value: unknown, source: Source): unknown => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      422,
      ErrorCode.VALIDATION_ERROR,
      'Request validation failed',
      {
        source,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }))
      }
    );
  }
  return result.data;
};

declare module 'express-serve-static-core' {
  interface Request {
    validated?: Record<string, unknown>;
  }
}

/**
 * Validate and *replace* the request payload with the parsed result so handlers
 * only ever see coerced, whitelisted data.
 */
export const validate = (
  schema: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }
): RequestHandler => (req: Request, _res: Response, next: NextFunction): void => {
  const sources: Source[] = ['body', 'query', 'params'];
  for (const source of sources) {
    const sourceSchema = schema[source];
    if (!sourceSchema) continue;
    try {
      const parsed = parse(sourceSchema, req[source], source) as Record<string, unknown>;
      if (source === 'query') {
        // Express 5 exposes req.query through a getter; use the internal setter
        // path by defining the property when it is configurable.
        Object.defineProperty(req, 'query', {
          value: parsed,
          writable: true,
          configurable: true,
          enumerable: true
        });
      } else {
        req[source] = parsed as never;
      }
      req.validated = { ...(req.validated ?? {}), ...parsed };
    } catch (error) {
      next(error);
      return;
    }
  }
  next();
};

export const zId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');

export const validated = <T>(req: Request): T => (req.validated ?? {}) as T;
