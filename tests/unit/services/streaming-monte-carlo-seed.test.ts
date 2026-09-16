import { describe, expect, it, vi } from 'vitest';
import type {
  MonteCarloContextRunner,
  MonteCarloDataSource,
  PortfolioInputs,
} from '../../../server/services/monte-carlo-engine';
import { StreamingMonteCarloEngine } from '../../../server/services/streaming-monte-carlo-engine';

const context = {
  userId: 'user-1',
  orgId: '',
  fundId: '7',
  email: 'user@example.com',
  role: 'partner',
};

const portfolioInputs: PortfolioInputs = {
  fundSize: 100_000_000,
  deployedCapital: 60_000_000,
  reserveRatio: 0.3,
  sectorWeights: {},
  stageWeights: {},
  averageInvestmentSize: 2_000_000,
};

async function runSeeded(randomSeed: number) {
  const dataSource = {
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  } as unknown as MonteCarloDataSource;
  const contextRunner: MonteCarloContextRunner = async (_context, operation) =>
    operation(dataSource);
  const engine = new StreamingMonteCarloEngine(dataSource, contextRunner);
  // Stub only the DB-backed loaders; scenario generation and aggregation run for real.
  Object.assign(engine, {
    getBaselineData: async () => ({}),
    getPortfolioInputs: async () => portfolioInputs,
    calibrateDistributions: async () =>
      (engine as unknown as { getDefaultDistributions(): unknown }).getDefaultDistributions(),
  });

  // 12k runs exceeds the 10k percentile reservoir, so the reservoir draw is exercised too.
  const {
    simulationId: _id,
    executionTimeMs: _ms,
    ...results
  } = await engine.runStreamingSimulation(
    { fundId: 7, runs: 12_000, timeHorizonYears: 5, randomSeed },
    context
  );
  return results;
}

function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

describe('StreamingMonteCarloEngine seeding', () => {
  it('keeps the seed local to the run and leaves Math.random untouched', async () => {
    const original = Math.random;

    const first = await runSeeded(42);
    const second = await runSeeded(42);
    const other = await runSeeded(43);

    expect(Math.random).toBe(original);
    expect(second).toEqual(first);
    expect(other.irr.statistics).not.toEqual(first.irr.statistics);
  });

  it('keeps every output finite for a seed whose first draw is exactly zero', async () => {
    // Seed 634785765 makes the LCG's first draw 0; a bare Math.log(0) leaks Infinity and NaN.
    const results = await runSeeded(634785765);
    const values = numbers(results);
    expect(values.length).toBeGreaterThan(0);
    expect(values.filter((value) => !Number.isFinite(value))).toEqual([]);
  });
});
