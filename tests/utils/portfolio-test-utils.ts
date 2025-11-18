/**
 * Portfolio Service Test Utilities
 *
 * Reusable utilities for service layer testing including:
 * - Assertion helpers for BigInt comparisons
 * - Database seeding utilities
 * - Mock data generators
 *
 * Version: 1.0.0 (Phase 0-ALPHA)
 * Created: 2025-11-10
 *
 * @module tests/utils/portfolio-test-utils
 */

import { randomUUID } from 'crypto';
import type {
  ForecastSnapshot,
  InvestmentLot,
} from '@shared/schema';
import {
  createTestFund,
  createTestInvestment,
  createTestLot,
  createTestSnapshot,
  type TestFund,
  type TestInvestment,
} from '../fixtures/portfolio-fixtures';

// =====================
// TYPE DEFINITIONS
// =====================

/**
 * Database seeding configuration
 */
export interface SeedConfig {
  fundCount?: number;
  investmentsPerFund?: number;
  lotsPerInvestment?: number;
  snapshotsPerFund?: number;
}

/**
 * Database seeding result
 */
export interface SeedResult {
  funds: TestFund[];
  investments: TestInvestment[];
  lots: InvestmentLot[];
  snapshots: ForecastSnapshot[];
  cleanup: () => Promise<void>;
}

// =====================
// ASSERTION HELPERS
// =====================

/**
 * Assert that BigInt values are approximately equal (within tolerance)
 *
 * @param actual - Actual BigInt value
 * @param expected - Expected BigInt value
 * @param tolerance - Allowed difference (default: 1 cent)
 * @throws Error if values differ beyond tolerance
 *
 * @example
 * assertBigIntEquals(lot.costBasisCents, expectedCost, BigInt(100)); // ±$1 tolerance
 */
export function assertBigIntEquals(
  actual: bigint,
  expected: bigint,
  tolerance: bigint = BigInt(1)
): void {
  const diff =
    actual > expected
      ? actual - expected
      : expected - actual;

  if (diff > tolerance) {
    throw new Error(
      `BigInt assertion failed:\n` +
        `  Expected: ${expected.toString()}\n` +
        `  Actual:   ${actual.toString()}\n` +
        `  Diff:     ${diff.toString()} (tolerance: ${tolerance.toString()})`
    );
  }
}

/**
 * Assert that a value is a valid UUID
 *
 * @param value - Value to validate
 * @throws Error if not a valid UUID
 *
 * @example
 * assertValidUUID(snapshot.id);
 */
export function assertValidUUID(value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`Expected UUID string, got ${typeof value}`);
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(value)) {
    throw new Error(`Invalid UUID format: ${value}`);
  }
}

/**
 * Assert that a snapshot has valid structure
 *
 * @param snapshot - Snapshot to validate
 * @throws Error if structure is invalid
 *
 * @example
 * assertValidSnapshot(result);
 */
export function assertValidSnapshot(
  snapshot: unknown
): asserts snapshot is ForecastSnapshot {
  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new Error('Snapshot must be an object');
  }

  const s = snapshot as Record<string, unknown>;

  // Required fields
  assertValidUUID(s.id);
  if (typeof s.fundId !== 'number') {
    throw new Error(`fundId must be number, got ${typeof s.fundId}`);
  }
  if (typeof s.name !== 'string' || s.name.length === 0) {
    throw new Error('name must be non-empty string');
  }
  if (!['pending', 'calculating', 'complete', 'error'].includes(s.status as string)) {
    throw new Error(`Invalid status: ${s.status}`);
  }
  if (typeof s.version !== 'bigint') {
    throw new Error(`version must be bigint, got ${typeof s.version}`);
  }
}

/**
 * Assert that a lot has valid structure
 *
 * @param lot - Lot to validate
 * @throws Error if structure is invalid
 *
 * @example
 * assertValidLot(result);
 */
export function assertValidLot(lot: unknown): asserts lot is InvestmentLot {
  if (typeof lot !== 'object' || lot === null) {
    throw new Error('Lot must be an object');
  }

  const l = lot as Record<string, unknown>;

  // Required fields
  assertValidUUID(l.id);
  if (typeof l.investmentId !== 'number') {
    throw new Error(`investmentId must be number, got ${typeof l.investmentId}`);
  }
  if (!['initial', 'follow_on', 'secondary'].includes(l.lotType as string)) {
    throw new Error(`Invalid lotType: ${l.lotType}`);
  }
  if (typeof l.sharePriceCents !== 'bigint') {
    throw new Error(`sharePriceCents must be bigint, got ${typeof l.sharePriceCents}`);
  }
  if (typeof l.sharesAcquired !== 'string') {
    throw new Error(`sharesAcquired must be string, got ${typeof l.sharesAcquired}`);
  }
  if (typeof l.costBasisCents !== 'bigint') {
    throw new Error(`costBasisCents must be bigint, got ${typeof l.costBasisCents}`);
  }
  if (typeof l.version !== 'bigint') {
    throw new Error(`version must be bigint, got ${typeof l.version}`);
  }
}

// =====================
// DATABASE SEEDING
// =====================

/**
 * Seed test portfolio data
 *
 * @param db - Drizzle database client
 * @param config - Seeding configuration
 * @returns Seed result with IDs and cleanup function
 *
 * @example
 * const { funds, investments, lots, snapshots, cleanup } = await seedPortfolioData(db, {
 *   fundCount: 2,
 *   investmentsPerFund: 3,
 *   lotsPerInvestment: 2,
 *   snapshotsPerFund: 2,
 * });
 *
 * afterEach(async () => {
 *   await cleanup();
 * });
 */
export async function seedPortfolioData(
  db: any,
  config: SeedConfig = {}
): Promise<SeedResult> {
  const {
    fundCount = 1,
    investmentsPerFund = 2,
    lotsPerInvestment = 2,
    snapshotsPerFund = 1,
  } = config;

  const funds: TestFund[] = [];
  const investments: TestInvestment[] = [];
  const lots: InvestmentLot[] = [];
  const snapshots: ForecastSnapshot[] = [];

  // Create funds
  for (let f = 0; f < fundCount; f++) {
    const fund = createTestFund({
      name: `Seed Fund ${f + 1}`,
    });
    funds.push(fund);

    // Create investments for each fund
    for (let i = 0; i < investmentsPerFund; i++) {
      const investment = createTestInvestment({
        fundId: fund.id,
      });
      investments.push(investment);

      // Create lots for each investment
      for (let l = 0; l < lotsPerInvestment; l++) {
        const lot = createTestLot({
          investmentId: investment.id,
          lotType: l === 0 ? 'initial' : 'follow_on',
        });
        lots.push(lot);
      }
    }

    // Create snapshots for each fund
    for (let s = 0; s < snapshotsPerFund; s++) {
      const snapshot = createTestSnapshot({
        fundId: fund.id,
        name: `Seed Snapshot ${s + 1}`,
      });
      snapshots.push(snapshot);
    }
  }

  // Cleanup function
  const cleanup = async () => {
    // Clean up in reverse dependency order
    // Note: This is a placeholder - actual implementation would use database client
    const fundIds = funds.map((f) => f.id);
    const investmentIds = investments.map((i) => i.id);
    const snapshotIds = snapshots.map((s) => s.id);
    const lotIds = lots.map((l) => l.id);

    // In actual implementation:
    // await db.delete(reserveAllocations).where(inArray(reserveAllocations.snapshotId, snapshotIds));
    // await db.delete(investmentLots).where(inArray(investmentLots.id, lotIds));
    // await db.delete(forecastSnapshots).where(inArray(forecastSnapshots.id, snapshotIds));
    // await db.delete(investments).where(inArray(investments.id, investmentIds));
    // await db.delete(funds).where(inArray(funds.id, fundIds));

    // For now, just log
    console.log(`Would clean up ${fundIds.length} funds, ${investmentIds.length} investments, ${lotIds.length} lots, ${snapshotIds.length} snapshots`);
  };

  return {
    funds,
    investments,
    lots,
    snapshots,
    cleanup,
  };
}

// =====================
// MOCK DATA GENERATORS
// =====================

/**
 * Generate realistic calculated metrics for a snapshot
 *
 * @param seed - Random seed for deterministic generation
 * @returns Calculated metrics object
 *
 * @example
 * const metrics = generateCalculatedMetrics(12345);
 */
export function generateCalculatedMetrics(seed: number = Date.now()) {
  // Use seed for deterministic randomness
  const random = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  return {
    irr: 0.1 + random() * 0.3, // 10% - 40%
    moic: 1.5 + random() * 2.0, // 1.5x - 3.5x
    dpi: 0.5 + random() * 1.0, // 0.5x - 1.5x
    tvpi: 1.2 + random() * 1.5, // 1.2x - 2.7x
    totalValue: Math.floor(50_000_000 + random() * 100_000_000),
    deployedCapital: Math.floor(30_000_000 + random() * 50_000_000),
    unrealizedValue: Math.floor(40_000_000 + random() * 80_000_000),
    realizedValue: Math.floor(10_000_000 + random() * 30_000_000),
  };
}

/**
 * Generate realistic fund state for a snapshot
 *
 * @param fundSize - Fund size in dollars
 * @returns Fund state object
 *
 * @example
 * const fundState = generateFundState(100_000_000);
 */
export function generateFundState(fundSize: number) {
  return {
    fundSize,
    deploymentRate: 0.4 + Math.random() * 0.4, // 40% - 80%
    managementFeeRate: 0.02,
    carriedInterest: 0.20,
    vintageYear: 2023,
    fundTerm: 10,
  };
}

/**
 * Generate realistic portfolio state for a snapshot
 *
 * @param companyCount - Number of companies in portfolio
 * @returns Portfolio state object
 *
 * @example
 * const portfolioState = generatePortfolioState(18);
 */
export function generatePortfolioState(companyCount: number) {
  return {
    companyCount,
    totalInvested: Math.floor(30_000_000 + Math.random() * 50_000_000),
    averageOwnership: 0.1 + Math.random() * 0.1, // 10% - 20%
    sectorBreakdown: {
      Technology: 0.3 + Math.random() * 0.2,
      Healthcare: 0.2 + Math.random() * 0.15,
      'Financial Services': 0.15 + Math.random() * 0.15,
      Consumer: 0.1 + Math.random() * 0.1,
      Other: 0.05,
    },
  };
}

// =====================
// IDEMPOTENCY HELPERS
// =====================

/**
 * Generate unique idempotency key
 *
 * @returns UUID string
 *
 * @example
 * const key = generateIdempotencyKey();
 */
export function generateIdempotencyKey(): string {
  return randomUUID();
}

/**
 * Create duplicate request payload for idempotency testing
 *
 * @param basePayload - Original request payload
 * @returns Duplicate payload with same idempotency key
 *
 * @example
 * const duplicate = createDuplicateRequest(original);
 */
export function createDuplicateRequest<T extends { idempotencyKey?: string | null }>(
  basePayload: T
): T {
  return { ...basePayload };
}

// =====================
// PAGINATION HELPERS
// =====================

/**
 * Encode cursor for pagination testing
 *
 * @param timestamp - Timestamp value
 * @param id - Record ID
 * @returns Base64-encoded cursor
 *
 * @example
 * const cursor = encodeCursor(new Date(), 'uuid');
 */
export function encodeCursor(timestamp: Date, id: string): string {
  return Buffer.from(JSON.stringify({ timestamp: timestamp.toISOString(), id })).toString(
    'base64'
  );
}

/**
 * Decode cursor for pagination testing
 *
 * @param cursor - Base64-encoded cursor
 * @returns Decoded timestamp and ID
 *
 * @example
 * const { timestamp, id } = decodeCursor(cursor);
 */
export function decodeCursor(cursor: string): { timestamp: Date; id: string } {
  const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
  return {
    timestamp: new Date(decoded.timestamp),
    id: decoded.id,
  };
}
