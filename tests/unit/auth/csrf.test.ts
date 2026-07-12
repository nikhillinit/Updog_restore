import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_SESSION_SECRET = 'csrf-test-session-secret-at-least-32-characters';
let originalSessionSecret: string | undefined;

async function loadCsrf() {
  return import('../../../server/lib/auth/csrf');
}

function changeFirstCharacter(value: string): string {
  if (!value) return 'x';
  return `${value[0] === 'a' ? 'b' : 'a'}${value.slice(1)}`;
}

describe('signed double-submit CSRF token primitive', () => {
  beforeEach(() => {
    originalSessionSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
    vi.resetModules();
  });

  it('creates a token that validates only for its bound session jti', async () => {
    const { createSessionCsrfToken, verifySessionCsrfToken } = await loadCsrf();
    const token = createSessionCsrfToken('session-jti-1');

    expect(token).toEqual(expect.any(String));
    expect(token).not.toBe('');
    expect(verifySessionCsrfToken(token, 'session-jti-1')).toBe(true);
    expect(verifySessionCsrfToken(token, 'session-jti-2')).toBe(false);
  });

  it('rejects a modified nonce or MAC', async () => {
    const { createSessionCsrfToken, verifySessionCsrfToken } = await loadCsrf();
    const token = createSessionCsrfToken('session-jti-1');
    const [nonce = '', mac = ''] = token.split('.');

    expect(verifySessionCsrfToken(`${changeFirstCharacter(nonce)}.${mac}`, 'session-jti-1')).toBe(
      false
    );
    expect(verifySessionCsrfToken(`${nonce}.${changeFirstCharacter(mac)}`, 'session-jti-1')).toBe(
      false
    );
  });

  it.each(['', 'not-a-token', 'a.', '.b', 'a.b.c'])('rejects malformed token %j', async (token) => {
    const { verifySessionCsrfToken } = await loadCsrf();
    expect(() => verifySessionCsrfToken(token, 'session-jti-1')).not.toThrow();
    expect(verifySessionCsrfToken(token, 'session-jti-1')).toBe(false);
  });

  it('handles unequal comparison lengths without throwing', async () => {
    const { createSessionCsrfToken, verifySessionCsrfToken } = await loadCsrf();
    const token = createSessionCsrfToken('session-jti-1');

    expect(() => verifySessionCsrfToken(`${token}extra`, 'session-jti-1')).not.toThrow();
    expect(verifySessionCsrfToken(`${token}extra`, 'session-jti-1')).toBe(false);
  });

  it('keeps pre-auth tokens scoped to login rather than a browser session', async () => {
    const { createPreAuthCsrfToken, verifyPreAuthCsrfToken, verifySessionCsrfToken } =
      await loadCsrf();
    const token = createPreAuthCsrfToken();

    expect(verifyPreAuthCsrfToken(token)).toBe(true);
    expect(verifySessionCsrfToken(token, 'session-jti-1')).toBe(false);
  });
});
