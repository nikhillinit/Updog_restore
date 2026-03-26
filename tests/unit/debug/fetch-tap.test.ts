// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/logger';
import { installFetchTap } from '@/debug/fetch-tap';

describe('Wave 5 fetch tap policy', () => {
  let originalFetch: typeof window.fetch;

  beforeEach(() => {
    originalFetch = window.fetch;
    vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('performance', {
      now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(112.4),
    });
  });

  afterEach(() => {
    window.fetch = originalFetch;
    delete (window as Window & { __fetch_tap_installed?: boolean }).__fetch_tap_installed;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('wraps fetch once and logs successful requests through the shared logger', async () => {
    vi.stubEnv('VITE_WIZARD_DEBUG', '1');

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    window.fetch = fetchMock as typeof window.fetch;

    installFetchTap();
    installFetchTap();

    const response = await window.fetch('/api/funds', { method: 'POST' });

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      'FETCH',
      expect.objectContaining({
        method: 'POST',
        url: '/api/funds',
        status: 204,
        durationMs: 12.4,
      })
    );
  });

  it('logs network failures and rethrows the original error', async () => {
    vi.stubEnv('VITE_WIZARD_DEBUG', '1');

    const failure = new Error('offline');
    window.fetch = vi.fn().mockRejectedValue(failure) as typeof window.fetch;

    installFetchTap();

    await expect(window.fetch('/api/funds')).rejects.toThrow('offline');
    expect(logger.warn).toHaveBeenCalledWith(
      'FETCH NETWORK ERROR',
      expect.objectContaining({
        method: 'GET',
        url: '/api/funds',
        error: 'offline',
      })
    );
  });
});
