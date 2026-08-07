import { describe, expect, it } from 'vitest';
import { sanitizeQueueError } from '../../../server/lib/queue-error-sanitizer';

const SECRET = 'super-secret-password-sentinel';

function makeReplyError(): Error {
  // Mirrors redis-parser ReplyError shape: `command` is an enumerable own
  // property carrying the raw AUTH arguments (credential material).
  const error = new Error('WRONGPASS invalid username-password pair or user is disabled');
  error.name = 'ReplyError';
  Object.assign(error, {
    command: { name: 'auth', args: ['default', SECRET] },
    previousErrors: [{ command: { name: 'auth', args: [SECRET] } }],
  });
  return error;
}

describe('sanitizeQueueError', () => {
  it('preserves name, message, and stack from an Error', () => {
    const sanitized = sanitizeQueueError(makeReplyError());
    expect(sanitized.name).toBe('ReplyError');
    expect(sanitized.message).toContain('WRONGPASS');
    expect(sanitized.stack).toContain('ReplyError');
  });

  it('never includes command arguments or any credential material', () => {
    const sanitized = sanitizeQueueError(makeReplyError());
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('"command"');
    expect(serialized).not.toContain('"args"');
    expect(serialized).not.toContain('previousErrors');
  });

  it('emits only the fixed allowlisted keys', () => {
    const sanitized = sanitizeQueueError(makeReplyError());
    expect(Object.keys(sanitized).sort()).toEqual(['message', 'name', 'stack']);
  });

  it('coerces non-Error values without throwing', () => {
    expect(sanitizeQueueError('boom')).toEqual({ name: 'Error', message: 'boom' });
    expect(sanitizeQueueError(undefined)).toEqual({ name: 'Error', message: 'Unknown error' });
    expect(sanitizeQueueError({ message: SECRET }).message).toContain(SECRET.slice(0, 5));
    expect(JSON.stringify(sanitizeQueueError({ command: { args: [SECRET] } }))).not.toContain(
      SECRET
    );
  });
});
