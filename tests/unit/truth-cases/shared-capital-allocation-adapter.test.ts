import { describe, expect, it } from 'vitest';

import {
  adaptTruthCaseInput,
  convertPeriodLoopOutput,
  executePeriodLoop,
  shouldSkipTruthCase,
  type TruthCaseInput,
} from '@shared/core/capitalAllocation';
import capitalCases from '../../../docs/capital-allocation.truth-cases.json';

type RebalanceFrequency = 'quarterly' | 'monthly' | 'annual';

interface CATruthCase {
  id: string;
  category: string;
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
    allocations_by_cohort: Array<{ cohort: string; amount: number }>;
  };
}

const cases = capitalCases as CATruthCase[];

const previouslyDeferredCaseIds = ['CA-009', 'CA-010', 'CA-012'] as const;

function getTruthCase(id: string): CATruthCase {
  const truthCase = cases.find((tc) => tc.id === id);
  if (!truthCase) {
    throw new Error(`Missing capital-allocation truth case ${id}`);
  }
  return truthCase;
}

function toSharedInput(tc: CATruthCase): TruthCaseInput & { category: string } {
  return {
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
        | RebalanceFrequency
        | undefined,
    },
    timeline: {
      start_date: tc.inputs.timeline.start_date,
      end_date: tc.inputs.timeline.end_date,
    },
    flows: {
      contributions: tc.inputs.flows.contributions,
      distributions: tc.inputs.flows.distributions,
    },
    cohorts: tc.inputs.cohorts?.map((cohort) => ({
      id: cohort.name,
      name: cohort.name,
      start_date: cohort.start_date,
      end_date: cohort.end_date,
      weight: cohort.weight,
    })),
    category: tc.category,
  };
}

function runForcedSharedPeriodLoop(tc: CATruthCase): Array<{ cohort: string; amount: number }> {
  const normalizedInput = adaptTruthCaseInput(toSharedInput(tc));
  const periodLoopResult = executePeriodLoop(normalizedInput);
  const output = convertPeriodLoopOutput(normalizedInput, periodLoopResult);
  return output.allocations_by_cohort.map(({ cohort, amount }) => ({ cohort, amount }));
}

function matchesTruthCaseExpected(
  actual: Array<{ cohort: string; amount: number }>,
  expected: Array<{ cohort: string; amount: number }>
): boolean {
  return expected.every((expectedAllocation) => {
    const actualAllocation = actual.find(
      (allocation) => allocation.cohort === expectedAllocation.cohort
    );
    if (!actualAllocation) return false;

    const tolerance = Math.max(0.01, Math.abs(expectedAllocation.amount) * 0.001);
    return Math.abs(actualAllocation.amount - expectedAllocation.amount) <= tolerance;
  });
}

describe('shared capital-allocation adapter skip policy', () => {
  it('does not defer CA-009, CA-010, or CA-012 on the shared path', () => {
    for (const id of previouslyDeferredCaseIds) {
      const result = shouldSkipTruthCase(id);

      expect(result).toEqual({ skip: false });
    }
  });

  it('does not defer the CA-001 control case', () => {
    expect(shouldSkipTruthCase('CA-001', 'static_pct')).toEqual({ skip: false });
  });

  it('documents forced-inclusion evidence for previously deferred pacing cases', () => {
    for (const id of previouslyDeferredCaseIds) {
      const truthCase = getTruthCase(id);
      const actual = runForcedSharedPeriodLoop(truthCase);

      expect(matchesTruthCaseExpected(actual, truthCase.expected.allocations_by_cohort)).toBe(true);
    }
  });
});
