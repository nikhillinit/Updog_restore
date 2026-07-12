// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installAuthFetch } from '@/lib/install-auth-fetch';

type AuthFetchWindow = Window & { __auth_fetch_installed?: boolean };

describe('installAuthFetch', () => {
  let originalFetch: typeof window.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = window.fetch;
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    window.fetch = fetchMock as typeof window.fetch;
    document.cookie = 'updog.csrf=; Max-Age=0; Path=/';
  });

  afterEach(() => {
    window.fetch = originalFetch;
    delete (window as AuthFetchWindow).__auth_fetch_installed;
    vi.restoreAllMocks();
  });

  function lastInit(): RequestInit | undefined {
    return fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined;
  }
  function headerOf(init: RequestInit | undefined, name: string): string | null {
    return new Headers(init?.headers).get(name);
  }

  it('includes cookie credentials on same-origin safe API requests without CSRF', async () => {
    installAuthFetch();
    await window.fetch('/api/funds/1/metrics');
    expect(lastInit()?.credentials).toBe('include');
    expect(headerOf(lastInit(), 'X-CSRF-Token')).toBeNull();
    expect(headerOf(lastInit(), 'Authorization')).toBeNull();
  });

  it('attaches an existing CSRF cookie to same-origin unsafe API requests', async () => {
    document.cookie = 'updog.csrf=signed-token; Path=/';
    installAuthFetch();
    await window.fetch('/api/funds', { method: 'POST' });
    expect(headerOf(lastInit(), 'X-CSRF-Token')).toBe('signed-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bootstraps CSRF once when the readable cookie is absent', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'bootstrapped-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    installAuthFetch();
    await window.fetch('/api/funds', { method: 'POST' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/csrf');
    expect(headerOf(lastInit(), 'X-CSRF-Token')).toBe('bootstrapped-token');
  });

  it('refreshes CSRF before login even when a prior session token cookie exists', async () => {
    document.cookie = 'updog.csrf=prior-session-token; Path=/';
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'login-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    installAuthFetch();
    await window.fetch('/api/auth/login', { method: 'POST' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/csrf');
    expect(headerOf(lastInit(), 'X-CSRF-Token')).toBe('login-token');
  });

  it('does not alter cross-origin API requests', async () => {
    installAuthFetch();
    await window.fetch('https://evil.example.com/api/funds/1', { method: 'POST' });
    expect(lastInit()?.credentials).toBeUndefined();
    expect(headerOf(lastInit(), 'X-CSRF-Token')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves caller headers and a caller-supplied CSRF token', async () => {
    installAuthFetch();
    await window.fetch('/api/funds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'caller-token' },
    });
    expect(headerOf(lastInit(), 'Content-Type')).toBe('application/json');
    expect(headerOf(lastInit(), 'X-CSRF-Token')).toBe('caller-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('installs once (idempotent) and returns the original response', async () => {
    installAuthFetch();
    installAuthFetch();
    const res = await window.fetch('/api/funds/1/metrics');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
