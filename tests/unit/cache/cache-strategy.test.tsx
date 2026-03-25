import { describe, expect, it, vi } from 'vitest';
import { CalculationCache, clearCache, globalCalculationCache } from '@/lib/cache-strategy';

describe('Wave 2 cache-strategy boundary', () => {
  it('stores and returns cached values for identical inputs', async () => {
    const cache = new CalculationCache<{ fundId: string }, number>();

    await cache.set({ fundId: 'fund-1' }, 42);

    await expect(cache.get({ fundId: 'fund-1' })).resolves.toBe(42);
  });

  it('expires entries after the configured TTL', async () => {
    const cache = new CalculationCache<{ fundId: string }, number>(10, 1000);
    let now = 0;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    await cache.set({ fundId: 'fund-1' }, 7);
    now = 1001;

    await expect(cache.get({ fundId: 'fund-1' })).resolves.toBeNull();

    dateNowSpy.mockRestore();
  });

  it('evicts the oldest untouched entry when capacity is exceeded', async () => {
    const cache = new CalculationCache<{ fundId: string }, number>(2, 60_000);

    await cache.set({ fundId: 'fund-1' }, 1);
    await cache.set({ fundId: 'fund-2' }, 2);
    await cache.get({ fundId: 'fund-1' });
    await cache.set({ fundId: 'fund-3' }, 3);

    await expect(cache.get({ fundId: 'fund-1' })).resolves.toBe(1);
    await expect(cache.get({ fundId: 'fund-2' })).resolves.toBeNull();
    await expect(cache.get({ fundId: 'fund-3' })).resolves.toBe(3);
  });

  it('clears the global cache singleton', async () => {
    await globalCalculationCache.set({ fundId: 'global' }, { ok: true });
    clearCache();

    await expect(globalCalculationCache.get({ fundId: 'global' })).resolves.toBeNull();
  });
});
