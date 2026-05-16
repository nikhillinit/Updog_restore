import { describe, expect, it } from 'vitest';
import {
  getRouteErrorMessage,
  isErrorWithMessage,
  mapErrorToHttpStatus,
  stringifyErrorMessage,
} from '../../../server/lib/errorHandling';
import {
  createDatabaseError,
  createDeploymentError,
  createHealthCheckError,
  createIdempotencyError,
  createRateLimitError,
  createValidationError,
} from '../../../server/types/errors';

describe('error handling helper semantics', () => {
  it('keeps route-facing errors tolerant of message-bearing objects', () => {
    expect(getRouteErrorMessage(new Error('boom'))).toBe('boom');
    expect(getRouteErrorMessage({ message: 'plain object failure' })).toBe('plain object failure');
    expect(getRouteErrorMessage('string failure')).toBe('Unknown error');
  });

  it('detects only object errors with string message fields', () => {
    expect(isErrorWithMessage({ message: 'usable' })).toBe(true);
    expect(isErrorWithMessage({ message: 42 })).toBe(false);
    expect(isErrorWithMessage(null)).toBe(false);
  });

  it('keeps internal non-Error values stringified for logging paths', () => {
    expect(stringifyErrorMessage(new Error('internal boom'))).toBe('internal boom');
    expect(stringifyErrorMessage('string failure')).toBe('string failure');
    expect(stringifyErrorMessage(42)).toBe('42');
  });

  it('keeps the unified HTTP status mapping stable', () => {
    const cases: Array<[Error, number]> = [
      [createValidationError('bad field', 'name', '', 'required', 'nonempty'), 400],
      [createRateLimitError('too many', 'user-1', 10, 60000, 30, 'memory'), 429],
      [createIdempotencyError('conflict', 'key-1', 'hash-1', 'different_request'), 409],
      [createDatabaseError('db unavailable'), 503],
      [createHealthCheckError('health failed', 'redis', 'connectivity'), 503],
      [createDeploymentError('deploying'), 503],
      [new Error('plain failure'), 500],
    ];

    for (const [error, status] of cases) {
      expect(mapErrorToHttpStatus(error)).toBe(status);
    }
  });
});
