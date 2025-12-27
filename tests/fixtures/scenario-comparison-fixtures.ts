/**
 * Scenario Comparison Test Fixtures
 *
 * Reusable test data factories for scenario comparison APIs.
 * Provides typed fixtures for funds, scenarios, and fund snapshots.
 *
 * Version: 1.0.0
 * Created: 2025-12-26
 *
 * @module tests/fixtures/scenario-comparison-fixtures
 */

import { randomUUID } from 'crypto';
import { type InferInsertModel } from 'drizzle-orm';
import type * as schema from '@shared/schema';

// =====================
// TYPE DEFINITIONS
// =====================

export type FundInsert = InferInsertModel<typeof schema.funds>;
export type ScenarioInsert = InferInsertModel<typeof schema.scenarios>;
export type FundSnapshotInsert = InferInsertModel<typeof schema.fundSnapshots>;

export interface ScenarioComparisonFixture {
  fund: FundInsert;
  scenarios: {
    baseCase: ScenarioInsert;
    aggressive: ScenarioInsert;
    conservative: ScenarioInsert;
  };
  snapshots: {
    baseCase: FundSnapshotInsert;
    aggressive: FundSnapshotInsert;
    conservative: FundSnapshotInsert;
  };
  comparisonRequest: {
    fundId: number;
    baseScenarioId: string;
    comparisonScenarioIds: string[];
    comparisonType: 'deal_level';
    comparisonMetrics: string[];
  };
}

const DEFAULT_FUND_ID = 1;
const DEFAULT_COMPANY_ID = 1;
const DEFAULT_CREATED_BY = '00000000-0000-0000-0000-000000000001';

const SCENARIO_IDS = {
  baseCase: '00000000-0000-0000-0000-000000000101',
  aggressive: '00000000-0000-0000-0000-000000000102',
  conservative: '00000000-0000-0000-0000-000000000103',
};

// =====================
// FACTORY FUNCTIONS
// =====================

/**
 * Create a fund with defaults tailored for scenario comparison tests.
 */
export function createFundFixture(overrides?: Partial<FundInsert>): FundInsert {
  return {
    id: DEFAULT_FUND_ID,
    name: 'Atlas Growth Fund I',
    size: '150000000.00', // $150M
    deployedCapital: '60000000.00', // $60M deployed
    managementFee: '0.0200', // 2%
    carryPercentage: '0.2000', // 20%
    vintageYear: 2024,
    establishmentDate: new Date('2024-02-01T00:00:00Z'),
    status: 'active',
    isActive: true,
    createdAt: new Date('2024-01-05T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Create a scenario with test-friendly defaults.
 */
export function createScenarioFixture(overrides?: Partial<ScenarioInsert>): ScenarioInsert {
  const now = new Date('2024-09-01T10:00:00Z');
  const scenario: ScenarioInsert = {
    id: randomUUID(),
    companyId: DEFAULT_COMPANY_ID,
    name: 'Base Case',
    description: 'Baseline growth assumptions with balanced pacing.',
    version: 1,
    isDefault: false,
    createdBy: DEFAULT_CREATED_BY,
    createdAt: now,
    updatedAt: now,
  };

  return { ...scenario, ...overrides };
}

/**
 * Create a fund snapshot with pacing/reserve strategy payloads.
 */
export function createFundSnapshotFixture(
  overrides?: Partial<FundSnapshotInsert>
): FundSnapshotInsert {
  const snapshotTime = new Date('2024-10-01T12:00:00Z');
  const snapshot: FundSnapshotInsert = {
    fundId: DEFAULT_FUND_ID,
    type: 'PACING',
    payload: {
      pacingStrategy: {
        cadence: 'quarterly',
        targetDeploymentRate: 0.25,
        followOnCadence: 'semi_annual',
      },
      reserveStrategy: {
        targetReservePct: 0.25,
        followOnBias: 0.6,
        riskBufferPct: 0.05,
      },
      assumptions: {
        exitMultiple: 1.8,
        lossRatio: 0.1,
        rampMonths: 24,
      },
    },
    calcVersion: 'pacing-v1.0',
    correlationId: randomUUID(),
    snapshotTime,
    eventCount: 12,
    metadata: {
      comparisonLabel: 'base',
      source: 'scenario-comparison-fixtures',
    },
  };

  return { ...snapshot, ...overrides };
}

/**
 * Create a complete scenario comparison dataset (fund + scenarios + snapshots).
 */
export function createScenarioComparisonFixture(): ScenarioComparisonFixture {
  const fund = createFundFixture();
  const fundId = fund.id ?? DEFAULT_FUND_ID;

  const scenarios = {
    baseCase: SCENARIO_COMPARISON_DATASET.baseCase,
    aggressive: SCENARIO_COMPARISON_DATASET.aggressive,
    conservative: SCENARIO_COMPARISON_DATASET.conservative,
  };

  const snapshots = {
    baseCase: createFundSnapshotFixture({
      fundId,
      snapshotTime: new Date('2024-10-01T12:00:00Z'),
      payload: {
        pacingStrategy: {
          cadence: 'quarterly',
          targetDeploymentRate: 0.25,
          followOnCadence: 'semi_annual',
        },
        reserveStrategy: {
          targetReservePct: 0.25,
          followOnBias: 0.6,
          riskBufferPct: 0.05,
        },
        assumptions: {
          exitMultiple: 1.8,
          lossRatio: 0.1,
          rampMonths: 24,
        },
      },
      metadata: {
        comparisonLabel: 'base',
        scenarioName: 'Base Case',
      },
    }),
    aggressive: createFundSnapshotFixture({
      fundId,
      snapshotTime: new Date('2024-10-15T12:00:00Z'),
      payload: {
        pacingStrategy: {
          cadence: 'monthly',
          targetDeploymentRate: 0.35,
          followOnCadence: 'quarterly',
        },
        reserveStrategy: {
          targetReservePct: 0.15,
          followOnBias: 0.75,
          riskBufferPct: 0.03,
        },
        assumptions: {
          exitMultiple: 2.2,
          lossRatio: 0.08,
          rampMonths: 18,
        },
      },
      metadata: {
        comparisonLabel: 'aggressive',
        scenarioName: 'Aggressive Growth',
      },
    }),
    conservative: createFundSnapshotFixture({
      fundId,
      snapshotTime: new Date('2024-10-30T12:00:00Z'),
      payload: {
        pacingStrategy: {
          cadence: 'semi_annual',
          targetDeploymentRate: 0.18,
          followOnCadence: 'annual',
        },
        reserveStrategy: {
          targetReservePct: 0.35,
          followOnBias: 0.45,
          riskBufferPct: 0.08,
        },
        assumptions: {
          exitMultiple: 1.5,
          lossRatio: 0.12,
          rampMonths: 30,
        },
      },
      metadata: {
        comparisonLabel: 'conservative',
        scenarioName: 'Conservative',
      },
    }),
  };

  return {
    fund,
    scenarios,
    snapshots,
    comparisonRequest: {
      fundId,
      baseScenarioId: SCENARIO_IDS.baseCase,
      comparisonScenarioIds: [SCENARIO_IDS.aggressive, SCENARIO_IDS.conservative],
      comparisonType: 'deal_level',
      comparisonMetrics: ['moic', 'irr', 'total_investment', 'exit_proceeds'],
    },
  };
}

// =====================
// PRE-BUILT DATASETS
// =====================

/**
 * Pre-built scenario dataset for common comparison tests.
 */
export const SCENARIO_COMPARISON_DATASET = {
  baseCase: createScenarioFixture({
    id: SCENARIO_IDS.baseCase,
    name: 'Base Case',
    description: 'Balanced pacing with steady reserves and moderate exits.',
    isDefault: true,
    createdAt: new Date('2024-09-01T10:00:00Z'),
    updatedAt: new Date('2024-09-10T10:00:00Z'),
  }),
  aggressive: createScenarioFixture({
    id: SCENARIO_IDS.aggressive,
    name: 'Aggressive Growth',
    description: 'Accelerated deployment with higher upside assumptions.',
    createdAt: new Date('2024-09-05T10:00:00Z'),
    updatedAt: new Date('2024-09-20T10:00:00Z'),
  }),
  conservative: createScenarioFixture({
    id: SCENARIO_IDS.conservative,
    name: 'Conservative',
    description: 'Slower pacing with higher reserves and lower volatility.',
    createdAt: new Date('2024-09-08T10:00:00Z'),
    updatedAt: new Date('2024-09-25T10:00:00Z'),
  }),
};
