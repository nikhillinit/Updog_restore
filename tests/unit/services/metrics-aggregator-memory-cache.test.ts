import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/db', () => ({ db: {} }));
vi.mock('../../../server/storage', () => ({ storage: {} }));
vi.mock('../../../server/services/actual-metrics-calculator', () => ({
  ActualMetricsCalculator: class {},
  isLivePortfolioCompany: () => true,
}));
vi.mock('../../../server/services/projected-metrics-calculator', () => ({
  ProjectedMetricsCalculator: class {},
}));
vi.mock('../../../server/services/variance-calculator', () => ({
  VarianceCalculator: class {},
}));

import { InMemoryCache } from '../../../server/services/metrics-aggregator';

const HASH_A = 'a'.repeat(64);

function fingerprintedKey(headId: number, hash = HASH_A): string {
  return `unified:v3:fund:1:facts:${headId}:${hash}:no-proj`;
}

describe('MetricsAggregator InMemoryCache bounds', () => {
  function makeCache(options?: ConstructorParameters<typeof InMemoryCache>[0]): InMemoryCache {
    return new InMemoryCache({ sweepIntervalMs: 0, ...options });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T17:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('evicts the least recently used fingerprinted key once the bound is exceeded', async () => {
    const cache = makeCache({ maxSize: 3 });

    for (const headId of [1, 2, 3]) {
      await cache.set(fingerprintedKey(headId), { headId }, { ttlSeconds: 300 });
    }
    expect(cache.size).toBe(3);

    await cache.set(fingerprintedKey(4), { headId: 4 }, { ttlSeconds: 300 });

    expect(cache.size).toBe(3);
    expect(await cache.get(fingerprintedKey(1))).toBeNull();
    expect(await cache.get(fingerprintedKey(2))).toEqual({ headId: 2 });
    expect(await cache.get(fingerprintedKey(3))).toEqual({ headId: 3 });
    expect(await cache.get(fingerprintedKey(4))).toEqual({ headId: 4 });
  });

  it('keeps thousands of superseded heads from accumulating', async () => {
    const cache = makeCache({ maxSize: 50 });

    for (let headId = 1; headId <= 5_000; headId += 1) {
      await cache.set(fingerprintedKey(headId), { headId }, { ttlSeconds: 300 });
    }

    expect(cache.size).toBe(50);
    expect(await cache.get(fingerprintedKey(1))).toBeNull();
    expect(await cache.get(fingerprintedKey(5_000))).toEqual({ headId: 5_000 });
  });

  it('treats a read as recent use when choosing the eviction victim', async () => {
    const cache = makeCache({ maxSize: 3 });

    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);
    expect(await cache.get('a')).toBe(1);

    await cache.set('d', 4);

    expect(await cache.get('a')).toBe(1);
    expect(await cache.get('b')).toBeNull();
    expect(await cache.get('c')).toBe(3);
    expect(await cache.get('d')).toBe(4);
  });

  it('sweeps expired entries before evicting live ones at capacity', async () => {
    const cache = makeCache({ maxSize: 3 });

    await cache.set('expiring', 1, { ttlSeconds: 1 });
    await cache.set('live-1', 2, { ttlSeconds: 300 });
    await cache.set('live-2', 3, { ttlSeconds: 300 });
    vi.advanceTimersByTime(2_000);

    await cache.set('new', 4, { ttlSeconds: 300 });

    expect(cache.size).toBe(3);
    expect(await cache.get('expiring')).toBeNull();
    expect(await cache.get('live-1')).toBe(2);
    expect(await cache.get('live-2')).toBe(3);
    expect(await cache.get('new')).toBe(4);
  });

  it('releases expired entries on the periodic sweep without any read', async () => {
    const cache = makeCache({ maxSize: 100, sweepIntervalMs: 1_000 });

    await cache.set(fingerprintedKey(1), { headId: 1 }, { ttlSeconds: 1 });
    await cache.set(fingerprintedKey(2), { headId: 2 }, { ttlSeconds: 300 });
    expect(cache.size).toBe(2);

    vi.advanceTimersByTime(2_000);

    expect(cache.size).toBe(1);
    expect(await cache.get(fingerprintedKey(2))).toEqual({ headId: 2 });
  });

  it('lets setnx reacquire a lock whose entry has expired', async () => {
    const cache = makeCache({ maxSize: 10 });

    expect(await cache.setnx('lock', '1', 1)).toBe(true);
    expect(await cache.setnx('lock', '1', 1)).toBe(false);

    vi.advanceTimersByTime(1_500);

    expect(await cache.setnx('lock', '1', 1)).toBe(true);
  });

  it('reads the bound from CACHE_MAX_KEYS and falls back to 5000', () => {
    vi.stubEnv('CACHE_MAX_KEYS', '7');
    expect(makeCache().maxSize).toBe(7);

    vi.stubEnv('CACHE_MAX_KEYS', 'not-a-number');
    expect(makeCache().maxSize).toBe(5_000);

    vi.stubEnv('CACHE_MAX_KEYS', '0');
    expect(makeCache().maxSize).toBe(5_000);
  });
});
