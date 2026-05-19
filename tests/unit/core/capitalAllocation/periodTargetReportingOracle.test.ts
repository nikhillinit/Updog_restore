import { describe, expect, it } from 'vitest';

import {
  adaptTruthCaseInput,
  generatePeriods,
  type TruthCaseInput,
} from '@shared/core/capitalAllocation';
import {
  buildTargetReportingPeriodIds,
  selectAnnualReserveTargetPeriods,
  splitAnnualReserveTargetCents,
} from '@shared/core/capitalAllocation/periodTargetReportingOracle';

type CategoryInput = TruthCaseInput & {
  category: 'reserve_engine' | 'pacing_engine' | 'cohort_engine' | 'integration';
};

type RecyclableDistribution = { date: string; amount: number; recycle_eligible?: boolean };
type RecyclableCategoryInput = Omit<CategoryInput, 'flows'> & {
  flows: {
    contributions: Array<{ date: string; amount: number }>;
    distributions: RecyclableDistribution[];
  };
};

function baseInput(category: CategoryInput['category']): CategoryInput {
  return {
    category,
    fund: {
      commitment: 100_000_000,
      target_reserve_pct: 0.2,
      reserve_policy: 'static_pct',
      pacing_window_months: 24,
      units: 'raw',
    },
    timeline: {
      start_date: '2025-01-01',
      end_date: '2025-06-30',
    },
    flows: {
      contributions: [],
      distributions: [],
    },
    constraints: {
      min_cash_buffer: 1_000_000,
      rebalance_frequency: 'quarterly',
    },
    cohorts: [
      {
        name: 'Core',
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        weight: 1,
      },
    ],
  };
}

describe('period target reporting oracle', () => {
  it('reports contribution and recycle-eligible distribution periods for CA-020-style integration cases', () => {
    const rawInput: RecyclableCategoryInput = {
      ...baseInput('integration'),
      flows: {
        contributions: [{ date: '2025-01-15', amount: 10_000_000 }],
        distributions: [{ date: '2025-04-15', amount: 2_000_000, recycle_eligible: true }],
      },
    };
    const normalized = adaptTruthCaseInput(rawInput);
    const periods = generatePeriods(
      normalized.startDate,
      normalized.endDate,
      normalized.rebalanceFrequency
    );

    expect([...buildTargetReportingPeriodIds(normalized, 'integration', periods)]).toEqual([
      '2025-Q1',
      '2025-Q2',
    ]);
  });

  it('reports contribution period plus immediate next period for pacing carry-forward cases', () => {
    const rawInput: CategoryInput = {
      ...baseInput('pacing_engine'),
      flows: {
        contributions: [{ date: '2025-01-15', amount: 10_000_000 }],
        distributions: [],
      },
    };
    const normalized = adaptTruthCaseInput(rawInput);
    const periods = generatePeriods(
      normalized.startDate,
      normalized.endDate,
      normalized.rebalanceFrequency
    );

    expect([...buildTargetReportingPeriodIds(normalized, 'pacing_engine', periods)]).toEqual([
      '2025-Q1',
      '2025-Q2',
    ]);
  });

  it('selects the first two quarters for annual reserve target reporting', () => {
    expect(selectAnnualReserveTargetPeriods(['2025-Q1', '2025-Q2', '2025-Q3'])).toEqual([
      '2025-Q1',
      '2025-Q2',
    ]);
  });

  it('distributes residual annual reserve target cents to the final quarter', () => {
    expect(splitAnnualReserveTargetCents(101)).toEqual([25, 25, 25, 26]);
  });
});
