/**
 * quarterly-schedule-compiler-v1.test.ts
 *
 * Unit tests for the Quarterly Schedule Compiler V1.
 *
 * The compiler is a thin consumer of the Effective Fee/Expense Bridge V1.
 * It contains no fee arithmetic of its own -- it delegates validation
 * and vector construction to the bridge, then projects the result into
 * a canonical quarterly schedule.
 *
 * V1 scope: zero-fee / zero-expense path only.
 */

import { describe, expect, it } from 'vitest';

import type { CurrentForecastV2 } from '../../../shared/contracts/current-forecast-v2.contract';
import type { CurrentPlanVersionV1 } from '../../../shared/contracts/current-plan-version-v1.contract';
import type { FundDraftWriteV1 } from '../../../shared/contracts/fund-draft-write-v1.contract';
import { buildEffectiveFeeExpenseBridgeV1 } from '../../../shared/lib/internal-economics/effective-fee-expense-bridge-v1';
import {
  compileQuarterlyScheduleV1,
  type QuarterlyScheduleResultV1,
} from '../../../shared/lib/internal-economics/quarterly-schedule-compiler-v1';

// ── constants ────────────────────────────────────────────────────────

const ZERO_MONEY = '0.000000';
const ZERO_RATIO = '0.000000000000';
const TOTAL_COMMITMENT_USD = '1000000.000000';
const HASH = 'a'.repeat(64);

// ── fixtures (mirrors bridge test) ───────────────────────────────────

function zeroCostConfig(): FundDraftWriteV1 {
  return {
    fundName: 'Zero Cost Fund',
    managementFeeRate: 0,
    lpClasses: [
      {
        id: 'class-a',
        name: 'Class A',
        targetAllocation: 100,
        managementFeeRate: 0,
      },
    ],
    feeProfiles: [
      {
        id: 'legacy-fees',
        name: 'Legacy Fees',
        feeTiers: [
          {
            id: 'legacy-tier',
            name: 'Legacy Tier',
            percentage: 0,
            feeBasis: 'committed_capital',
            startMonth: 1,
          },
        ],
      },
    ],
    fundExpenses: [
      {
        id: 'legacy-expense',
        category: 'Administration',
        monthlyAmount: 0,
        startMonth: 1,
      },
    ],
    economicsAssumptions: {
      version: 'v1',
      feeModel: {
        source: 'economics_override',
        tiers: [
          {
            id: 'economics-tier',
            name: 'Economics Tier',
            rate: 0,
            basis: 'committed_capital',
            startYear: 1,
          },
        ],
        defaultRate: 0,
        defaultBasis: 'committed_capital',
      },
      expenseModel: {
        source: 'economics_override',
        annualExpenses: [
          {
            id: 'economics-expense',
            category: 'Administration',
            amount: 0,
            startYear: 1,
          },
        ],
        orgExpenseCap: 0,
        orgExpenseCapType: 'absolute',
      },
    },
  };
}

function zeroCostPlan(): CurrentPlanVersionV1 {
  return {
    contractVersion: 'current-plan-version-v1',
    id: 'plan-1',
    fundId: 1,
    version: 1,
    sourceConfigId: 1,
    sourceConfigVersion: 1,
    sourceFactsSnapshotId: 'facts-1',
    deployableCapitalUsd: TOTAL_COMMITMENT_USD,
    planTransformationVersion: 'fund-config-to-current-plan/1.0.0',
    allocations: [],
    pacingAssumptions: {
      contractVersion: 'current-plan-pacing-v1',
      deploymentQuarters: 2,
      quarterlyDeploymentPcts: ['0.500000000000', '0.500000000000'],
      followOnReservePct: ZERO_RATIO,
      annualFeeDragPct: ZERO_RATIO,
    },
    cohortAssumptions: {
      contractVersion: 'current-plan-cohort-v1',
      averageInitialCheckUsd: ZERO_MONEY,
      stageDistribution: [{ stage: 'Seed', pct: '1.000000000000' }],
      graduationMatrix: [],
      exitAssumptions: [],
    },
    reservePolicyVersion: 'reserve-policy/1.0.0',
    assumptionsHash: HASH,
    supersedesVersionId: null,
    supersededByVersionId: null,
    createdAt: '2026-07-30T00:00:00.000Z',
  };
}

function forecastPoint(
  periodStart: string,
  periodEnd: string,
  source: 'actual' | 'projected'
): CurrentForecastV2['series'][number] {
  return {
    periodStart,
    periodEnd,
    source,
    deployedUsd: ZERO_MONEY,
    contributionsUsd: ZERO_MONEY,
    distributionsUsd: ZERO_MONEY,
    navUsd: ZERO_MONEY,
    tvpi: ZERO_RATIO,
    dpi: ZERO_RATIO,
    activeCompanyCount: 0,
    projectedCohortCount: 0,
  };
}

function zeroCostForecast(): CurrentForecastV2 {
  return {
    contractVersion: 'current-forecast-v2',
    fundId: 1,
    financialFactsSnapshotId: 'facts-1',
    currentPlanVersionId: 'plan-1',
    asOfDate: '2026-06-30',
    status: 'available',
    series: [
      forecastPoint('2026-07-01', '2026-09-30', 'projected'),
      forecastPoint('2026-04-01', '2026-06-30', 'actual'),
      forecastPoint('2026-10-01', '2026-12-31', 'projected'),
    ],
    remainingDeployableCapitalUsd: TOTAL_COMMITMENT_USD,
    committedCapitalUsd: TOTAL_COMMITMENT_USD,
    calledToDateUsd: ZERO_MONEY,
    projectedFeesRemainingUsd: ZERO_MONEY,
    recallableDistributionsUsd: ZERO_MONEY,
    uncalledCapitalUsd: TOTAL_COMMITMENT_USD,
    netIrr: null,
    inputHash: HASH,
    assumptionsHash: HASH,
    resultHash: HASH,
    engineVersion: 'current-forecast-v2-engine/1.0.0',
    methodologyVersion: 'cohort-projection-v2/1.0.0',
    unavailableReasons: [],
    warnings: [],
  };
}

function compatibleInput() {
  return {
    config: zeroCostConfig(),
    currentPlan: zeroCostPlan(),
    forecast: zeroCostForecast(),
    totalCommitmentUsd: TOTAL_COMMITMENT_USD,
  };
}

// ── determinism ──────────────────────────────────────────────────────

describe('compileQuarterlyScheduleV1 -- determinism', () => {
  it('produces byte-identical JSON for the same input', () => {
    const a = compileQuarterlyScheduleV1(compatibleInput());
    const b = compileQuarterlyScheduleV1(compatibleInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces deterministic results across repeated calls', () => {
    const results: QuarterlyScheduleResultV1[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(compileQuarterlyScheduleV1(compatibleInput()));
    }
    const first = JSON.stringify(results[0]);
    for (const result of results) {
      expect(JSON.stringify(result)).toBe(first);
    }
  });
});

// ── zero-fee / zero-expense path ─────────────────────────────────────

describe('compileQuarterlyScheduleV1 -- zero-fee path', () => {
  it('returns ok: true for zero-cost config', () => {
    const result = compileQuarterlyScheduleV1(compatibleInput());
    expect(result.ok).toBe(true);
  });

  it('emits the correct number of quarters matching the bridge', () => {
    const result = compileQuarterlyScheduleV1(compatibleInput());
    if (!result.ok) throw new Error('Expected ok');

    // Bridge emits only projected quarters (2 projected in fixture)
    expect(result.schedule.schedule).toHaveLength(2);
  });

  it('all money fields are canonical "0.000000"', () => {
    const result = compileQuarterlyScheduleV1(compatibleInput());
    if (!result.ok) throw new Error('Expected ok');

    for (const entry of result.schedule.schedule) {
      expect(entry.scheduledManagementFeeUsd).toBe('0.000000');
      expect(entry.scheduledFundExpenseUsd).toBe('0.000000');
      expect(entry.planUpfrontFeeReserveUsd).toBe('0.000000');
      expect(entry.forecastNavEmbeddedFeeUsd).toBe('0.000000');
      expect(entry.economicsFeeCashDebitUsd).toBe('0.000000');
      expect(entry.economicsExpenseCashDebitUsd).toBe('0.000000');
    }
  });

  it('capitalBaseUsd is a canonical decimal string', () => {
    const result = compileQuarterlyScheduleV1(compatibleInput());
    if (!result.ok) throw new Error('Expected ok');
    expect(result.schedule.capitalBaseUsd).toBe(TOTAL_COMMITMENT_USD);
  });

  it('compilerVersion is set correctly', () => {
    const result = compileQuarterlyScheduleV1(compatibleInput());
    if (!result.ok) throw new Error('Expected ok');
    expect(result.schedule.compilerVersion).toBe('quarterly-schedule-compiler/1.0.0');
  });

  it('sourceBridgeHash matches the bridge effectiveFeeExpenseHash', () => {
    const input = compatibleInput();
    const bridgeResult = buildEffectiveFeeExpenseBridgeV1(input);
    const compilerResult = compileQuarterlyScheduleV1(compatibleInput());

    if (!bridgeResult.ok) throw new Error('Bridge expected ok');
    if (!compilerResult.ok) throw new Error('Compiler expected ok');

    expect(compilerResult.schedule.sourceBridgeHash).toBe(
      bridgeResult.bridge.effectiveFeeExpenseHash
    );
  });

  it('quarter periods match bridge output exactly', () => {
    const input = compatibleInput();
    const bridgeResult = buildEffectiveFeeExpenseBridgeV1(input);
    const compilerResult = compileQuarterlyScheduleV1(compatibleInput());

    if (!bridgeResult.ok) throw new Error('Bridge expected ok');
    if (!compilerResult.ok) throw new Error('Compiler expected ok');

    const bridgeQuarters = bridgeResult.bridge.quarterlyVector;
    const compilerEntries = compilerResult.schedule.schedule;

    expect(compilerEntries).toHaveLength(bridgeQuarters.length);
    for (let i = 0; i < bridgeQuarters.length; i++) {
      expect(compilerEntries[i]!.periodStart).toBe(bridgeQuarters[i]!.periodStart);
      expect(compilerEntries[i]!.periodEnd).toBe(bridgeQuarters[i]!.periodEnd);
    }
  });

  it('supports an empty projected horizon with an empty schedule', () => {
    const input = compatibleInput();
    input.forecast.series = input.forecast.series.filter((period) => period.source === 'actual');

    const result = compileQuarterlyScheduleV1(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule.schedule).toEqual([]);
  });
});

// ── rejection passthrough ────────────────────────────────────────────

describe('compileQuarterlyScheduleV1 -- rejection passthrough', () => {
  it('rejects when config has nonzero managementFeeRate', () => {
    const input = compatibleInput();
    input.config.managementFeeRate = 0.01;

    const result = compileQuarterlyScheduleV1(input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected rejection');
    expect(result.code).toBe('FORECAST_FEE_BASIS_INCOMPATIBLE');
  });

  it('produces the exact same rejection as the bridge for nonzero fees', () => {
    const input = compatibleInput();
    input.config.managementFeeRate = 0.01;

    const bridgeResult = buildEffectiveFeeExpenseBridgeV1(input);
    const compilerResult = compileQuarterlyScheduleV1(input);

    expect(compilerResult).toEqual(bridgeResult);
  });

  it('produces the exact same rejection as the bridge for nonzero expenses', () => {
    const input = compatibleInput();
    input.config.fundExpenses![0]!.monthlyAmount = 1;

    const bridgeResult = buildEffectiveFeeExpenseBridgeV1(input);
    const compilerResult = compileQuarterlyScheduleV1(input);

    expect(compilerResult).toEqual(bridgeResult);
  });

  it('produces the exact same rejection as the bridge for reconciliation mismatches', () => {
    const input = compatibleInput();
    input.currentPlan.pacingAssumptions.annualFeeDragPct = '0.010000000000';

    const bridgeResult = buildEffectiveFeeExpenseBridgeV1(input);
    const compilerResult = compileQuarterlyScheduleV1(input);

    expect(compilerResult).toEqual(bridgeResult);
  });

  it('produces the exact same rejection as the bridge for multiple errors', () => {
    const input = compatibleInput();
    input.config.managementFeeRate = 0.01;
    input.config.fundExpenses![0]!.monthlyAmount = 1;
    input.currentPlan.pacingAssumptions.annualFeeDragPct = '0.010000000000';

    const bridgeResult = buildEffectiveFeeExpenseBridgeV1(input);
    const compilerResult = compileQuarterlyScheduleV1(input);

    expect(compilerResult).toEqual(bridgeResult);
  });

  it('produces the exact same rejection as the bridge for malformed input', () => {
    const input = {
      ...compatibleInput(),
      totalCommitmentUsd: 'not-money',
    };

    const bridgeResult = buildEffectiveFeeExpenseBridgeV1(
      input as ReturnType<typeof compatibleInput>
    );
    const compilerResult = compileQuarterlyScheduleV1(input as ReturnType<typeof compatibleInput>);

    expect(compilerResult).toEqual(bridgeResult);
  });

  it('rejection code is exactly FORECAST_FEE_BASIS_INCOMPATIBLE', () => {
    const input = compatibleInput();
    input.config.managementFeeRate = 0.01;

    const result = compileQuarterlyScheduleV1(input);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected rejection');
    expect(result.code).toBe('FORECAST_FEE_BASIS_INCOMPATIBLE');
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
