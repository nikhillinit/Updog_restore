import { describe, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
import { createLPCache } from '../../../server/services/lp-cache';

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

class MockRedis {
  readonly store = new Map<string, string>();

  get = vi.fn(async (key: string) => this.store.get(key) ?? null);

  setex = vi.fn(async (key: string, _ttl: number, value: string) => {
    this.store.set(key, value);
  });

  scan = vi.fn(async (_cursor: string, _matchLiteral: 'MATCH', pattern: string) => {
    const matcher = wildcardToRegExp(pattern);
    const keys = Array.from(this.store.keys()).filter((key) => matcher.test(key));
    return ['0', keys] as [string, string[]];
  });

  del = vi.fn(async (...keys: string[]) => {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        deleted++;
      }
    }
    return deleted;
  });

  info = vi.fn(async () => 'used_memory:1048576\n');

  dbsize = vi.fn(async () => this.store.size);
}

function createRedis(): MockRedis {
  return new MockRedis();
}

describe('LPReportingCache', () => {
  it('caches LP summaries after a miss and reuses them on a hit', async () => {
    const redis = createRedis();
    const cache = createLPCache(redis as unknown as Redis);
    const fetchSummary = vi.fn().mockResolvedValue({ committed: 1000 });

    const first = await cache.getLPSummary('lp-1', fetchSummary);
    const second = await cache.getLPSummary('lp-1', fetchSummary);

    expect(first).toEqual({ committed: 1000 });
    expect(second).toEqual({ committed: 1000 });
    expect(fetchSummary).toHaveBeenCalledTimes(1);
    expect(redis.setex).toHaveBeenCalledWith(
      'lp:lp-1:summary',
      300,
      JSON.stringify({ committed: 1000 })
    );
  });

  it('invalidates keys that match a tag pattern', async () => {
    const redis = createRedis();
    const cache = createLPCache(redis as unknown as Redis);

    redis.store.set('lp:lp-1:summary', 'cached-summary');
    redis.store.set('lp:lp-1:performance:aggregate', 'cached-performance');
    redis.store.set('lp:lp-2:summary', 'other-lp');

    const deleted = await cache.invalidateByTag('lp:lp-1:*');

    expect(deleted).toBe(2);
    expect(redis.store.has('lp:lp-1:summary')).toBe(false);
    expect(redis.store.has('lp:lp-1:performance:aggregate')).toBe(false);
    expect(redis.store.has('lp:lp-2:summary')).toBe(true);
  });

  it('reports cache stats from Redis info output', async () => {
    const redis = createRedis();
    const cache = createLPCache(redis as unknown as Redis);

    redis.store.set('lp:lp-1:summary', 'cached-summary');

    const stats = await cache.getStats();

    expect(stats).toEqual({
      cacheSize: 1_048_576,
      estimatedItemCount: 1,
      memoryUsage: '1.00 MB',
    });
  });
});
