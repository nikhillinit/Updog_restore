/**
 * Capital Allocation Period Truth Case Runner
 *
 * Dedicated harness for CA-007 through CA-020.  These cases assert period-level
 * pacing targets, reserve snapshots, lifecycle cohort allocation, cap/spill
 * behavior, recalls, and recycling signals.
 *
 * @see docs/capital-allocation.truth-cases.json
 * @see docs/CA-PACING-ORACLE.md
 */

import { describe, it, expect } from 'vitest';
import {
  adaptTruthCaseInput,
  centsToOutputUnits,
  convertPeriodLoopOutput,
  executePeriodLoop,
  type CAEngineOutput,
  type NormalizedInput,
  type PeriodLoopOutput,
  type TruthCaseInput,
} from '@shared/core/capitalAllocation';
import capitalCases from '../../../../docs/capital-allocation.truth-cases.json';

interface CATruthCase {
  id: string;
  module: string;
  category: 'reserve_engine' | 'pacing_engine' | 'cohort_engine' | 'integration';
  description: string;
  inputs: {
    fund: {
      commitment: number;
      target_reserve_pct: number;
      reserve_policy: 'static_pct' | 'dynamic_ratio';
      pacing_window_months?: number;
      vintage_year: number;
    };
    timeline: {
      start_date: string;
      end_date: string;
    };
    flows: {
      contributions: Array<{ date: string; amount: number }>;
      distributions: Array<{ date: string; amount: number; recycle_eligible?: boolean }>;
    };
    constraints: {
      min_cash_buffer: number;
      rebalance_frequency?: string;
      max_allocation_per_cohort?: number;
    };
    cohorts?: Array<{
      name: string;
      start_date: string;
      end_date: string;
      weight: number;
    }>;
  };
  expected: {
    reserve_balance?: number;
    allocations_by_cohort: Array<{ cohort: string; amount: number }>;
    violations: string[];
    reserve_balance_over_time?: Array<{ date: string; balance: number }>;
    pacing_targets_by_period?: Array<{ period: string; target: number }>;
  };
  notes: string;
  schemaVersion?: string;
}

type PeriodTruthCaseInput = TruthCaseInput & { category: CATruthCase['category'] };

const NUMERIC_TOLERANCE = 0.01;

function assertNumericEqual(actual: number, expected: number, field: string): void {
  const diff = Math.abs(actual - expected);
  const tolerance = Math.max(NUMERIC_TOLERANCE, Math.abs(expected) * 0.001);

  if (diff > tolerance) {
    throw new Error(
      `${field}: expected ${expected}, got ${actual} (diff: ${diff.toFixed(4)}, tolerance: ${tolerance.toFixed(4)})`
    );
  }

  expect(diff).toBeLessThanOrEqual(tolerance);
}

function convertToEngineInput(tc: CATruthCase): PeriodTruthCaseInput {
  return {
    category: tc.category,
    fund: {
      commitment: tc.inputs.fund.commitment,
      target_reserve_pct: tc.inputs.fund.target_reserve_pct,
      vintage_year: tc.inputs.fund.vintage_year,
      reserve_policy: tc.inputs.fund.reserve_policy,
      pacing_window_months: tc.inputs.fund.pacing_window_months,
    },
    constraints: {
      min_cash_buffer: tc.inputs.constraints.min_cash_buffer,
      max_allocation_per_cohort: tc.inputs.constraints.max_allocation_per_cohort,
      rebalance_frequency: tc.inputs.constraints.rebalance_frequency as
        | 'quarterly'
        | 'monthly'
        | 'annual',
    },
    timeline: {
      start_date: tc.inputs.timeline.start_date,
      end_date: tc.inputs.timeline.end_date,
    },
    flows: {
      contributions: tc.inputs.flows.contributions,
      distributions: tc.inputs.flows.distributions,
    },
    cohorts: tc.inputs.cohorts?.map((c) => ({
      id: c.name,
      name: c.name,
      start_date: c.start_date,
      end_date: c.end_date,
      weight: c.weight,
    })),
  };
}

function outputAmount(cents: number, input: NormalizedInput): number {
  return centsToOutputUnits(cents, input.unitScale);
}

function assertAllocations(
  tc: CATruthCase,
  input: NormalizedInput,
  loopOutput: PeriodLoopOutput
): void {
  const allocationsByName = new Map(
    input.cohorts.map((cohort) => [
      cohort.name,
      outputAmount(loopOutput.allocationsByCohort.get(cohort.id) ?? 0, input),
    ])
  );

  expect(allocationsByName.size).toBe(tc.expected.allocations_by_cohort.length);

  for (const expected of tc.expected.allocations_by_cohort) {
    const actual = allocationsByName.get(expected.cohort);
    expect(actual, `missing allocation for ${expected.cohort}`).toBeDefined();
    assertNumericEqual(actual ?? 0, expected.amount, `allocation[${expected.cohort}]`);
  }
}

function assertReserveSnapshots(
  tc: CATruthCase,
  input: NormalizedInput,
  loopOutput: PeriodLoopOutput
): void {
  const expectedSnapshots = tc.expected.reserve_balance_over_time ?? [];
  const snapshotsByDate = new Map(
    loopOutput.periods.map((snapshot) => [
      snapshot.period.endDate,
      outputAmount(snapshot.reserveBalanceCents, input),
    ])
  );

  for (const expected of expectedSnapshots) {
    const actual = snapshotsByDate.get(expected.date);
    expect(actual, `missing reserve snapshot for ${expected.date}`).toBeDefined();
    assertNumericEqual(
      actual ?? 0,
      expected.balance,
      `reserve_balance_over_time[${expected.date}]`
    );
  }
}

function assertPacingTargets(tc: CATruthCase, output: CAEngineOutput): void {
  const expectedTargets = tc.expected.pacing_targets_by_period ?? [];
  const actualTargets = output.pacing_targets_by_period.map(({ period, target }) => ({
    period,
    target,
  }));

  expect(actualTargets).toHaveLength(expectedTargets.length);

  for (let index = 0; index < expectedTargets.length; index += 1) {
    const expected = expectedTargets[index];
    const actual = actualTargets[index];

    expect(actual, `missing pacing target at index ${index}`).toBeDefined();
    expect(actual?.period).toBe(expected?.period);
    assertNumericEqual(
      actual?.target ?? 0,
      expected?.target ?? 0,
      `pacing_targets_by_period[${expected?.period}]`
    );
  }
}

function assertViolations(tc: CATruthCase, output: CAEngineOutput): void {
  expect(output.violations.map((v) => v.type)).toEqual(tc.expected.violations);
}

describe('Capital Allocation Period Truth Cases', () => {
  const periodCases = (capitalCases as CATruthCase[]).filter(
    (tc) => tc.expected.reserve_balance === undefined
  );

  it('covers the 14 dedicated pacing/cohort-period truth cases', () => {
    expect(periodCases.map((tc) => tc.id)).toEqual([
      'CA-007',
      'CA-008',
      'CA-009',
      'CA-010',
      'CA-011',
      'CA-012',
      'CA-013',
      'CA-014',
      'CA-015',
      'CA-016',
      'CA-017',
      'CA-018',
      'CA-019',
      'CA-020',
    ]);
  });

  periodCases.forEach((tc) => {
    it(`${tc.id}: ${tc.description}`, () => {
      const normalizedInput = adaptTruthCaseInput(convertToEngineInput(tc));
      const loopOutput = executePeriodLoop(normalizedInput, { reserveSnapshotMode: 'planning' });
      const output = convertPeriodLoopOutput(normalizedInput, loopOutput);

      assertAllocations(tc, normalizedInput, loopOutput);
      assertReserveSnapshots(tc, normalizedInput, loopOutput);
      assertPacingTargets(tc, output);
      assertViolations(tc, output);
    });
  });
});
