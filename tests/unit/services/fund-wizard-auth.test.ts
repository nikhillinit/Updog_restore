import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('fund wizard service auth options', () => {
  beforeEach(() => {
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('includes credentials when saving a draft', async () => {
    const { saveFundDraft } = await import('@/services/fund-drafts');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await saveFundDraft(42, {
      fundName: 'Draft Fund',
      stages: [{ id: 'seed', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/funds/42/draft'),
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('includes credentials when loading a draft', async () => {
    const { fetchFundDraft } = await import('@/services/fund-drafts');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          config: {
            fundName: 'Draft Fund',
            stages: [{ id: 'seed', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchFundDraft(42);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/funds/42/draft'),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('includes credentials when finalizing a fund', async () => {
    const { finalizeFund } = await import('@/services/funds');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            fundId: 42,
            configVersion: 1,
            correlationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            published: true,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await finalizeFund({
      name: 'Finalize Fund',
      size: 50_000_000,
      managementFee: 0.02,
      carryPercentage: 0.2,
      vintageYear: 2026,
      stages: [{ id: 'seed', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/funds/finalize'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });
});
