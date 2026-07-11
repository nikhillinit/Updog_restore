import { describe, it, expect, beforeEach } from 'vitest';
import { getToken, setToken, clearToken } from '@/lib/auth-token';

describe('auth-token', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns null when no token is stored', () => {
    expect(getToken()).toBeNull();
  });

  it('stores and reads a token', () => {
    setToken('abc');
    expect(getToken()).toBe('abc');
  });

  it('clears a stored token', () => {
    setToken('abc');
    clearToken();
    expect(getToken()).toBeNull();
  });
});
