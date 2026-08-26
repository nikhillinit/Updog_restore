import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isStubMode } from '@/lib/env-detection';

describe('Wave 2 env-detection boundary', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true only when the stub-status response explicitly enables stub mode', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ stubMode: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(isStubMode()).resolves.toBe(true);
  });

  it('fails closed when the payload is malformed or the request fails', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ mode: 'stub' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(isStubMode()).resolves.toBe(false);

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(isStubMode()).resolves.toBe(false);
  });
});
