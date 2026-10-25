import { describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { errorHandler } from '../src/middleware/error-handler';
import { AppError, ErrorCode } from '../src/utils/errors';

interface Result {
  statusCode: number;
  body: unknown;
}

const run = (error: unknown): Result => {
  const result: Result = { statusCode: 0, body: undefined };
  const req = { requestId: 'test-request', method: 'POST', originalUrl: '/api/auth/login' } as unknown as Request;
  const res = {
    headersSent: false,
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      result.body = payload;
      return this;
    }
  } as unknown as Response;
  errorHandler(error, req, res, (() => undefined) as NextFunction);
  return result;
};

describe('api error handler', () => {
  it('reports a MongoDB outage as 503 instead of a generic 500', () => {
    const outage = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:27017'), {
      name: 'MongoServerSelectionError'
    });

    const { statusCode, body } = run(outage);

    expect(statusCode).toBe(503);
    expect((body as { error: { message: string } }).error.message).toMatch(/temporarily unavailable/i);
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|27017/);
  });

  it('classifies a buffering timeout as a database outage', () => {
    const { statusCode } = run(new Error('Operation `users.findOne()` buffering timed out after 10000ms'));
    expect(statusCode).toBe(503);
  });

  it('keeps application errors with their own status and code', () => {
    const { statusCode, body } = run(AppError.unauthorized('Invalid email or password', ErrorCode.INVALID_CREDENTIALS));

    expect(statusCode).toBe(401);
    expect((body as { success: boolean }).success).toBe(false);
    expect((body as { error: { code: string; message: string } }).error).toEqual({
      code: ErrorCode.INVALID_CREDENTIALS,
      message: 'Invalid email or password'
    });
  });

  it('never leaks an unexpected internal error message to the client', () => {
    const { statusCode, body } = run(new Error('secret stack detail: connection string password'));

    expect(statusCode).toBe(500);
    expect((body as { error: { message: string } }).error.message).toBe('Unexpected server error');
  });
});
