import { describe, expect, it } from 'vitest';

import {
  adaptTruthCaseInput,
  executePeriodLoop,
  type TruthCaseInput,
} from '@shared/core/capitalAllocation';

type CategoryInput = TruthCaseInput & {
  category: 'reserve_engine' | 'pacing_engine' | 'cohort_engine' | 'integration';
};

function reserveEngineInput(): CategoryInput {
  return {
    category: 'reserve_engine',
    fund: {
      commitment: 100_000_000,
      target_reserve_pct: 0.2,
      reserve_policy: 'static_pct',
      pacing_window_months: 24,
      units: 'raw',
    },
    timeline: {
      start_date: '2024-01-01',
      end_date: '2024-03-31',
    },
    flows: {
      contributions: [{ date: '2024-01-15', amount: 10_000_000 }],
      distributions: [],
    },
    constraints: {
      min_cash_buffer: 1_000_000,
      rebalance_frequency: 'quarterly',
    },
    cohorts: [
      {
        name: 'Core',
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        weight: 1,
      },
    ],
  };
}

function quarterlyCohortInput(
  contributions: Array<{ date: string; amount: number }>
): CategoryInput {
  return {
    category: 'cohort_engine',
    fund: {
      commitment: 16_000_000,
      target_reserve_pct: 0.15,
      reserve_policy: 'static_pct',
      pacing_window_months: 12,
      units: 'raw',
    },
    timeline: {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    },
    flows: {
      contributions,
      distributions: [],
    },
    constraints: {
      min_cash_buffer: 150_000,
      max_allocation_per_cohort: 0.6,
      rebalance_frequency: 'quarterly',
    },
    cohorts: [
      {
        name: 'Q',
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        weight: 1,
      },
    ],
  };
}

describe('executePeriodLoop reserve snapshot contract', () => {
  it('requires an explicit reserve snapshot mode', () => {
    const normalized = adaptTruthCaseInput(reserveEngineInput());

    expect(() => {
      // @ts-expect-error reserveSnapshotMode is intentionally required.
      executePeriodLoop(normalized);
    }).toThrow('reserveSnapshotMode');
  });

  it('keeps planning reserve snapshots distinct from cash-constrained reserve snapshots', () => {
    const normalized = adaptTruthCaseInput(reserveEngineInput());

    const planning = executePeriodLoop(normalized, { reserveSnapshotMode: 'planning' });
    const cash = executePeriodLoop(normalized, { reserveSnapshotMode: 'cash' });
    const cashFinalPeriod = cash.periods.at(-1);

    expect(cashFinalPeriod).toBeDefined();
    expect(planning.finalReserveBalanceCents).toBe(normalized.effectiveBufferCents);
    expect(cash.finalReserveBalanceCents).toBeLessThan(planning.finalReserveBalanceCents);
    expect(cash.finalReserveBalanceCents).toBe(
      Math.min(
        Math.max(
          0,
          (cashFinalPeriod?.endingCashCents ?? 0) - (cashFinalPeriod?.allocationCents ?? 0)
        ),
        normalized.effectiveBufferCents
      )
    );
  });

  it('accrues quarterly cohort reserve snapshots once per funded quarter', () => {
    const normalized = adaptTruthCaseInput(
      quarterlyCohortInput([
        { date: '2025-02-01', amount: 1_000_000 },
        { date: '2025-03-01', amount: 1_000_000 },
        { date: '2025-06-01', amount: 2_000_000 },
      ])
    );

    const result = executePeriodLoop(normalized, { reserveSnapshotMode: 'planning' });
    const firstQuarter = result.periods.find((period) => period.period.id === '2025-Q1');
    const secondQuarter = result.periods.find((period) => period.period.id === '2025-Q2');

    expect(firstQuarter?.reserveBalanceCents).toBe(normalized.effectiveBufferCents);
    expect(secondQuarter?.reserveBalanceCents).toBe(normalized.effectiveBufferCents * 2);
    expect(result.finalReserveBalanceCents).toBe(normalized.effectiveBufferCents * 2);
  });

  it('does not synthesize a quarterly cohort reserve snapshot before any funded quarter', () => {
    const normalized = adaptTruthCaseInput(
      quarterlyCohortInput([{ date: '2025-06-01', amount: 2_000_000 }])
    );

    const result = executePeriodLoop(normalized, { reserveSnapshotMode: 'planning' });
    const firstQuarter = result.periods.find((period) => period.period.id === '2025-Q1');
    const secondQuarter = result.periods.find((period) => period.period.id === '2025-Q2');

    expect(firstQuarter?.reserveBalanceCents).toBe(0);
    expect(secondQuarter?.reserveBalanceCents).toBe(normalized.effectiveBufferCents);
  });
});
