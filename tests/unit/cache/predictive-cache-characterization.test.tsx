/**
 * Characterization tests for IntelligentReservesCache
 *
 * Safety harness for ESLint Wave 0.5: captures current cache behavior so
 * refactoring in Wave 2 does not break caching, TTL, or batch semantics.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the metrics module before importing cache
vi.mock('@/metrics/reserves-metrics', () => ({
  metrics: {
    recordCacheHit: vi.fn(),
    recordCacheMiss: vi.fn(),
    recordError: vi.fn(),
    recordBatchProcessing: vi.fn(),
    recordPrefetch: vi.fn(),
  },
}));

import { IntelligentReservesCache } from '@/lib/predictive-cache';
import type { ReservesInput, ReservesConfig, ReservesResult } from '@shared/types/reserves-v11';

const makeInput = (id = 'test'): ReservesInput =>
  ({ fundId: id, companies: [] }) as unknown as ReservesInput;
const makeConfig = (): ReservesConfig => ({}) as unknown as ReservesConfig;
const makeResult = (v = 1): ReservesResult =>
  ({ totalReserves: v, allocations: [] }) as unknown as ReservesResult;

/** Start a cache.get and advance fake timers to let the batch fire. */
async function getWithTimerFlush(
  cache: IntelligentReservesCache,
  key: string,
  calculator: (...args: unknown[]) => Promise<ReservesResult>,
  input: ReservesInput,
  config: ReservesConfig
): Promise<ReservesResult> {
  const promise = cache.get(key, calculator, input, config);
  // Advance past BATCH_DELAY (10ms) so the setTimeout fires
  await vi.advanceTimersByTimeAsync(50);
  return promise;
}

describe('IntelligentReservesCache (characterization)', () => {
  let cache: IntelligentReservesCache;
  let calculator: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new IntelligentReservesCache();
    calculator = vi.fn().mockResolvedValue(makeResult(42));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns calculator result on cache miss', async () => {
    const result = await getWithTimerFlush(cache, 'key-1', calculator, makeInput(), makeConfig());
    expect(result).toEqual(makeResult(42));
    expect(calculator).toHaveBeenCalledTimes(1);
  });

  it('returns cached result on cache hit (no recalculation)', async () => {
    // First call: miss
    await getWithTimerFlush(cache, 'key-1', calculator, makeInput(), makeConfig());

    // Second call: hit (returns from cache synchronously, but still needs timer flush)
    const result = await getWithTimerFlush(cache, 'key-1', calculator, makeInput(), makeConfig());
    expect(result).toEqual(makeResult(42));
    // Calculator only called once (the miss)
    expect(calculator).toHaveBeenCalledTimes(1);
  });

  it('evicts entries after TTL expires', async () => {
    await getWithTimerFlush(cache, 'key-1', calculator, makeInput(), makeConfig());

    // Advance past max TTL (10 minutes)
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);

    // Next get should miss and recalculate
    calculator.mockResolvedValue(makeResult(99));
    const result = await getWithTimerFlush(cache, 'key-1', calculator, makeInput(), makeConfig());
    expect(result).toEqual(makeResult(99));
    expect(calculator).toHaveBeenCalledTimes(2);
  });

  it('clearCache removes all entries', async () => {
    await getWithTimerFlush(cache, 'key-1', calculator, makeInput(), makeConfig());

    cache.clearCache();

    calculator.mockResolvedValue(makeResult(77));
    const result = await getWithTimerFlush(cache, 'key-1', calculator, makeInput(), makeConfig());
    expect(result).toEqual(makeResult(77));
    expect(calculator).toHaveBeenCalledTimes(2);
  });
});
