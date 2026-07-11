// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getToken } from '@/lib/auth-token';
import { installAuthFetch } from '@/lib/install-auth-fetch';

vi.mock('@/lib/auth-token', () => ({ getToken: vi.fn() }));

type AuthFetchWindow = Window & { __auth_fetch_installed?: boolean };

const mockGetToken = vi.mocked(getToken);

describe('installAuthFetch', () => {
  let originalFetch: typeof window.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = window.fetch;
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    window.fetch = fetchMock as typeof window.fetch;
    mockGetToken.mockReturnValue(null);
  });

  afterEach(() => {
    window.fetch = originalFetch;
    delete (window as AuthFetchWindow).__auth_fetch_installed;
    vi.restoreAllMocks();
  });

  function lastInit(): RequestInit | undefined {
    return fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined;
  }
  function authOf(init: RequestInit | undefined): string | null {
    return new Headers(init?.headers).get('Authorization');
  }

  it('attaches Bearer to same-origin /api/* when a token exists', async () => {
    mockGetToken.mockReturnValue('tok123');
    installAuthFetch();
    await window.fetch('/api/funds/1/metrics');
    expect(authOf(lastInit())).toBe('Bearer tok123');
  });

  it('does not attach when no token is present', async () => {
    mockGetToken.mockReturnValue(null);
    installAuthFetch();
    await window.fetch('/api/funds/1/metrics');
    expect(authOf(lastInit())).toBeNull();
  });

  it('does not override an Authorization header the caller already set', async () => {
    mockGetToken.mockReturnValue('tok123');
    installAuthFetch();
    await window.fetch('/api/funds/1/metrics', { headers: { Authorization: 'Bearer caller' } });
    expect(authOf(lastInit())).toBe('Bearer caller');
  });

  it('does not attach to non-/api same-origin requests', async () => {
    mockGetToken.mockReturnValue('tok123');
    installAuthFetch();
    await window.fetch('/assets/app.js');
    expect(authOf(lastInit())).toBeNull();
  });

  it('does not attach to cross-origin /api requests (token-leak guard)', async () => {
    mockGetToken.mockReturnValue('tok123');
    installAuthFetch();
    await window.fetch('https://evil.example.com/api/funds/1');
    expect(authOf(lastInit())).toBeNull();
  });

  it('preserves existing headers while adding Authorization', async () => {
    mockGetToken.mockReturnValue('tok123');
    installAuthFetch();
    await window.fetch('/api/funds/1/metrics', { headers: { 'Content-Type': 'application/json' } });
    const headers = new Headers(lastInit()?.headers);
    expect(headers.get('Authorization')).toBe('Bearer tok123');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('installs once (idempotent) and returns the original response', async () => {
    mockGetToken.mockReturnValue('tok123');
    installAuthFetch();
    installAuthFetch();
    const res = await window.fetch('/api/funds/1/metrics');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
