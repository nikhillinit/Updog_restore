/**
 * Portfolio Route API Test Fixtures
 *
 * Reusable test data factories for Portfolio Route API testing.
 * Provides factory functions for creating funds, investments, lots, snapshots,
 * and reserve allocations with sensible defaults and customizable overrides.
 *
 * Version: 1.0.0
 * Created: 2025-11-08
 *
 * @module tests/fixtures/portfolio-route-fixtures
 */

import { randomUUID } from 'crypto';
import type {
  InvestmentLotV1,
  ForecastSnapshotV1,
  ReserveAllocationV1,
  CreateLotRequest,
  CreateSnapshotRequest,
  UpdateSnapshotRequest,
  LotType,
  SnapshotStatus,
} from '@shared/schemas/portfolio-route';
import { calculateCostBasis } from '@shared/schemas/portfolio-route';

// =====================
// TYPE DEFINITIONS
// =====================

/**
 * Minimal fund representation for testing
 */
export interface TestFund {
  id: number;
  name: string;
  size: number;
  vintageYear: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Minimal investment representation for testing
 */
export interface TestInvestment {
  id: number;
  fundId: number;
  companyName: string;
  stage: string;
  sector: string;
  investedCents: bigint;
  ownership: string;
  createdAt: Date;
  updatedAt: Date;
}

// =====================
// FACTORY FUNCTIONS - ENTITIES
// =====================

/**
 * Create a test fund with sensible defaults
 *
 * @param overrides - Partial fund properties to override defaults
 * @returns Complete test fund object
 *
 * @example
 * const fund = createFundFactory({ name: 'Growth Fund I' });
 */
export function createFundFactory(overrides?: Partial<TestFund>): TestFund {
  const now = new Date();
  return {
    id: Math.floor(Math.random() * 10000) + 1,
    name: `Test Fund ${randomUUID().slice(0, 8)}`,
    size: 50_000_000, // $50M
    vintageYear: 2024,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a test investment with sensible defaults
 *
 * @param overrides - Partial investment properties to override defaults
 * @returns Complete test investment object
 *
 * @example
 * const investment = createInvestmentFactory({ companyName: 'TechCorp' });
 */
export function createInvestmentFactory(
  overrides?: Partial<TestInvestment>
): TestInvestment {
  const now = new Date();
  return {
    id: Math.floor(Math.random() * 10000) + 1,
    fundId: 1,
    companyName: `Company ${randomUUID().slice(0, 8)}`,
    stage: 'Series A',
    sector: 'Technology',
    investedCents: BigInt(1_000_000_00), // $1M in cents
    ownership: '0.15', // 15% ownership
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create an investment lot with sensible defaults
 *
 * @param overrides - Partial lot properties to override defaults
 * @returns Complete investment lot object
 *
 * @example
 * const lot = createInvestmentLotFactory({ lotType: 'follow_on' });
 */
export function createInvestmentLotFactory(
  overrides?: Partial<InvestmentLotV1>
): InvestmentLotV1 {
  const now = new Date();
  const sharePriceCents = BigInt(250_000); // $2.50/share in cents
  const sharesAcquired = '1000.00000000'; // 1000 shares
  const costBasisCents = calculateCostBasis(sharePriceCents, sharesAcquired);

  return {
    id: randomUUID(),
    investmentId: 1,
    lotType: 'initial',
    sharePriceCents: sharePriceCents.toString(),
    sharesAcquired,
    costBasisCents: costBasisCents.toString(),
    version: 1,
    idempotencyKey: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a forecast snapshot with sensible defaults
 *
 * @param overrides - Partial snapshot properties to override defaults
 * @returns Complete forecast snapshot object
 *
 * @example
 * const snapshot = createForecastSnapshotFactory({ status: 'complete' });
 */
export function createForecastSnapshotFactory(
  overrides?: Partial<ForecastSnapshotV1>
): ForecastSnapshotV1 {
  const now = new Date();

  return {
    id: randomUUID(),
    fundId: 1,
    name: `Snapshot ${randomUUID().slice(0, 8)}`,
    status: 'pending',
    sourceHash: null,
    calculatedMetrics: null,
    fundState: null,
    portfolioState: null,
    metricsState: null,
    snapshotTime: now,
    version: 1,
    idempotencyKey: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a reserve allocation with sensible defaults
 *
 * @param overrides - Partial allocation properties to override defaults
 * @returns Complete reserve allocation object
 *
 * @example
 * const allocation = createReserveAllocationFactory({ companyId: 123 });
 */
export function createReserveAllocationFactory(
  overrides?: Partial<ReserveAllocationV1>
): ReserveAllocationV1 {
  const now = new Date();

  return {
    id: randomUUID(),
    snapshotId: randomUUID(),
    companyId: 1,
    plannedReserveCents: BigInt(500_000_00).toString(), // $500k in cents
    allocationScore: '0.85',
    priority: 1,
    rationale: 'High-priority follow-on opportunity',
    version: 1,
    idempotencyKey: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// =====================
// FACTORY FUNCTIONS - API REQUESTS
// =====================

/**
 * Create a valid POST /lots request payload
 *
 * @param overrides - Partial request properties to override defaults
 * @returns Valid CreateLotRequest payload
 *
 * @example
 * const payload = createLotRequestFactory({ lotType: 'follow_on' });
 */
export function createLotRequestFactory(
  overrides?: Partial<CreateLotRequest>
): CreateLotRequest {
  const sharePriceCents = BigInt(250_000); // $2.50/share in cents
  const sharesAcquired = '1000.00000000'; // 1000 shares
  const costBasisCents = calculateCostBasis(sharePriceCents, sharesAcquired);

  return {
    investmentId: 1,
    lotType: 'initial',
    sharePriceCents: sharePriceCents.toString(),
    sharesAcquired,
    costBasisCents: costBasisCents.toString(),
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

/**
 * Create a valid POST /snapshots request payload
 *
 * @param overrides - Partial request properties to override defaults
 * @returns Valid CreateSnapshotRequest payload
 *
 * @example
 * const payload = createSnapshotRequestFactory({ name: 'Q4 2024' });
 */
export function createSnapshotRequestFactory(
  overrides?: Partial<CreateSnapshotRequest>
): CreateSnapshotRequest {
  return {
    name: `Snapshot ${new Date().toISOString()}`,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

/**
 * Create a valid PUT /snapshots/:id request payload
 *
 * @param overrides - Partial request properties to override defaults
 * @returns Valid UpdateSnapshotRequest payload
 *
 * @example
 * const payload = createUpdateSnapshotRequestFactory({ version: 2 });
 */
export function createUpdateSnapshotRequestFactory(
  overrides?: Partial<UpdateSnapshotRequest>
): UpdateSnapshotRequest {
  return {
    version: 1,
    ...overrides,
  };
}

// =====================
// SAMPLE DATA SETS
// =====================

/**
 * Sample lot types for testing different investment scenarios
 */
export const SAMPLE_LOT_TYPES: readonly LotType[] = [
  'initial',
  'follow_on',
  'secondary',
] as const;

/**
 * Sample snapshot statuses for testing status transitions
 */
export const SAMPLE_SNAPSHOT_STATUSES: readonly SnapshotStatus[] = [
  'pending',
  'calculating',
  'complete',
  'error',
] as const;

/**
 * Sample investment stages for portfolio diversity
 */
export const SAMPLE_STAGES = [
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Growth',
] as const;

/**
 * Sample sectors for portfolio diversity
 */
export const SAMPLE_SECTORS = [
  'Technology',
  'Healthcare',
  'Financial Services',
  'Consumer',
  'Infrastructure',
  'Climate Tech',
] as const;

// =====================
// REALISTIC DATASETS
// =====================

/**
 * Realistic fund portfolio with multiple investments
 */
export const REALISTIC_PORTFOLIO = {
  fund: createFundFactory({
    name: 'Growth Fund I',
    size: 100_000_000,
    vintageYear: 2023,
  }),
  investments: [
    createInvestmentFactory({
      companyName: 'TechCorp Alpha',
      stage: 'Series A',
      sector: 'Technology',
      investedCents: BigInt(2_000_000_00),
      ownership: '0.15',
    }),
    createInvestmentFactory({
      companyName: 'HealthTech Beta',
      stage: 'Series B',
      sector: 'Healthcare',
      investedCents: BigInt(3_500_000_00),
      ownership: '0.12',
    }),
    createInvestmentFactory({
      companyName: 'FinTech Gamma',
      stage: 'Series A',
      sector: 'Financial Services',
      investedCents: BigInt(1_500_000_00),
      ownership: '0.18',
    }),
  ],
};

/**
 * Complete snapshot with calculated metrics (successful calculation)
 */
export const COMPLETE_SNAPSHOT = createForecastSnapshotFactory({
  name: 'Q4 2024 Complete Snapshot',
  status: 'complete',
  calculatedMetrics: {
    irr: 0.185,
    moic: 2.4,
    dpi: 0.92,
    tvpi: 1.38,
    totalValue: 125_000_000,
    deployedCapital: 52_000_000,
    unrealizedValue: 95_000_000,
    realizedValue: 30_000_000,
  },
  fundState: {
    fundSize: 100_000_000,
    deploymentRate: 0.52,
  },
  portfolioState: {
    companyCount: 18,
    averageOwnership: 0.14,
    sectorDiversity: 0.85,
  },
  metricsState: {
    calculationTime: 2850,
    dataPoints: 1247,
  },
});

/**
 * Snapshot in calculating state with progress
 */
export const CALCULATING_SNAPSHOT = createForecastSnapshotFactory({
  name: 'Q1 2025 Calculating Snapshot',
  status: 'calculating',
  calculatedMetrics: null,
});

/**
 * Snapshot in error state
 */
export const ERROR_SNAPSHOT = createForecastSnapshotFactory({
  name: 'Failed Snapshot',
  status: 'error',
  calculatedMetrics: {
    error: 'Calculation timeout exceeded',
    partialResults: null,
  },
});

/**
 * Complete set of lots for a single investment (initial + follow-ons)
 */
export const INVESTMENT_LOT_HISTORY = [
  createInvestmentLotFactory({
    lotType: 'initial',
    sharePriceCents: BigInt(100_000).toString(), // $1.00/share
    sharesAcquired: '2000000.00000000', // 2M shares
    costBasisCents: BigInt(2_000_000_00).toString(), // $2M
  }),
  createInvestmentLotFactory({
    lotType: 'follow_on',
    sharePriceCents: BigInt(250_000).toString(), // $2.50/share
    sharesAcquired: '400000.00000000', // 400k shares
    costBasisCents: BigInt(1_000_000_00).toString(), // $1M
  }),
  createInvestmentLotFactory({
    lotType: 'follow_on',
    sharePriceCents: BigInt(500_000).toString(), // $5.00/share
    sharesAcquired: '300000.00000000', // 300k shares
    costBasisCents: BigInt(1_500_000_00).toString(), // $1.5M
  }),
];

// =====================
// EDGE CASE DATASETS
// =====================

/**
 * Edge case: Very small lot (fractional shares)
 */
export const FRACTIONAL_LOT = createInvestmentLotFactory({
  sharePriceCents: BigInt(100_000).toString(), // $1.00/share
  sharesAcquired: '0.00000001', // Minimum precision (8 decimals)
  costBasisCents: '0', // Rounds to zero cents
});

/**
 * Edge case: Very large lot (whale investment)
 */
export const WHALE_LOT = createInvestmentLotFactory({
  sharePriceCents: BigInt(10_000_000_000).toString(), // $100M/share
  sharesAcquired: '100.00000000', // 100 shares
  costBasisCents: BigInt(10_000_000_000_00).toString(), // $10B
});

/**
 * Edge case: Maximum pagination limit
 */
export const MAX_PAGINATION_LIMIT = 100;

/**
 * Edge case: Minimum pagination limit
 */
export const MIN_PAGINATION_LIMIT = 1;

// =====================
// TEST HELPERS
// =====================

/**
 * Generate a batch of lots for stress testing pagination
 *
 * @param count - Number of lots to generate
 * @param investmentId - Investment ID for all lots
 * @returns Array of investment lots
 *
 * @example
 * const lots = generateLotBatch(150, 1); // 150 lots for investment 1
 */
export function generateLotBatch(count: number, investmentId: number): InvestmentLotV1[] {
  return Array.from({ length: count }, (_, i) =>
    createInvestmentLotFactory({
      investmentId,
      lotType: i % 3 === 0 ? 'initial' : i % 3 === 1 ? 'follow_on' : 'secondary',
      sharePriceCents: BigInt((i + 1) * 100_000).toString(), // Incremental prices
    })
  );
}

/**
 * Generate a batch of snapshots for stress testing pagination
 *
 * @param count - Number of snapshots to generate
 * @param fundId - Fund ID for all snapshots
 * @returns Array of forecast snapshots
 *
 * @example
 * const snapshots = generateSnapshotBatch(50, 1); // 50 snapshots for fund 1
 */
export function generateSnapshotBatch(
  count: number,
  fundId: number
): ForecastSnapshotV1[] {
  const statuses: SnapshotStatus[] = ['pending', 'calculating', 'complete', 'error'];

  return Array.from({ length: count }, (_, i) =>
    createForecastSnapshotFactory({
      fundId,
      name: `Batch Snapshot ${i + 1}`,
      status: statuses[i % statuses.length],
    })
  );
}

/**
 * Generate realistic reserve allocations for a snapshot
 *
 * @param snapshotId - Snapshot ID
 * @param companyIds - Array of company IDs to allocate reserves to
 * @returns Array of reserve allocations
 *
 * @example
 * const allocations = generateReserveAllocations(snapshotId, [1, 2, 3]);
 */
export function generateReserveAllocations(
  snapshotId: string,
  companyIds: number[]
): ReserveAllocationV1[] {
  return companyIds.map((companyId, index) =>
    createReserveAllocationFactory({
      snapshotId,
      companyId,
      plannedReserveCents: BigInt((index + 1) * 250_000_00).toString(),
      allocationScore: (0.9 - index * 0.1).toFixed(6),
      priority: index + 1,
      rationale: `Priority ${index + 1} allocation for follow-on investment`,
    })
  );
}

/**
 * Create a snapshot with complete state (fund + portfolio + metrics)
 *
 * @param fundId - Fund ID
 * @param status - Snapshot status
 * @returns Forecast snapshot with all state fields populated
 *
 * @example
 * const snapshot = createCompleteSnapshot(1, 'complete');
 */
export function createCompleteSnapshot(
  fundId: number,
  status: SnapshotStatus = 'complete'
): ForecastSnapshotV1 {
  return createForecastSnapshotFactory({
    fundId,
    status,
    fundState: {
      fundSize: 100_000_000,
      deploymentRate: 0.52,
      managementFeeRate: 0.02,
      carriedInterest: 0.20,
    },
    portfolioState: {
      companyCount: 18,
      totalInvested: 52_000_000,
      averageOwnership: 0.14,
      sectorBreakdown: {
        Technology: 0.35,
        Healthcare: 0.28,
        'Financial Services': 0.22,
        Consumer: 0.10,
        Other: 0.05,
      },
    },
    metricsState: {
      calculationTime: 2850,
      dataPoints: 1247,
      version: '2.1.0',
    },
    calculatedMetrics:
      status === 'complete'
        ? {
            irr: 0.185,
            moic: 2.4,
            dpi: 0.92,
            tvpi: 1.38,
          }
        : null,
  });
}

/**
 * Generate cost basis mismatch scenarios for validation testing
 *
 * @returns Array of [sharePriceCents, sharesAcquired, costBasisCents, shouldPass]
 *
 * @example
 * const scenarios = getCostBasisMismatchScenarios();
 * scenarios.forEach(([price, shares, cost, shouldPass]) => {
 *   const result = validateCostBasis(price, shares, cost);
 *   expect(result).toBe(shouldPass);
 * });
 */
export function getCostBasisMismatchScenarios(): Array<
  [bigint, string, bigint, boolean]
> {
  return [
    // [sharePriceCents, sharesAcquired, costBasisCents, shouldPass]

    // Valid: Exact match
    [BigInt(100_000), '1000.00', BigInt(1_000_000_00), true],

    // Valid: Within tolerance (< 1 cent per share)
    [BigInt(100_000), '1000.00', BigInt(1_000_000_00 + 500), true], // +500 cents = 0.5 cents/share

    // Invalid: Beyond tolerance (> 1 cent per share)
    [BigInt(100_000), '1000.00', BigInt(1_000_000_00 + 2000), false], // +2000 cents = 2 cents/share

    // Valid: Fractional shares with rounding
    [BigInt(100_000), '1000.12345678', BigInt(1_000_123_46), true],

    // Invalid: Significant mismatch
    [BigInt(100_000), '1000.00', BigInt(500_000_00), false], // 50% off

    // Valid: Edge case - very small lot
    [BigInt(1), '0.00000001', BigInt(0), true], // Rounds to zero

    // Valid: Edge case - whale lot
    [BigInt(10_000_000_000), '100.00', BigInt(10_000_000_000_00), true],
  ];
}

// =====================
// IDEMPOTENCY TEST HELPERS
// =====================

/**
 * Generate duplicate request scenarios for idempotency testing
 *
 * @param baseRequest - Base request payload
 * @returns Object with original and duplicate request variants
 *
 * @example
 * const { sameKeyAndBody, sameKeyDiffBody, diffKeysSameBody } =
 *   getIdempotencyScenarios(createLotRequestFactory());
 */
export function getIdempotencyScenarios(baseRequest: CreateLotRequest) {
  const idempotencyKey = randomUUID();

  return {
    // Scenario 1: Same key, same body (should return original)
    sameKeyAndBody: {
      first: { ...baseRequest, idempotencyKey },
      second: { ...baseRequest, idempotencyKey },
    },

    // Scenario 2: Same key, different body (should return 409)
    sameKeyDiffBody: {
      first: { ...baseRequest, idempotencyKey },
      second: {
        ...baseRequest,
        sharePriceCents: BigInt(500_000).toString(), // Different price
        idempotencyKey,
      },
    },

    // Scenario 3: Different keys, same body (should create new)
    diffKeysSameBody: {
      first: { ...baseRequest, idempotencyKey: randomUUID() },
      second: { ...baseRequest, idempotencyKey: randomUUID() },
    },
  };
}

// =====================
// VERSION CONFLICT TEST HELPERS
// =====================

/**
 * Generate optimistic locking conflict scenarios
 *
 * @param currentVersion - Current entity version
 * @returns Object with valid and invalid version update scenarios
 *
 * @example
 * const { validUpdate, staleUpdate, futureUpdate } =
 *   getVersionConflictScenarios(2);
 */
export function getVersionConflictScenarios(currentVersion: number) {
  return {
    // Valid: Updating with current version
    validUpdate: {
      requestVersion: currentVersion,
      dbVersion: currentVersion,
      shouldSucceed: true,
    },

    // Invalid: Stale version (request version < db version)
    staleUpdate: {
      requestVersion: currentVersion - 1,
      dbVersion: currentVersion,
      shouldSucceed: false,
    },

    // Invalid: Future version (request version > db version)
    futureUpdate: {
      requestVersion: currentVersion + 2,
      dbVersion: currentVersion,
      shouldSucceed: false,
    },
  };
}

// =====================
// STATUS TRANSITION TEST HELPERS
// =====================

/**
 * Generate status transition test scenarios
 *
 * @returns Array of [currentStatus, newStatus, shouldSucceed]
 *
 * @example
 * const scenarios = getStatusTransitionScenarios();
 * scenarios.forEach(([current, next, shouldSucceed]) => {
 *   const result = validateStatusTransition(current, next);
 *   expect(result).toBe(shouldSucceed);
 * });
 */
export function getStatusTransitionScenarios(): Array<
  [SnapshotStatus, SnapshotStatus, boolean]
> {
  return [
    // Valid transitions
    ['pending', 'calculating', true],
    ['pending', 'error', true],
    ['calculating', 'complete', true],
    ['calculating', 'error', true],

    // Invalid transitions (backwards)
    ['calculating', 'pending', false],
    ['complete', 'calculating', false],
    ['complete', 'pending', false],
    ['error', 'pending', false],

    // Invalid transitions (from terminal states)
    ['complete', 'error', false],
    ['error', 'complete', false],

    // Invalid transitions (to same state)
    ['pending', 'pending', false],
    ['calculating', 'calculating', false],
    ['complete', 'complete', false],
    ['error', 'error', false],
  ];
}

// =====================
// CLEANUP HELPERS
// =====================

/**
 * Generate a test cleanup function for database tables
 *
 * @param db - Drizzle database client
 * @returns Async cleanup function
 *
 * @example
 * const cleanup = createTestCleanup(db);
 * afterEach(async () => {
 *   await cleanup();
 * });
 */
export function createTestCleanup(db: any) {
  return async () => {
    // Clean up in reverse dependency order
    await db.delete('reserve_allocations');
    await db.delete('investment_lots');
    await db.delete('forecast_snapshots');
    await db.delete('investments');
    await db.delete('funds');
  };
}
