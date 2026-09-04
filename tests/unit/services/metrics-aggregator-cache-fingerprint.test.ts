import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  factsHead: null as { id: number; snapshotInputHash: string } | null,
  select: vi.fn(),
  storage: {
    getFund: vi.fn(),
    getPortfolioCompanies: vi.fn(),
    getFundConfig: vi.fn(),
  },
  actualCalculate: vi.fn(),
  varianceCalculate: vi.fn(),
}));

vi.mock('../../../server/db', () => ({ db: state }));
vi.mock('../../../server/storage', () => ({ storage: state.storage }));
vi.mock('../../../server/services/actual-metrics-calculator', () => ({
  ActualMetricsCalculator: class {
    calculate = state.actualCalculate;
  },
  isLivePortfolioCompany: () => true,
}));
vi.mock('../../../server/services/projected-metrics-calculator', () => ({
  ProjectedMetricsCalculator: class {},
}));
vi.mock('../../../server/services/variance-calculator', () => ({
  VarianceCalculator: class {
    calculate = state.varianceCalculate;
  },
}));

import { MetricsAggregator } from '../../../server/services/metrics-aggregator';

class RecordingCache {
  readonly values = new Map<string, unknown>();
  readonly get = vi.fn(async <T>(key: string): Promise<T | null> => {
    return (this.values.get(key) as T | undefined) ?? null;
  });
  readonly set = vi.fn(async <T>(key: string, value: T): Promise<void> => {
    this.values.set(key, value);
  });
  readonly del = vi.fn(async (key: string): Promise<void> => {
    this.values.delete(key);
  });
  readonly setnx = vi.fn(async (key: string, value: string): Promise<boolean> => {
    if (this.values.has(key)) return false;
    this.values.set(key, value);
    return true;
  });
}

function factsQuery() {
  const query = {} as {
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  };
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn(async () => (state.factsHead ? [state.factsHead] : []));
  return query;
}

function fund() {
  return {
    id: 1,
    name: 'Test Fund',
    size: '100000000',
    deployedCapital: '25000000',
    managementFee: '0.02',
    carryPercentage: '0.2',
    vintageYear: 2026,
    establishmentDate: '2026-01-15',
    status: 'active',
    isActive: true,
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
  };
}

describe('MetricsAggregator financial-facts cache fingerprint', () => {
  beforeEach(() => {
    state.factsHead = null;
    state.select.mockReset();
    state.select.mockImplementation(() => factsQuery());
    state.storage.getFund.mockReset();
    state.storage.getPortfolioCompanies.mockReset();
    state.storage.getFundConfig.mockReset();
    state.storage.getFund.mockResolvedValue(fund());
    state.storage.getPortfolioCompanies.mockResolvedValue([]);
    state.storage.getFundConfig.mockResolvedValue(null);
    state.actualCalculate.mockReset();
    state.actualCalculate.mockResolvedValue({
      asOfDate: '2026-08-31T00:00:00.000Z',
      totalCommitted: 100,
      totalCalled: 10,
      totalDeployed: 5,
      totalUncalled: 90,
      currentNAV: 5,
      totalDistributions: 1,
      totalValue: 6,
      irr: 0,
      tvpi: 0.6,
      dpi: 0.1,
      rvpi: 0.5,
      activeCompanies: 0,
      exitedCompanies: 0,
      writtenOffCompanies: 0,
      totalCompanies: 0,
      deploymentRate: 5,
      averageCheckSize: 0,
      fundAgeMonths: 1,
    });
    state.varianceCalculate.mockReset();
    state.varianceCalculate.mockReturnValue({});
  });

  it('changes with head id or hash, stays stable otherwise, and uses facts:none', async () => {
    const cache = new RecordingCache();
    const aggregator = new MetricsAggregator(cache);

    state.factsHead = { id: 4, snapshotInputHash: 'a'.repeat(64) };
    const first = await aggregator.getUnifiedMetrics(1, { skipProjections: true });
    const second = await aggregator.getUnifiedMetrics(1, { skipProjections: true });
    expect(first._cache?.key).toBe(`unified:v3:fund:1:facts:4:${'a'.repeat(64)}:no-proj`);
    expect(second._cache).toMatchObject({
      hit: true,
      key: first._cache?.key,
    });
    expect(cache.setnx).toHaveBeenCalledWith(
      `unified:v3:fund:1:facts:4:${'a'.repeat(64)}:no-proj:rebuilding`,
      '1',
      60
    );

    state.factsHead = { id: 5, snapshotInputHash: 'a'.repeat(64) };
    const idChanged = await aggregator.getUnifiedMetrics(1, { skipProjections: true });
    expect(idChanged._cache?.key).toBe(`unified:v3:fund:1:facts:5:${'a'.repeat(64)}:no-proj`);

    state.factsHead = { id: 5, snapshotInputHash: 'b'.repeat(64) };
    const hashChanged = await aggregator.getUnifiedMetrics(1, { skipProjections: true });
    expect(hashChanged._cache?.key).toBe(`unified:v3:fund:1:facts:5:${'b'.repeat(64)}:no-proj`);

    state.factsHead = null;
    const noFacts = await aggregator.getUnifiedMetrics(1, { skipProjections: true });
    expect(noFacts._cache?.key).toBe('unified:v3:fund:1:facts:none:no-proj');
  });

  it('invalidates both fingerprinted projection variants', async () => {
    state.factsHead = { id: 9, snapshotInputHash: 'c'.repeat(64) };
    const cache = new RecordingCache();
    const aggregator = new MetricsAggregator(cache);

    await aggregator.invalidateCache(1);

    expect(cache.del).toHaveBeenCalledTimes(2);
    expect(cache.del).toHaveBeenNthCalledWith(
      1,
      `unified:v3:fund:1:facts:9:${'c'.repeat(64)}:with-proj`
    );
    expect(cache.del).toHaveBeenNthCalledWith(
      2,
      `unified:v3:fund:1:facts:9:${'c'.repeat(64)}:no-proj`
    );
    expect(state.select).toHaveBeenCalledTimes(1);
  });
});
