import { describe, expect, it } from 'vitest';

import {
  adaptTruthCaseInput,
  executePeriodLoop,
  type PeriodLoopOptions,
  type TruthCaseInput,
} from '@shared/core/capitalAllocation';

type CategoryInput = TruthCaseInput & {
  category: 'reserve_engine' | 'pacing_engine' | 'cohort_engine' | 'integration';
};

type PeriodLoopResult = ReturnType<typeof executePeriodLoop>;
type PeriodSnapshot = PeriodLoopResult['periods'][number];

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

function multiPeriodReserveEngineInput(): CategoryInput {
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
      end_date: '2024-06-30',
    },
    flows: {
      contributions: [
        { date: '2024-01-15', amount: 10_000_000 },
        { date: '2024-04-15', amount: 8_000_000 },
      ],
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

function integrationInputWithRecycling(): CategoryInput {
  return {
    category: 'integration',
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
      distributions: [{ date: '2024-02-15', amount: 2_000_000, recycle_eligible: true }],
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

function pacingEngineInputWithoutPipeline(): CategoryInput {
  return {
    category: 'pacing_engine',
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
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        weight: 1,
      },
    ],
  };
}

function findPeriod(result: PeriodLoopResult, periodId: string): PeriodSnapshot {
  const period = result.periods.find((snapshot) => snapshot.period.id === periodId);

  if (!period) {
    throw new Error(`Expected period ${periodId} to exist`);
  }

  return period;
}

describe('executePeriodLoop reserve snapshot contract', () => {
  it('requires an explicit reserve snapshot mode', () => {
    const normalized = adaptTruthCaseInput(reserveEngineInput());

    expect(() => {
      // @ts-expect-error reserveSnapshotMode is intentionally required.
      executePeriodLoop(normalized);
    }).toThrow('reserveSnapshotMode');
  });

  it('rejects missing reserve snapshot mode from malformed runtime options', () => {
    const normalized = adaptTruthCaseInput(reserveEngineInput());

    expect(() => {
      executePeriodLoop(normalized, {} as unknown as PeriodLoopOptions);
    }).toThrow('reserveSnapshotMode');
  });

  it('rejects invalid reserve snapshot mode from malformed runtime options', () => {
    const normalized = adaptTruthCaseInput(reserveEngineInput());

    expect(() => {
      executePeriodLoop(normalized, {
        reserveSnapshotMode: 'typo',
      } as unknown as PeriodLoopOptions);
    }).toThrow('reserveSnapshotMode');
  });

  it('keeps planning reserve snapshots distinct from cash-constrained reserve snapshots', () => {
    const normalized = adaptTruthCaseInput(reserveEngineInput());

    const planning = executePeriodLoop(normalized, { reserveSnapshotMode: 'planning' });
    const cash = executePeriodLoop(normalized, { reserveSnapshotMode: 'cash' });
    const cashFinalPeriod = cash.periods.at(-1);

    expect(cashFinalPeriod).toBeDefined();
    if (!cashFinalPeriod) {
      throw new Error('Expected cash mode to produce at least one period');
    }

    expect(planning.finalReserveBalanceCents).toBe(normalized.effectiveBufferCents);
    expect(cash.finalReserveBalanceCents).toBeLessThan(planning.finalReserveBalanceCents);
    expect(cash.finalReserveBalanceCents).toBe(
      Math.min(
        Math.max(0, cashFinalPeriod.endingCashCents - cashFinalPeriod.allocationCents),
        normalized.effectiveBufferCents
      )
    );
  });

  it('subtracts cumulative allocations from multi-period cash reserve snapshots', () => {
    const normalized = adaptTruthCaseInput(multiPeriodReserveEngineInput());

    const cash = executePeriodLoop(normalized, { reserveSnapshotMode: 'cash' });
    const finalPeriod = cash.periods.at(-1);

    expect(cash.periods.filter((period) => period.allocationCents > 0)).toHaveLength(2);
    expect(finalPeriod).toBeDefined();
    if (!finalPeriod) {
      throw new Error('Expected cash mode to produce a final period');
    }

    const finalPeriodOnlyAllocationReserve = Math.min(
      Math.max(0, finalPeriod.endingCashCents - finalPeriod.allocationCents),
      normalized.effectiveBufferCents
    );
    const expectedCumulativeAllocationReserve = Math.min(
      Math.max(0, finalPeriod.endingCashCents - cash.totalAllocationCents),
      normalized.effectiveBufferCents
    );

    expect(cash.totalAllocationCents).toBe(
      cash.periods.reduce((sum, period) => sum + period.allocationCents, 0)
    );
    expect(cash.finalReserveBalanceCents).toBe(expectedCumulativeAllocationReserve);
    expect(cash.finalReserveBalanceCents).toBeLessThan(finalPeriodOnlyAllocationReserve);
  });

  it('accrues quarterly cohort reserve snapshots once per funded quarter', () => {
    const normalized = adaptTruthCaseInput(
      quarterlyCohortInput([
        { date: '2025-05-01', amount: 1_000_000 },
        { date: '2025-06-01', amount: 1_000_000 },
        { date: '2025-09-01', amount: 2_000_000 },
      ])
    );

    const result = executePeriodLoop(normalized, { reserveSnapshotMode: 'planning' });

    expect(findPeriod(result, '2025-Q1').reserveBalanceCents).toBe(0);
    expect(findPeriod(result, '2025-Q2').reserveBalanceCents).toBe(normalized.effectiveBufferCents);
    expect(findPeriod(result, '2025-Q3').reserveBalanceCents).toBe(
      normalized.effectiveBufferCents * 2
    );
    expect(result.finalReserveBalanceCents).toBe(normalized.effectiveBufferCents * 2);
  });

  it('does not synthesize a quarterly cohort reserve snapshot before any funded quarter', () => {
    const normalized = adaptTruthCaseInput(
      quarterlyCohortInput([{ date: '2025-09-01', amount: 2_000_000 }])
    );

    const result = executePeriodLoop(normalized, { reserveSnapshotMode: 'planning' });
    const firstFunding = normalized.contributionsCents[0];

    if (!firstFunding) {
      throw new Error('Expected test input to include a first funding contribution');
    }

    const firstFundedPeriodIndex = result.periods.findIndex(
      (snapshot) =>
        firstFunding.date >= snapshot.period.startDate &&
        firstFunding.date <= snapshot.period.endDate
    );

    if (firstFundedPeriodIndex === -1) {
      throw new Error(`Expected a period containing first funding date ${firstFunding.date}`);
    }

    const periodsBeforeFirstFunding = result.periods.slice(0, firstFundedPeriodIndex);
    const firstFundedPeriod = result.periods[firstFundedPeriodIndex];

    for (const period of periodsBeforeFirstFunding) {
      expect(period.reserveBalanceCents).toBe(0);
    }

    expect(firstFundedPeriod?.reserveBalanceCents).toBe(normalized.effectiveBufferCents);
  });

  it('marks integration processing signals as events without splitting violations', () => {
    const normalized = adaptTruthCaseInput(integrationInputWithRecycling());

    const result = executePeriodLoop(normalized, { reserveSnapshotMode: 'planning' });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'reserve_floor_precedence_over_pacing',
          kind: 'event',
        }),
        expect.objectContaining({
          type: 'recycling_applied',
          kind: 'event',
        }),
      ])
    );
  });

  it('keeps constraint-like period signals as constraints by default', () => {
    const normalized = adaptTruthCaseInput(pacingEngineInputWithoutPipeline());

    const result = executePeriodLoop(normalized, { reserveSnapshotMode: 'planning' });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'pacing_floor_triggered_no_pipeline',
          kind: 'constraint',
        }),
      ])
    );
  });
});
