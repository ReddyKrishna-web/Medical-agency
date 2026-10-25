import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from '@/lib/api';

/**
 * Regression cover for the misleading "Unable to reach the service" banner:
 * only a request that never received an HTTP response may be reported as a
 * connectivity problem. Every real status keeps its own message.
 */
describe('API error messages', () => {
  it('reports a real connectivity failure only when there was no response', () => {
    const message = apiErrorMessage(undefined);
    expect(message).toMatch(/unable to reach the service/i);
    expect(message).toMatch(/API server is running/i);
  });

  it('reports a timeout separately from a refused connection', () => {
    expect(apiErrorMessage(undefined, true)).toMatch(/too long to respond/i);
    expect(apiErrorMessage(408)).toMatch(/too long to respond/i);
  });

  it('never describes an HTTP status as a connection failure', () => {
    for (const status of [400, 401, 403, 404, 409, 413, 422, 429, 500, 502, 503, 504]) {
      expect(apiErrorMessage(status)).not.toMatch(/unable to reach/i);
    }
  });

  it('maps authentication and authorization statuses to accurate messages', () => {
    expect(apiErrorMessage(401)).toMatch(/session/i);
    expect(apiErrorMessage(403)).toMatch(/do not have access/i);
  });

  it('maps rate limiting and server faults to accurate messages', () => {
    expect(apiErrorMessage(429)).toMatch(/too many requests/i);
    expect(apiErrorMessage(500)).toMatch(/service encountered an error/i);
    expect(apiErrorMessage(503)).toMatch(/temporarily unavailable/i);
  });

  it('handles an unexpected status without advertising a network problem', () => {
    expect(apiErrorMessage(418)).toMatch(/could not complete/i);
  });
});
