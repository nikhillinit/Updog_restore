import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock only the metrics-aggregator singleton so the seam test does not load the
// real aggregator's heavy dependency graph (storage, db, calculators).
const { invalidateCache } = vi.hoisted(() => ({
  invalidateCache: vi.fn(),
}));

vi.mock('../../../server/services/metrics-aggregator', () => ({
  metricsAggregator: { invalidateCache },
}));

import { invalidateH9Artifacts } from '../../../server/services/h9-artifact-invalidation-service';

describe('invalidateH9Artifacts (H9 artifact invalidation seam)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCache.mockResolvedValue(undefined);
  });

  it('busts the metrics cache for the mutated fund', async () => {
    await invalidateH9Artifacts(7);

    expect(invalidateCache).toHaveBeenCalledTimes(1);
    expect(invalidateCache).toHaveBeenCalledWith(7);
  });

  it('is best-effort: resolves without throwing when the cache bust fails', async () => {
    invalidateCache.mockRejectedValue(new Error('cache backend unavailable'));

    // A cache-bust failure must never propagate to (and roll back / reject) the
    // underlying financial write that called the seam.
    await expect(invalidateH9Artifacts(7)).resolves.toBeUndefined();
  });
});
