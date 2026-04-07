/**
 * Unit test for SimulationConfig.marketParameters override (Phase 2 D-01).
 *
 * Proves that calibrateDistributions honors the override when present and is
 * a no-op when absent. Locked to the traditional engine via forceEngine to
 * avoid the streaming engine's Math.random global patch (RESEARCH Pitfall #1).
 *
 * Phase 2 plan 02-02 — REQ-BCK-01.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db at the top so the engines can be imported. The traditional engine
// calls db.query.fundBaselines.findFirst, db.query.funds.findFirst,
// db.query.varianceReports.findMany, and db.insert(...).values(...). We stub
// all four to return realistic shapes so the pipeline runs end-to-end through
// runPortfolioSimulation (which is what executeTraditionalSimulation calls).
//
// varianceReports.findMany returns [] so calibrateDistributions takes the
// `reports.length < 3` branch and falls through to getDefaultDistributions —
// which is the code path our override branch attaches to.
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    query: {
      varianceReports: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      fundBaselines: {
        findFirst: vi.fn(),
      },
      funds: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
  },
}));

vi.mock('../../../server/db', () => ({ db: mockDb }));

vi.mock('@shared/schema', async () => {
  const actual = await vi.importActual<typeof import('@shared/schema')>('@shared/schema');
  return {
    ...actual,
    monteCarloSimulations: 'mocked-monteCarloSimulations-table',
    fundBaselines: 'mocked-fundBaselines-table',
    funds: 'mocked-funds-table',
    varianceReports: 'mocked-varianceReports-table',
  };
});

import { unifiedMonteCarloService } from '../../../server/services/monte-carlo-service-unified';
import type { MarketParameters } from '@shared/types/backtesting';

const baseConfig = {
  fundId: 1,
  runs: 1000,
  timeHorizonYears: 5,
  forceEngine: 'traditional' as const,
  randomSeed: 12345,
};

const bullParams: MarketParameters = {
  exitMultiplierMean: 3.0,
  exitMultiplierVolatility: 0.4,
  failureRate: 0.1,
  followOnProbability: 0.7,
  holdPeriodYears: 4,
};

const bearParams: MarketParameters = {
  exitMultiplierMean: 1.2,
  exitMultiplierVolatility: 0.6,
  failureRate: 0.5,
  followOnProbability: 0.3,
  holdPeriodYears: 7,
};

const mockBaseline = {
  id: 'baseline-phase2-02-02',
  fundId: 1,
  deployedCapital: 30000000,
  sectorDistribution: {
    FinTech: 8,
    SaaS: 6,
    HealthTech: 5,
    'AI/ML': 4,
    Other: 2,
  },
  stageDistribution: {
    Seed: 10,
    'Series A': 12,
    'Series B': 3,
  },
  averageInvestment: 1200000,
  irr: 0.18,
  multiple: 2.8,
  dpi: 0.85,
  isActive: true,
  isDefault: true,
};

const mockFund = {
  id: 1,
  size: 50000000,
  createdAt: new Date('2022-01-01'),
  isActive: true,
};

describe('SimulationConfig.marketParameters override (Phase 2 D-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.query.varianceReports.findMany.mockResolvedValue([]);
    mockDb.query.fundBaselines.findFirst.mockResolvedValue(mockBaseline);
    mockDb.query.funds.findFirst.mockResolvedValue(mockFund);
    mockDb.insert.mockReturnValue({
      values: vi.fn(() => Promise.resolve()),
    });
  });

  it('produces a measurably different irr distribution mean when bull vs bear marketParameters are injected with the same seed', async () => {
    const bullResult = await unifiedMonteCarloService.runSimulation({
      ...baseConfig,
      marketParameters: bullParams,
    });

    const bearResult = await unifiedMonteCarloService.runSimulation({
      ...baseConfig,
      marketParameters: bearParams,
    });

    // The bull and bear distributions must differ by more than 1e-6 to prove
    // the override actually flows through into the engine. If the override is
    // silently dropped, both calls return the same default distributions and
    // this assertion fails.
    const meanDelta = Math.abs(bullResult.irr.statistics.mean - bearResult.irr.statistics.mean);
    expect(meanDelta).toBeGreaterThan(1e-6);

    // Sanity: the bull distribution mean (failureRate 0.1 -> 90% of baseline
    // irr) should be HIGHER than the bear distribution mean (failureRate 0.5
    // -> 50% of baseline irr). If they are equal or inverted, the translation
    // function is broken.
    expect(bullResult.irr.statistics.mean).toBeGreaterThan(bearResult.irr.statistics.mean);

    // Sanity: confirm the traditional engine actually ran (not streaming).
    expect(bullResult.performance.engineUsed).toBe('traditional');
    expect(bearResult.performance.engineUsed).toBe('traditional');
  });

  it('returns default behavior when marketParameters is absent (no regression in existing call sites)', async () => {
    const defaultResult = await unifiedMonteCarloService.runSimulation({
      ...baseConfig,
      // no marketParameters
    });

    // We do not assert on specific numeric values here — getDefaultDistributions
    // is what every existing test depends on. The acceptance is "the test runs
    // successfully without throwing AND produces a sensible distribution
    // (mean is finite, p5 < p95)."
    expect(Number.isFinite(defaultResult.irr.statistics.mean)).toBe(true);
    expect(defaultResult.irr.percentiles.p5).toBeLessThan(defaultResult.irr.percentiles.p95);
  });
});
