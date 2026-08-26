import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('server cache runtime', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    const cacheModule = await import('../../../server/cache/index');
    await cacheModule.closeCache();
    delete process.env['REDIS_URL'];
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('buildCache uses bounded memory cache in memory mode', async () => {
    process.env['REDIS_URL'] = 'memory://';

    const { buildCache } = await import('../../../server/cache/index');
    const { BoundedMemoryCache } = await import('../../../server/cache/memory');

    const cache = await buildCache();

    expect(cache).toBeInstanceOf(BoundedMemoryCache);
    await cache.close();
  });

  it('getCache returns a singleton until closeCache resets it', async () => {
    process.env['REDIS_URL'] = 'memory://';

    const cacheModule = await import('../../../server/cache/index');
    const { BoundedMemoryCache } = await import('../../../server/cache/memory');

    const first = await cacheModule.getCache();
    const second = await cacheModule.getCache();

    expect(first).toBe(second);

    await cacheModule.closeCache();

    const third = await cacheModule.getCache();
    expect(third).toBeInstanceOf(BoundedMemoryCache);
    expect(third).not.toBe(first);
  });
});

describe('BoundedMemoryCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('evicts the least recently used item when full', async () => {
    const { BoundedMemoryCache } = await import('../../../server/cache/memory');
    const cache = new BoundedMemoryCache({ maxSize: 2, defaultTTL: 60, cleanupInterval: 10_000 });

    await cache.set('a', '1');
    await cache.set('b', '2');
    await cache.get('a');
    await cache.set('c', '3');

    expect(await cache.get('a')).toBe('1');
    expect(await cache.get('b')).toBeNull();
    expect(await cache.get('c')).toBe('3');

    await cache.close();
  });

  it('expires entries after their TTL', async () => {
    vi.useFakeTimers();

    const { BoundedMemoryCache } = await import('../../../server/cache/memory');
    const cache = new BoundedMemoryCache({ defaultTTL: 1, cleanupInterval: 10_000 });

    await cache.set('short', 'lived', 1);
    expect(await cache.get('short')).toBe('lived');

    vi.advanceTimersByTime(1_100);

    expect(await cache.get('short')).toBeNull();
    await cache.close();
  });
});
