import type { NextFunction, Request, Response } from 'express';

/* eslint-disable no-control-regex */
const FORBIDDEN_KEY = /^\$|\./;

/**
 * Strip MongoDB operator keys (`$ne`, `where`, dotted paths, ...) from every
 * user-controlled object. `mongoose.sanitizeFilter` additionally rejects `$where`
 * style filters, but payload level cleaning is still required.
 */
const clean = (value: unknown, depth = 0): unknown => {
  if (depth > 12) return value;

  if (Array.isArray(value)) {
    return value.map((item) => clean(item, depth + 1));
  }

  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(key)) continue;
      if (typeof item === 'string') {
        // Remove NUL bytes and control characters used in NoSQL/JWT smuggling.
        output[key] = item.replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '');
        continue;
      }
      output[key] = clean(item, depth + 1);
    }
    return output;
  }

  if (typeof value === 'string') {
    return value.replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  return value;
};

export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body && typeof req.body === 'object') {
    req.body = clean(req.body) as Request['body'];
  }
  if (req.params && typeof req.params === 'object') {
    for (const key of Object.keys(req.params)) {
      const value = req.params[key];
      if (typeof value === 'string') req.params[key] = value.replace(/\u0000/g, '');
    }
  }
  next();
};
