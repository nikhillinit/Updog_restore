import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { contractFetch } from '@/hooks/lp-reporting/contract-fetch';

const SuccessSchema = z.object({
  id: z.number(),
  status: z.literal('ok'),
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('contractFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and parses a successful response through the supplied schema', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ id: 17, status: 'ok' }));

    await expect(
      contractFetch('/api/test', { method: 'POST' }, SuccessSchema, 'contract mismatch')
    ).resolves.toEqual({ id: 17, status: 'ok' });

    expect(fetchSpy).toHaveBeenCalledWith('/api/test', { method: 'POST' });
  });

  it('throws the LP reporting hook error shape for HTTP errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ code: 'CONFLICT', message: 'Preview hash changed' }, { status: 409 })
    );

    await expect(
      contractFetch('/api/test', {}, SuccessSchema, 'contract mismatch')
    ).rejects.toMatchObject({
      message: 'Preview hash changed',
      code: 'CONFLICT',
      status: 409,
    });
  });

  it('throws CONTRACT_PARSE_ERROR when the response violates the schema', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'bad' }, { status: 200 }));

    await expect(
      contractFetch('/api/test', {}, SuccessSchema, 'contract mismatch')
    ).rejects.toMatchObject({
      message: 'contract mismatch',
      code: 'CONTRACT_PARSE_ERROR',
      status: 200,
    });
  });
});
