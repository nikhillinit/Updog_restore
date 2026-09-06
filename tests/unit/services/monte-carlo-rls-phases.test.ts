import { describe, expect, it, vi } from 'vitest';
import {
  MonteCarloEngine,
  type MonteCarloContextRunner,
  type MonteCarloDataSource,
} from '../../../server/services/monte-carlo-engine';
import { StreamingMonteCarloEngine } from '../../../server/services/streaming-monte-carlo-engine';

const context = {
  userId: 'user-1',
  orgId: '',
  fundId: '7',
  email: 'user@example.com',
  role: 'partner',
};

function createHarness() {
  const events: string[] = [];
  let transactionActive = false;
  const values = vi.fn(async () => undefined);
  const dataSource = {
    query: {
      fundBaselines: { findFirst: vi.fn() },
      funds: { findFirst: vi.fn() },
      varianceReports: { findMany: vi.fn() },
    },
    insert: vi.fn(() => ({ values })),
  } as unknown as MonteCarloDataSource;
  const contextRunner: MonteCarloContextRunner = async <T>(
    _context: typeof context,
    operation: (source: MonteCarloDataSource) => Promise<T>
  ) => {
    events.push('transaction:start');
    transactionActive = true;
    try {
      return await operation(dataSource);
    } finally {
      transactionActive = false;
      events.push('transaction:end');
    }
  };

  return {
    contextRunner,
    dataSource,
    events,
    isTransactionActive: () => transactionActive,
  };
}

function stubSharedCalculations(engine: object): void {
  Object.assign(engine, {
    getBaselineData: vi.fn(async () => ({})),
    getPortfolioInputs: vi.fn(async () => ({})),
    calibrateDistributions: vi.fn(async () => ({})),
    calculatePerformanceDistributions: vi.fn(() => ({
      irr: { scenarios: [] },
      multiple: { scenarios: [] },
      dpi: { scenarios: [] },
      tvpi: { scenarios: [] },
      totalValue: { scenarios: [] },
    })),
    calculateRiskMetrics: vi.fn(() => ({})),
    optimizeReserveAllocation: vi.fn(async () => ({})),
    calculateReserveOptimization: vi.fn(() => ({})),
    generateScenarioAnalysis: vi.fn(() => ({})),
    generateInsights: vi.fn(() => ({})),
  });
}

describe('Monte Carlo RLS transaction phases', () => {
  it('loads and persists traditional simulations in separate transactions', async () => {
    const harness = createHarness();
    const engine = new MonteCarloEngine(1, harness.dataSource, harness.contextRunner);
    stubSharedCalculations(engine);
    Object.assign(engine, {
      runSimulationBatches: vi.fn(async () => {
        expect(harness.isTransactionActive()).toBe(false);
        harness.events.push('compute');
        return [];
      }),
    });

    await engine.runPortfolioSimulation({ fundId: 7, runs: 100, timeHorizonYears: 1 }, context);

    expect(harness.events).toEqual([
      'transaction:start',
      'transaction:end',
      'compute',
      'transaction:start',
      'transaction:end',
    ]);
  });

  it('loads and persists streaming simulations in separate transactions', async () => {
    const harness = createHarness();
    const engine = new StreamingMonteCarloEngine(harness.dataSource, harness.contextRunner);
    stubSharedCalculations(engine);
    Object.assign(engine, {
      streamSimulationBatches: async function* () {
        expect(harness.isTransactionActive()).toBe(false);
        harness.events.push('compute');
        yield {
          batchId: 'batch-1',
          batchIndex: 0,
          scenarios: [],
          processingTimeMs: 0,
          memoryUsageMB: 0,
        };
      },
    });

    await engine.runStreamingSimulation({ fundId: 7, runs: 100, timeHorizonYears: 1 }, context);

    expect(harness.events).toEqual([
      'transaction:start',
      'transaction:end',
      'compute',
      'transaction:start',
      'transaction:end',
    ]);
  });
});
