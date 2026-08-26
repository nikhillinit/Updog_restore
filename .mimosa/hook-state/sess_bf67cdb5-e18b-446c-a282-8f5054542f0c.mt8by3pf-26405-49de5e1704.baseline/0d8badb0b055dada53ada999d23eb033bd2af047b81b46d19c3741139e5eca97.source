import { describe, it, expect, beforeEach } from 'vitest';
import { LEGACY_AUTH_TOKEN_KEY, purgeLegacyAuthToken } from '@/lib/auth-token';

describe('auth-token', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('removes the retired browser credential without exposing a read/write API', () => {
    window.localStorage.setItem(LEGACY_AUTH_TOKEN_KEY, 'jwt-legacy');
    window.localStorage.setItem('unrelated', 'keep');

    purgeLegacyAuthToken();

    expect(window.localStorage.getItem(LEGACY_AUTH_TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem('unrelated')).toBe('keep');
  });
});
