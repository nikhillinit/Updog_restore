/**
 * Phoenix truth case: rewritten runScenarioComparisons end-to-end (Phase 2 D-09 + D-10).
 *
 * Validates the post-rewrite runScenarioComparisons against the 2008 Global
 * Financial Crisis scenario with a fixed randomSeed. Uses the REAL Monte Carlo
 * engine (NOT mocked -- that is the whole point) and relies on NODE_ENV=test
 * to keep the traditional engine selected, avoiding the streaming engine's
 * Math.random global patch (RESEARCH Pitfall #1).
 *
 * Tolerances: 4 decimals per RESEARCH Q12 recommendation.
 *
 * Snapshot lock procedure (first green run):
 * 1. Run this test once with placeholder zeros in the JSON file.
 * 2. The first assertion will fail with the actual values in the diff output.
 * 3. Copy the actual values into docs/backtesting-scenario.truth-cases.json.
 * 4. Re-run -- the test should pass on the second attempt.
 * 5. Commit the updated JSON file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import truthCasesRaw from '../../../docs/backtesting-scenario.truth-cases.json';

// Mock db: provide a synthetic baseline + fund so the traditional MonteCarloEngine
// can complete getBaselineData / getPortfolioInputs without a real Postgres
// connection, AND keep varianceReports.findMany returning empty so
// calibrateDistributions falls through to getDefaultDistributions -- the override
// target wired by Plan 02-02. backtestResults / fundBaselines (other shapes)
// return null/empty defaults.
//
// NOTE: this mock MUST be set up via vi.hoisted before any imports of code that
// touches db, or the import resolves the real module.
const { mockDb, MOCK_BASELINE, MOCK_FUND } = vi.hoisted(() => {
  const MOCK_BASELINE = {
    id: 'baseline-truth-case-01',
    fundId: 1,
    deployedCapital: '50000000',
    irr: '0.15',
    multiple: '2.5',
    dpi: '0.8',
    tvpi: '2.0',
    totalValue: '100000000',
    averageInvestment: '2000000',
    sectorDistribution: { saas: 8, fintech: 5, healthtech: 7 },
    stageDistribution: { seed: 6, series_a: 8, series_b: 6 },
    isActive: true,
    isDefault: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };
  const MOCK_FUND = {
    id: 1,
    name: 'Truth Case Fund',
    size: '100000000',
  };
  return {
    MOCK_BASELINE,
    MOCK_FUND,
    mockDb: {
      query: {
        backtestResults: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        fundBaselines: {
          findFirst: vi.fn().mockResolvedValue(MOCK_BASELINE),
        },
        funds: {
          findFirst: vi.fn().mockResolvedValue(MOCK_FUND),
        },
        fundStateSnapshots: { findFirst: vi.fn().mockResolvedValue(null) },
        varianceReports: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
    },
  };
});

vi.mock('../../../server/db', () => ({ db: mockDb }));

// IMPORTANT: do NOT mock unifiedMonteCarloService here. The whole point of this
// truth case is to exercise the real engine end-to-end. Plan 02-02 verified
// that the override flows through to the real engine and Plan 02-03 verified
// that runScenarioComparisons injects the override per scenario. This test
// closes the loop by running both layers together.

import { BacktestingService } from '../../../server/services/backtesting-service';

interface BacktestingTruthCase {
  id: string;
  scenario: string;
  tags: string[];
  notes: string;
  input: {
    fundId: number;
    scenarios: string[];
    simulationRuns: number;
    options: { randomSeed: number };
  };
  expected: {
    scenario: string;
    // Note: the public DistributionSummary type uses `median` not `p50`
    // (see shared/types/backtesting.ts and the simulationResultToDistributionSummary
    // helper in backtesting-service.ts). The truth case mirrors that contract.
    simulatedPerformance: {
      mean: number;
      p5: number;
      p25: number;
      median: number;
      p75: number;
      p95: number;
    };
  };
  category: string;
}

// Use a static JSON import (resolved at module load) instead of readFileSync
// so the test does not depend on process.cwd() at runtime under vitest workers.
const truthCases = truthCasesRaw as unknown as BacktestingTruthCase[];

describe('Backtesting scenario truth cases (Phase 2 D-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-prime the mock returns after clear (vi.fn().mockResolvedValue is
    // wiped by clearAllMocks even when set in vi.hoisted -- see MEMORY note
    // "Vitest restoreAllMocks Gotcha"). The baseline + fund stay populated so
    // the traditional MonteCarloEngine can complete getBaselineData and
    // getPortfolioInputs without a real Postgres connection. varianceReports
    // stays empty so calibrateDistributions falls through to
    // getDefaultDistributions -- the override target wired by Plan 02-02.
    mockDb.query.backtestResults.findMany.mockResolvedValue([]);
    mockDb.query.backtestResults.findFirst.mockResolvedValue(null);
    mockDb.query.varianceReports.findMany.mockResolvedValue([]);
    mockDb.query.varianceReports.findFirst.mockResolvedValue(null);
    mockDb.query.fundBaselines.findFirst.mockResolvedValue(MOCK_BASELINE);
    mockDb.query.funds.findFirst.mockResolvedValue(MOCK_FUND);
    mockDb.query.fundStateSnapshots.findFirst.mockResolvedValue(null);
    mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
  });

  // Precondition: this truth case requires the traditional engine for
  // determinism. RESEARCH Pitfall #1: the streaming engine patches Math.random
  // globally and is non-deterministic. NODE_ENV=test gates streamingEnabled
  // to false in monte-carlo-service-unified.ts:shouldEnableStreaming.
  it('precondition: NODE_ENV is test (gates traditional engine for determinism)', () => {
    expect(process.env['NODE_ENV']).toBe('test');
  });

  for (const truthCase of truthCases) {
    it(`${truthCase.id} -- sample percentiles match snapshot with fixed seed`, async () => {
      const service = new BacktestingService();
      const result = await service.compareScenarios(
        truthCase.input.fundId,
        truthCase.input.scenarios as Parameters<typeof service.compareScenarios>[1],
        truthCase.input.simulationRuns,
        truthCase.input.options
      );

      expect(result).toHaveLength(1);
      const scenario = result[0]!;
      expect(scenario.scenario).toBe(truthCase.expected.scenario);

      const perf = scenario.simulatedPerformance;
      const expected = truthCase.expected.simulatedPerformance;

      // 4-decimal tolerance per RESEARCH Q12. If a future change to the
      // failureRate translation (Plan 02-02 option (a)) or the default
      // distributions invalidates this snapshot, the test fails LOUDLY here.
      // To re-lock: edit docs/backtesting-scenario.truth-cases.json with the
      // new actual values surfaced in the assertion diff.
      expect(perf.mean).toBeCloseTo(expected.mean, 4);
      expect(perf.p5).toBeCloseTo(expected.p5, 4);
      expect(perf.p25).toBeCloseTo(expected.p25, 4);
      expect(perf.median).toBeCloseTo(expected.median, 4);
      expect(perf.p75).toBeCloseTo(expected.p75, 4);
      expect(perf.p95).toBeCloseTo(expected.p95, 4);
    });

    it(`${truthCase.id} -- re-running with same seed produces byte-identical sample percentiles (determinism check)`, async () => {
      const service = new BacktestingService();
      const result1 = await service.compareScenarios(
        truthCase.input.fundId,
        truthCase.input.scenarios as Parameters<typeof service.compareScenarios>[1],
        truthCase.input.simulationRuns,
        truthCase.input.options
      );
      const result2 = await service.compareScenarios(
        truthCase.input.fundId,
        truthCase.input.scenarios as Parameters<typeof service.compareScenarios>[1],
        truthCase.input.simulationRuns,
        truthCase.input.options
      );

      // Byte-identical means EVERY field is equal -- we use toEqual not toBeCloseTo.
      // If Math.random has leaked into the engine (e.g., reservoir sampling
      // path on the streaming engine -- but NODE_ENV=test forces traditional,
      // so this should be impossible), the second run differs from the first
      // and this test fails LOUDLY.
      expect(result1[0]!.simulatedPerformance).toEqual(result2[0]!.simulatedPerformance);
    });
  }

  it('D-09 hard requirement: GFC scenario mean is lower than bull market scenario mean', async () => {
    const service = new BacktestingService();

    const gfc = await service.compareScenarios(
      1,
      ['financial_crisis_2008'] as Parameters<typeof service.compareScenarios>[1],
      1000,
      { randomSeed: 12345 }
    );
    const bull = await service.compareScenarios(
      1,
      ['bull_market_2021'] as Parameters<typeof service.compareScenarios>[1],
      1000,
      { randomSeed: 12345 }
    );

    expect(gfc).toHaveLength(1);
    expect(bull).toHaveLength(1);
    expect(gfc[0]!.simulatedPerformance.mean).toBeLessThan(bull[0]!.simulatedPerformance.mean);
  });
});
