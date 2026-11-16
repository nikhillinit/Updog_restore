import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedFundMetrics } from '@shared/types/metrics';

const state = vi.hoisted(() => ({
  select: vi.fn(),
  storage: {
    getFund: vi.fn(),
    getPortfolioCompanies: vi.fn(),
    getFundConfig: vi.fn(),
  },
  actualCalculate: vi.fn(),
  varianceCalculate: vi.fn(),
  readPublishedFundActuals: vi.fn(),
}));

vi.mock('../../../server/db', () => ({ db: { select: state.select } }));
vi.mock('../../../server/storage', () => ({ storage: state.storage }));
vi.mock('../../../server/services/published-investment-comparison', () => ({
  readPublishedFundActuals: state.readPublishedFundActuals,
  readPublishedInvestmentComparison: vi.fn(),
}));
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

const CACHE_KEY = 'unified:v3:fund:1:facts:none:no-proj';

class RecordingCache {
  readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  async setnx(key: string): Promise<boolean> {
    if (this.values.has(key)) return false;
    this.values.set(key, true);
    return true;
  }
}

function actualMetrics() {
  return {
    asOfDate: '2026-11-03T00:00:00.000Z',
    totalCommitted: 1000,
    totalCalled: 0,
    totalDeployed: 0,
    totalUncalled: 1000,
    currentNAV: 0,
    totalDistributions: 0,
    totalValue: 0,
    irr: 0,
    tvpi: 0,
    dpi: 0,
    rvpi: 0,
    activeCompanies: 0,
    exitedCompanies: 0,
    writtenOffCompanies: 0,
    totalCompanies: 0,
    deploymentRate: 0,
    averageCheckSize: 0,
    fundAgeMonths: 1,
  };
}

function publishedActuals() {
  return {
    contractVersion: 'published-fund-actuals/1.0.0',
    status: 'available',
    asOfDate: '2026-11-03',
    basis: {
      snapshotId: 31,
      snapshotInputHash: 'a'.repeat(64),
      snapshotAsOfDate: '2026-10-31',
      knowledgeCutoff: '2026-11-03T00:00:00.000Z',
    },
    vehicleScope: 'main_fund',
    investments: {
      deployedCapital: '123.450000',
      initialCapital: '123.450000',
      followOnCapital: '0',
      transactionCount: 1,
      companyCount: 1,
    },
    reason: null,
    unsupportedReason: 'Synthetic unsupported metrics reason.',
    disclosures: [],
  } as const;
}

function cachedMetrics(): UnifiedFundMetrics {
  return {
    fundId: 1,
    fundName: 'Synthetic Fund',
    actual: actualMetrics(),
    projected: {} as UnifiedFundMetrics['projected'],
    target: {} as UnifiedFundMetrics['target'],
    variance: {} as UnifiedFundMetrics['variance'],
    lastUpdated: '2026-11-03T00:00:00.000Z',
  };
}

function cacheKeyQuery() {
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    orderBy: vi.fn(() => query),
    limit: vi.fn(async () => []),
  };
  return query;
}

describe('MetricsAggregator published actuals overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.select.mockImplementation(() => cacheKeyQuery());
    state.storage.getFund.mockResolvedValue({
      id: 1,
      name: 'Synthetic Fund',
      size: '1000',
      deployedCapital: '0',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2026,
      establishmentDate: '2026-01-15',
      status: 'active',
      isActive: true,
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
    });
    state.storage.getPortfolioCompanies.mockResolvedValue([]);
    state.storage.getFundConfig.mockResolvedValue(null);
    state.actualCalculate.mockResolvedValue(actualMetrics());
    state.varianceCalculate.mockReturnValue({});
    state.readPublishedFundActuals.mockResolvedValue(null);
  });

  it('overlays published deployment on a cache miss without promoting legacy values or mutating cache', async () => {
    const cache = new RecordingCache();
    const aggregator = new MetricsAggregator(cache);
    state.readPublishedFundActuals.mockResolvedValue(publishedActuals());

    const result = await aggregator.getUnifiedMetrics(1, { skipProjections: true });
    const cached = cache.values.get(CACHE_KEY) as UnifiedFundMetrics;

    expect(result.actual.totalDeployed).toBe(0);
    expect(result.actual.totalCalled).toBe(0);
    expect(result.publishedActuals?.investments?.deployedCapital).toBe('123.450000');
    expect(result).not.toBe(cached);
    expect(cached).not.toHaveProperty('publishedActuals');
    expect(state.readPublishedFundActuals).toHaveBeenCalledOnce();
  });

  it('overlays a cache hit on a fresh object and leaves cached metrics unchanged', async () => {
    const cache = new RecordingCache();
    const cached = cachedMetrics();
    cache.values.set(CACHE_KEY, cached);
    const aggregator = new MetricsAggregator(cache);
    state.readPublishedFundActuals.mockResolvedValue(publishedActuals());

    const result = await aggregator.getUnifiedMetrics(1, { skipProjections: true });

    expect(result._cache?.hit).toBe(true);
    expect(result.publishedActuals?.investments?.deployedCapital).toBe('123.450000');
    expect(result).not.toBe(cached);
    expect(cached).not.toHaveProperty('publishedActuals');
    expect(state.actualCalculate).not.toHaveBeenCalled();
  });

  it('returns the legacy cache shape unchanged when reader returns null', async () => {
    const cache = new RecordingCache();
    const cached = cachedMetrics();
    cache.values.set(CACHE_KEY, cached);
    const aggregator = new MetricsAggregator(cache);

    const result = await aggregator.getUnifiedMetrics(1, { skipProjections: true });

    expect(result).toEqual({ ...cached, _cache: { hit: true, key: CACHE_KEY } });
    expect(result).not.toHaveProperty('publishedActuals');
    expect(cached).not.toHaveProperty('publishedActuals');
  });
});
