/**
 * Portfolio Service Test Fixtures
 *
 * Simplified test data factories for service layer testing.
 * Provides factories for funds, investments, lots, and snapshots with sensible defaults.
 *
 * Version: 1.0.0 (Phase 0-ALPHA)
 * Created: 2025-11-10
 *
 * @module tests/fixtures/portfolio-fixtures
 */

import { randomUUID } from 'crypto';
import type {
  ForecastSnapshot,
  InvestmentLot,
} from '@shared/schema';

// =====================
// TYPE DEFINITIONS
// =====================

/**
 * Minimal fund representation for testing
 */
export interface TestFund {
  id: number;
  name: string;
  size: string;
  managementFee: string;
  carryPercentage: string;
  vintageYear: number;
  establishmentDate: Date | null;
  status: string;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Minimal investment representation for testing
 */
export interface TestInvestment {
  id: number;
  fundId: number;
  companyId: number;
  investmentDate: Date;
  amount: string;
  round: string;
  ownershipPercentage: string | null;
  valuationAtInvestment: string | null;
  sharePriceCents: bigint | null;
  sharesAcquired: string | null;
  costBasisCents: bigint | null;
  pricingConfidence: string;
  version: number;
  createdAt: Date;
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
 * const fund = createTestFund({ name: 'Growth Fund I', size: '100000000.00' });
 */
export function createTestFund(overrides?: Partial<TestFund>): TestFund {
  const now = new Date();
  return {
    id: Math.floor(Math.random() * 10000) + 1,
    name: `Test Fund ${randomUUID().slice(0, 8)}`,
    size: '50000000.00', // $50M
    managementFee: '0.0200', // 2%
    carryPercentage: '0.2000', // 20%
    vintageYear: 2024,
    establishmentDate: new Date('2024-01-01'),
    status: 'active',
    isActive: true,
    createdAt: now,
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
 * const investment = createTestInvestment({ fundId: 1, amount: '1000000.00' });
 */
export function createTestInvestment(
  overrides?: Partial<TestInvestment>
): TestInvestment {
  const now = new Date();
  return {
    id: Math.floor(Math.random() * 10000) + 1,
    fundId: 1,
    companyId: 1,
    investmentDate: new Date('2024-03-15'),
    amount: '1000000.00', // $1M
    round: 'Series A',
    ownershipPercentage: '0.1500', // 15%
    valuationAtInvestment: '10000000.00', // $10M
    sharePriceCents: BigInt(250_000), // $2.50/share
    sharesAcquired: '400000.00000000', // 400k shares
    costBasisCents: BigInt(100_000_000), // $1M in cents
    pricingConfidence: 'calculated',
    version: 1,
    createdAt: now,
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
 * const lot = createTestLot({ lotType: 'follow_on', investmentId: 1 });
 */
export function createTestLot(
  overrides?: Partial<InvestmentLot>
): InvestmentLot {
  const now = new Date();
  const sharePriceCents = BigInt(250_000); // $2.50/share in cents
  const sharesAcquired = '1000.00000000'; // 1000 shares
  const costBasisCents = BigInt(250_000_000); // $2.5M in cents

  return {
    id: randomUUID(),
    investmentId: 1,
    lotType: 'initial',
    sharePriceCents,
    sharesAcquired,
    costBasisCents,
    version: BigInt(1),
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
 * const snapshot = createTestSnapshot({ status: 'complete', fundId: 1 });
 */
export function createTestSnapshot(
  overrides?: Partial<ForecastSnapshot>
): ForecastSnapshot {
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
    version: BigInt(1),
    idempotencyKey: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// =====================
// REALISTIC DATASETS
// =====================

/**
 * Sample funds with different sizes
 */
export const SAMPLE_FUNDS: TestFund[] = [
  createTestFund({
    id: 1,
    name: 'Early Stage Fund I',
    size: '25000000.00', // $25M
    vintageYear: 2023,
  }),
  createTestFund({
    id: 2,
    name: 'Growth Fund I',
    size: '100000000.00', // $100M
    vintageYear: 2024,
  }),
  createTestFund({
    id: 3,
    name: 'Opportunity Fund',
    size: '50000000.00', // $50M
    vintageYear: 2024,
  }),
];

/**
 * Sample investments across different stages
 */
export const SAMPLE_INVESTMENTS: TestInvestment[] = [
  createTestInvestment({
    id: 1,
    fundId: 1,
    amount: '500000.00',
    round: 'Seed',
  }),
  createTestInvestment({
    id: 2,
    fundId: 1,
    amount: '1000000.00',
    round: 'Series A',
  }),
  createTestInvestment({
    id: 3,
    fundId: 2,
    amount: '2500000.00',
    round: 'Series A',
  }),
  createTestInvestment({
    id: 4,
    fundId: 2,
    amount: '5000000.00',
    round: 'Series B',
  }),
  createTestInvestment({
    id: 5,
    fundId: 3,
    amount: '3000000.00',
    round: 'Series A',
  }),
];

/**
 * Sample lots with various types
 */
export const SAMPLE_LOTS: InvestmentLot[] = [
  // Investment 1 - Initial only
  createTestLot({
    id: randomUUID(),
    investmentId: 1,
    lotType: 'initial',
    sharePriceCents: BigInt(100_000),
    sharesAcquired: '500000.00000000',
    costBasisCents: BigInt(50_000_000),
  }),
  // Investment 2 - Initial + follow-on
  createTestLot({
    id: randomUUID(),
    investmentId: 2,
    lotType: 'initial',
    sharePriceCents: BigInt(200_000),
    sharesAcquired: '500000.00000000',
    costBasisCents: BigInt(100_000_000),
  }),
  createTestLot({
    id: randomUUID(),
    investmentId: 2,
    lotType: 'follow_on',
    sharePriceCents: BigInt(400_000),
    sharesAcquired: '250000.00000000',
    costBasisCents: BigInt(100_000_000),
  }),
  // Investment 3 - Initial + multiple follow-ons
  createTestLot({
    id: randomUUID(),
    investmentId: 3,
    lotType: 'initial',
    sharePriceCents: BigInt(500_000),
    sharesAcquired: '500000.00000000',
    costBasisCents: BigInt(250_000_000),
  }),
  createTestLot({
    id: randomUUID(),
    investmentId: 3,
    lotType: 'follow_on',
    sharePriceCents: BigInt(1_000_000),
    sharesAcquired: '200000.00000000',
    costBasisCents: BigInt(200_000_000),
  }),
  createTestLot({
    id: randomUUID(),
    investmentId: 3,
    lotType: 'secondary',
    sharePriceCents: BigInt(1_500_000),
    sharesAcquired: '100000.00000000',
    costBasisCents: BigInt(150_000_000),
  }),
];

/**
 * Sample snapshots in various states
 */
export const SAMPLE_SNAPSHOTS: ForecastSnapshot[] = [
  // Pending snapshot
  createTestSnapshot({
    id: randomUUID(),
    fundId: 1,
    name: 'Q4 2024 Pending',
    status: 'pending',
  }),
  // Calculating snapshot
  createTestSnapshot({
    id: randomUUID(),
    fundId: 1,
    name: 'Q4 2024 Calculating',
    status: 'calculating',
  }),
  // Complete snapshot with metrics
  createTestSnapshot({
    id: randomUUID(),
    fundId: 2,
    name: 'Q3 2024 Complete',
    status: 'complete',
    calculatedMetrics: {
      irr: 0.185,
      moic: 2.4,
      dpi: 0.92,
      tvpi: 1.38,
    },
    fundState: {
      fundSize: 100_000_000,
      deploymentRate: 0.52,
    },
    portfolioState: {
      companyCount: 18,
      averageOwnership: 0.14,
    },
  }),
  // Error snapshot
  createTestSnapshot({
    id: randomUUID(),
    fundId: 2,
    name: 'Failed Calculation',
    status: 'error',
    calculatedMetrics: {
      error: 'Calculation timeout',
    },
  }),
];

// =====================
// TEST HELPERS
// =====================

/**
 * Generate a batch of lots for stress testing
 *
 * @param count - Number of lots to generate
 * @param investmentId - Investment ID for all lots
 * @returns Array of investment lots
 *
 * @example
 * const lots = generateLotBatch(20, 1);
 */
export function generateLotBatch(count: number, investmentId: number): InvestmentLot[] {
  return Array.from({ length: count }, (_, i) =>
    createTestLot({
      investmentId,
      lotType: i % 3 === 0 ? 'initial' : i % 3 === 1 ? 'follow_on' : 'secondary',
      sharePriceCents: BigInt((i + 1) * 100_000),
      sharesAcquired: `${1000 + i}.00000000`,
      costBasisCents: BigInt((i + 1) * 100_000 * (1000 + i)),
    })
  );
}

/**
 * Generate a batch of snapshots for stress testing
 *
 * @param count - Number of snapshots to generate
 * @param fundId - Fund ID for all snapshots
 * @returns Array of forecast snapshots
 *
 * @example
 * const snapshots = generateSnapshotBatch(10, 1);
 */
export function generateSnapshotBatch(
  count: number,
  fundId: number
): ForecastSnapshot[] {
  const statuses: Array<'pending' | 'calculating' | 'complete' | 'error'> = [
    'pending',
    'calculating',
    'complete',
    'error',
  ];

  return Array.from({ length: count }, (_, i) =>
    createTestSnapshot({
      fundId,
      name: `Batch Snapshot ${i + 1}`,
      status: statuses[i % statuses.length],
    })
  );
}
