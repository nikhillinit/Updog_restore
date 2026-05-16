import { describe, expect, it } from 'vitest';
import {
  getRouteErrorMessage,
  isErrorWithMessage,
  stringifyErrorMessage,
} from '../../../server/lib/errorHandling';

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
});
