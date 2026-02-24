/**
 * Deterministic Monte Carlo Fixture Provider
 *
 * Provides in-memory MonteCarloDataSource implementation for unit tests,
 * removing the DB dependency that causes 10 test skips.
 *
 * @see server/services/monte-carlo-engine.ts:239-250 for MonteCarloDataSource interface
 */

import type { MonteCarloDataSource } from '../../server/services/monte-carlo-engine';

// ---------------------------------------------------------------------------
// Fixture data types (matching Drizzle schema shapes)
// ---------------------------------------------------------------------------

interface FixtureFundBaseline {
  id: string;
  fundId: number;
  name: string;
  description: string | null;
  baselineType: string;
  periodStart: Date;
  periodEnd: Date;
  snapshotDate: Date;
  totalValue: string;
  deployedCapital: string;
  irr: string | null;
  multiple: string | null;
  dpi: string | null;
  tvpi: string | null;
  portfolioCount: number;
  averageInvestment: string | null;
  topPerformers: unknown;
  sectorDistribution: Record<string, number> | null;
  stageDistribution: Record<string, number> | null;
  reserveAllocation: unknown;
  pacingMetrics: unknown;
  isActive: boolean;
  isDefault: boolean;
  confidence: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FixtureFund {
  id: number;
  size: string | number;
  [key: string]: unknown;
}

interface FixtureVarianceReport {
  irrVariance?: string | number | null;
  multipleVariance?: string | number | null;
  dpiVariance?: string | number | null;
  fundId: number;
  baselineId: string;
  asOfDate: Date;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Default fixture data
// ---------------------------------------------------------------------------

const DEFAULT_BASELINE: FixtureFundBaseline = {
  id: 'baseline-001',
  fundId: 1,
  name: 'Test Baseline',
  description: 'Deterministic fixture for MC unit tests',
  baselineType: 'initial',
  periodStart: new Date('2024-01-01'),
  periodEnd: new Date('2024-12-31'),
  snapshotDate: new Date('2024-12-31'),
  totalValue: '75000000',
  deployedCapital: '50000000',
  irr: '0.15',
  multiple: '2.50',
  dpi: '0.80',
  tvpi: '1.80',
  portfolioCount: 20,
  averageInvestment: '2500000',
  topPerformers: null,
  sectorDistribution: { SaaS: 40, Fintech: 30, Healthcare: 20, Other: 10 },
  stageDistribution: { Seed: 30, 'Series A': 40, 'Series B': 20, Growth: 10 },
  reserveAllocation: null,
  pacingMetrics: null,
  isActive: true,
  isDefault: true,
  confidence: '1.00',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-12-31'),
};

const DEFAULT_FUND: FixtureFund = {
  id: 1,
  size: '100000000',
  name: 'Test Fund I',
};

// Generate variance reports with realistic patterns
function generateVarianceReports(
  count: number,
  fundId: number,
  baselineId: string
): FixtureVarianceReport[] {
  const reports: FixtureVarianceReport[] = [];
  for (let i = 0; i < count; i++) {
    const monthsBack = count - i;
    const date = new Date('2024-12-31');
    date.setMonth(date.getMonth() - monthsBack);

    reports.push({
      fundId,
      baselineId,
      asOfDate: date,
      irrVariance: (0.02 + (i % 3) * 0.005).toFixed(4),
      multipleVariance: (0.1 + (i % 4) * 0.02).toFixed(4),
      dpiVariance: (0.05 + (i % 5) * 0.01).toFixed(4),
    });
  }
  return reports;
}

const DEFAULT_VARIANCE_REPORTS = generateVarianceReports(10, 1, 'baseline-001');

// ---------------------------------------------------------------------------
// In-memory data source implementation
// ---------------------------------------------------------------------------

interface FixtureProviderOptions {
  baselines?: FixtureFundBaseline[];
  funds?: FixtureFund[];
  varianceReports?: FixtureVarianceReport[];
}

/**
 * Create a deterministic MonteCarloDataSource backed by in-memory fixtures.
 *
 * Usage:
 *   const dataSource = createMCFixtureProvider();
 *   const engine = new MonteCarloEngine(42, dataSource);
 */
export function createMCFixtureProvider(opts: FixtureProviderOptions = {}): MonteCarloDataSource {
  const baselines = opts.baselines ?? [DEFAULT_BASELINE];
  const fundsList = opts.funds ?? [DEFAULT_FUND];
  const reports = opts.varianceReports ?? DEFAULT_VARIANCE_REPORTS;

  // Track inserted simulations for verification
  const insertedSimulations: unknown[] = [];

  return {
    query: {
      fundBaselines: {
        findFirst: async (queryOpts: unknown) => {
          // Simple in-memory matching. Real Drizzle uses `where` clause;
          // for fixtures we return the first matching baseline by fundId.
          const opts = queryOpts as { where?: unknown } | undefined;
          void opts; // Drizzle where clauses are opaque; match first available
          return baselines[0] as unknown as ReturnType<
            MonteCarloDataSource['query']['fundBaselines']['findFirst']
          > extends Promise<infer T>
            ? T
            : never;
        },
      },
      funds: {
        findFirst: async (queryOpts: unknown) => {
          void queryOpts;
          const fund = fundsList[0];
          if (!fund) return undefined;
          return fund as Awaited<ReturnType<MonteCarloDataSource['query']['funds']['findFirst']>>;
        },
      },
      varianceReports: {
        findMany: async (queryOpts: unknown) => {
          const opts = queryOpts as { limit?: number } | undefined;
          const limit = opts?.limit ?? reports.length;
          return reports.slice(0, limit) as Awaited<
            ReturnType<MonteCarloDataSource['query']['varianceReports']['findMany']>
          >;
        },
      },
    },
    insert: (_table: unknown) => ({
      values: async (data: unknown) => {
        insertedSimulations.push(data);
        // No-op for tests: don't write to DB
      },
    }),
  };
}

/**
 * Fixture presets for specific test scenarios.
 */
export const MC_FIXTURES = {
  /** Standard $100M fund with 20 portfolio companies */
  standard: () => createMCFixtureProvider(),

  /** Small fund ($25M, 8 companies) */
  smallFund: () =>
    createMCFixtureProvider({
      baselines: [
        {
          ...DEFAULT_BASELINE,
          totalValue: '18750000',
          deployedCapital: '12500000',
          portfolioCount: 8,
          averageInvestment: '1562500',
        },
      ],
      funds: [{ id: 1, size: '25000000', name: 'Test Small Fund' }],
    }),

  /** Large fund ($500M, 50 companies) */
  largeFund: () =>
    createMCFixtureProvider({
      baselines: [
        {
          ...DEFAULT_BASELINE,
          totalValue: '375000000',
          deployedCapital: '250000000',
          portfolioCount: 50,
          averageInvestment: '5000000',
        },
      ],
      funds: [{ id: 1, size: '500000000', name: 'Test Large Fund' }],
    }),

  /** Fund with rich variance history (30 reports for calibration) */
  richHistory: () =>
    createMCFixtureProvider({
      varianceReports: generateVarianceReports(30, 1, 'baseline-001'),
    }),

  /** Fund with sparse data (no variance reports, triggering defaults) */
  sparseData: () =>
    createMCFixtureProvider({
      varianceReports: [],
    }),
} as const;

export { DEFAULT_BASELINE, DEFAULT_FUND, DEFAULT_VARIANCE_REPORTS };
export type { FixtureFundBaseline, FixtureFund, FixtureVarianceReport, FixtureProviderOptions };
